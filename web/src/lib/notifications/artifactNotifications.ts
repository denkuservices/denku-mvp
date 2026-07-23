import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/utils/url";
import { sendArtifactNotificationEmail } from "@/lib/email/send";
import {
  artifactNotificationTemplate,
  type ArtifactKind,
} from "@/lib/email/templates/artifactNotification";

/**
 * R-008 — Notify the workspace owner when the AI captures a new ticket/appointment.
 *
 * Design principles (match the codebase's established discipline):
 * - IDEMPOTENT: each artifact carries `notified_at`; we atomically CLAIM a send via a
 *   conditional UPDATE (…WHERE notified_at IS NULL) — exactly the welcome-email lock —
 *   so redelivered webhook events never double-email. On send failure we RESET the
 *   marker so a later delivery retries.
 * - COVERS BOTH PATHS: the sweep runs at end-of-call after tool-created AND
 *   deterministic artifacts are persisted, catching any un-notified artifact for the call.
 * - NEVER THROWS: email is best-effort; a failure must never break call finalization.
 * - STAGED / SAFE: gated by `ARTIFACT_NOTIFICATIONS_ENABLED` (default OFF). Enable ONLY
 *   after (a) the Vapi webhook is `VAPI_WEBHOOK_AUTH_MODE=enforce` (R-001) so events
 *   aren't forgeable, and (b) `denku.io` deliverability is confirmed. Mirrors the
 *   Sprint-1 stage-then-enforce pattern.
 */

type Env = Record<string, string | undefined>;

/** Whether artifact notifications are enabled. Default OFF (staged rollout). */
export function artifactNotificationsEnabled(env: Env = process.env): boolean {
  return (env.ARTIFACT_NOTIFICATIONS_ENABLED ?? "").toLowerCase().trim() === "true";
}

/**
 * Choose the recipient for artifact notifications. Pure.
 * Prefers the explicit workspace billing/contact email, falls back to the owner's
 * profile email. Returns null when the org has opted out or no address is known.
 */
export function pickNotificationRecipient(input: {
  billingEmail?: string | null;
  ownerEmail?: string | null;
  notifyOnArtifacts?: boolean | null;
}): string | null {
  if (input.notifyOnArtifacts === false) return null;
  const candidate = (input.billingEmail || input.ownerEmail || "").trim();
  return candidate.length > 0 ? candidate : null;
}

