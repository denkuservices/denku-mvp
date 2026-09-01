import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { resend } from "./resend";
import { resolveSender, type SenderKind } from "./senders";

/**
 * Send-exactly-once for transactional email.
 *
 * Every mail added in this change hangs off something that can fire twice — Stripe
 * redelivers webhooks, activation resumes from partial, crons re-run. The codebase
 * already solves this twice (the conditional-UPDATE claim on `welcome_email_sent_at`,
 * and `notified_at` on artifacts); this is the same protocol against a shared ledger
 * (`email_dispatch_log`) so a new email kind needs no new column.
 *
 * Protocol: CLAIM (insert (kind, dedupe_key)) → SEND → RELEASE on failure.
 * Claiming first can lose a mail if the process dies mid-send; sending first can
 * duplicate one. Transactional mail prefers the loss — a retry recovers it, whereas a
 * duplicate receipt cannot be recalled.
 *
 * NEVER THROWS. Email is best-effort by design: a failed send must not fail the payment
 * webhook, the activation, or the password change that triggered it.
 */

/** The mail estate, one value per template that sends through this path. */
export type EmailKind =
  | "plan_activated"
  | "payment_receipt"
  | "payment_failed"
  | "subscription_canceled"
  | "addon_changed"
  | "ai_live"
  | "workspace_resumed"
  | "password_changed";

export interface SendOnceParams {
  kind: EmailKind;
  /**
   * The event's stable identity — a Stripe invoice id, `${orgId}:${status}`, an org id.
   * Never a timestamp: a key that changes every call deduplicates nothing.
   */
  dedupeKey: string;
  to: string;
  subject: string;
  html: string;
  orgId?: string | null;
  /** Which verified sender stream to use. Defaults to `notify`. */
  sender?: SenderKind;
}

export type SendOnceResult =
  | { ok: true; sent: true }
  | { ok: true; sent: false; reason: "duplicate" | "not_configured" | "no_recipient" }
  | { ok: false; sent: false; error: string };

/**
 * Claim the right to send. Returns false when someone already holds it.
 *
 * A unique-violation (Postgres 23505 / PostgREST "duplicate key") is the expected,
 * non-exceptional answer here — it means the mail already went out. Any OTHER error is
 * treated as "do not send": if we cannot record the claim we cannot guarantee once-only
 * delivery, and silence is the safer failure for billing mail.
 */
async function claim(params: {
  kind: EmailKind;
  dedupeKey: string;
  orgId?: string | null;
  recipient: string;
}): Promise<{ claimed: boolean; duplicate: boolean; error?: string }> {
  const { error } = await supabaseAdmin.from("email_dispatch_log").insert({
    kind: params.kind,
    dedupe_key: params.dedupeKey,
    org_id: params.orgId ?? null,
    recipient: params.recipient,
  });

  if (!error) return { claimed: true, duplicate: false };

  const code = (error as { code?: string }).code;
  const message = error.message || "";
  if (code === "23505" || /duplicate key/i.test(message)) {
    return { claimed: false, duplicate: true };
  }

  return { claimed: false, duplicate: false, error: message };
}

/** Give the claim back so a later delivery of the same event can retry the send. */
async function release(kind: EmailKind, dedupeKey: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("email_dispatch_log")
    .delete()
    .eq("kind", kind)
    .eq("dedupe_key", dedupeKey);

  if (error) {
    // Worst case the mail is never retried — logged so it is at least visible.
    console.error("[EMAIL][DISPATCH][RELEASE_FAILED]", { kind, dedupeKey, error: error.message });
  }
}

export async function sendOnce(params: SendOnceParams): Promise<SendOnceResult> {
  const { kind, dedupeKey, to, subject, html, orgId, sender = "notify" } = params;

  try {
    const recipient = (to || "").trim();
    if (!recipient) return { ok: true, sent: false, reason: "no_recipient" };

    if (!resend) {
      console.log("[EMAIL][DISPATCH][SKIPPED] RESEND_API_KEY not configured", { kind });
      return { ok: true, sent: false, reason: "not_configured" };
    }

    const claimed = await claim({ kind, dedupeKey, orgId, recipient });
    if (claimed.duplicate) {
      console.log("[EMAIL][DISPATCH][DUPLICATE]", { kind, dedupeKey });
      return { ok: true, sent: false, reason: "duplicate" };
    }
    if (!claimed.claimed) {
      console.error("[EMAIL][DISPATCH][CLAIM_FAILED]", { kind, dedupeKey, error: claimed.error });
      return { ok: false, sent: false, error: claimed.error ?? "claim failed" };
    }

    const { error } = await resend.emails.send({
      from: resolveSender(sender),
      to: recipient,
      subject,
      html,
    });

    if (error) {
      await release(kind, dedupeKey);
      console.error("[EMAIL][DISPATCH][SEND_FAILED]", { kind, dedupeKey, error: error.message });
      return { ok: false, sent: false, error: error.message };
    }

    console.log("[EMAIL][DISPATCH][SENT]", { kind, dedupeKey, org_id: orgId ?? null });
    return { ok: true, sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Best effort: try to hand the claim back, then swallow. The caller is a webhook.
    try {
      await release(kind, dedupeKey);
    } catch {
      /* already logged inside release */
    }
    console.error("[EMAIL][DISPATCH][EXCEPTION]", { kind: params.kind, error: message });
    return { ok: false, sent: false, error: message };
  }
}