/** Mask a phone for display (first 4 + last 2), consistent with the log-masking spirit. */
function maskPhoneForDisplay(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (trimmed.length <= 6) return trimmed;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-2)}`;
}

function cleanSnippet(text: string | null | undefined): string | null {
  if (!text) return null;
  // Drop the internal deterministic marker line if present.
  const cleaned = text.replace(/\n?\[System\] created_by=deterministic/g, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

interface Recipient {
  email: string;
  orgName: string | null;
  callerPhone: string | null;
}

/** Resolve the notification recipient + context for an org. Returns null to skip. */
async function resolveRecipient(orgId: string, callId: string): Promise<Recipient | null> {
  // Settings: billing email + opt-out flag.
  const { data: settings } = await supabaseAdmin
    .from("organization_settings")
    .select("billing_email, notify_on_artifacts")
    .eq("org_id", orgId)
    .maybeSingle<{ billing_email: string | null; notify_on_artifacts: boolean | null }>();

  // Owner profile email (fallback recipient).
  const { data: owner } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle<{ email: string | null }>();

  const email = pickNotificationRecipient({
    billingEmail: settings?.billing_email,
    ownerEmail: owner?.email,
    notifyOnArtifacts: settings?.notify_on_artifacts,
  });
  if (!email) return null;

  // Org name (greeting) + caller phone (from the call) — best-effort, non-blocking.
  const { data: org } = await supabaseAdmin
    .from("orgs")
    .select("name")
    .eq("id", orgId)
    .maybeSingle<{ name: string | null }>();

  const { data: call } = await supabaseAdmin
    .from("calls")
    .select("from_phone")
    .eq("id", callId)
    .eq("org_id", orgId)
    .maybeSingle<{ from_phone: string | null }>();

  return {
    email,
    orgName: org?.name ?? null,
    callerPhone: call?.from_phone ?? null,
  };
}

/**
 * Claim a single artifact's notification slot (atomic) and send if claimed.
 * Returns silently on any failure (never throws); resets the marker so a retry can send.
 */
async function claimAndSend(params: {
  table: "tickets" | "appointments";
  id: string;
  orgId: string;
  recipient: string;
  kind: ArtifactKind;
  title: string;
  caller: string | null;
  snippet: string | null;
  orgName: string | null;
  deepLink: string;
}): Promise<void> {
  const { table, id, orgId } = params;

  // Atomic claim: only proceeds if this row was NOT already notified.
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from(table)
    .update({ notified_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .is("notified_at", null)
    .select("id")
    .maybeSingle();

  if (claimErr) {
    console.error("[ARTIFACT_NOTIFY] Claim failed", { table, id, error: claimErr.message });
    return;
  }
  if (!claimed) return; // Already notified by a concurrent/previous delivery.

  const { subject, html } = artifactNotificationTemplate({
    kind: params.kind,
    title: params.title,
    caller: params.caller,
    snippet: params.snippet,
    deepLink: params.deepLink,
    orgName: params.orgName,
  });

  const result = await sendArtifactNotificationEmail(params.recipient, { subject, html });

  if (!result.ok) {
    // Release the claim so a later webhook delivery can retry the send.
    await supabaseAdmin
      .from(table)
      .update({ notified_at: null })
      .eq("id", id)
      .eq("org_id", orgId);
    console.error("[ARTIFACT_NOTIFY] Send failed; released claim", { table, id, error: result.error });
    return;
  }

  console.log("[ARTIFACT_NOTIFY] Sent", { table, id, orgId });
}

/**
 * Sweep a call's newly-created artifacts and email the owner about each once.
 * Safe to call on every end-of-call delivery. Never throws.
 */
export async function notifyNewArtifactsForCall(callId: string, orgId: string): Promise<void> {
  try {
    if (!artifactNotificationsEnabled()) return;
    if (!callId || !orgId) return;

    const recipient = await resolveRecipient(orgId, callId);
    if (!recipient) return;

    const deepBase = getBaseUrl();

    // Un-notified tickets for this call.
    const { data: tickets } = await supabaseAdmin
      .from("tickets")
      .select("id, subject, requester_name, requester_phone, description")
      .eq("call_id", callId)
      .eq("org_id", orgId)
      .is("notified_at", null);

    for (const t of tickets ?? []) {
      await claimAndSend({
        table: "tickets",
        id: t.id,
        orgId,
        recipient: recipient.email,
        kind: "ticket",
        title: t.subject || "New ticket",
        caller: t.requester_name || maskPhoneForDisplay(t.requester_phone),
        snippet: cleanSnippet(t.description),
        orgName: recipient.orgName,
        deepLink: `${deepBase}/dashboard/tickets/${t.id}`,
      });
    }

    // Un-notified appointments for this call.
    const { data: appointments } = await supabaseAdmin
      .from("appointments")
      .select("id, notes, status")
      .eq("call_id", callId)
      .eq("org_id", orgId)
      .is("notified_at", null);

    for (const a of appointments ?? []) {
      await claimAndSend({
        table: "appointments",
        id: a.id,
        orgId,
        recipient: recipient.email,
        kind: "appointment",
        title: "Appointment request",
        caller: maskPhoneForDisplay(recipient.callerPhone),
        snippet: cleanSnippet(a.notes),
        orgName: recipient.orgName,
        // No appointment detail route exists yet — link to the list.
        deepLink: `${deepBase}/dashboard/appointments`,
      });
    }
  } catch (err) {
    console.error("[ARTIFACT_NOTIFY] Exception in notifyNewArtifactsForCall (non-fatal):", {
      callId,
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Never throw — call finalization must continue.
  }
}
