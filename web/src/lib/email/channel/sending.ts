import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getConnectionById } from "@/lib/email/channel/connections";
import { addressBelongsToDomain } from "@/lib/email/channel/rules";

export { formatFrom, replySubject, angle } from "@/lib/email/channel/rules";
import { replySubject } from "@/lib/email/channel/rules";
import type { SendIdentity } from "@/lib/email/channel/rules";
export type { SendIdentity } from "@/lib/email/channel/rules";

/**
 * Everything needed to send one reply as the business.
 *
 * Deliberately NOT built on `lib/email/senders.ts`. That module resolves Denku's own identity —
 * its `SenderKind` is a fixed `auth | notify | welcome` union and every path falls back to a
 * `denku.io` default. Reusing it here would mean a customer's reply arriving from
 * `notifications@denku.io`, which is the exact over-claim the honesty rules forbid, and the
 * fallback would make it happen silently. Channel sending gets its own resolver so that
 * "we cannot send yet" is a return value, never a wrong From line.
 */

export interface ThreadHeaders {
  subject: string;
  inReplyTo: string | null;
  references: string[];
}

export type SenderResolution =
  | { ok: true; identity: SendIdentity }
  | { ok: false; reason: "no_connection" | "domain_unverified" | "no_from_address"; error: string };

/**
 * Resolve who a reply is sent as — or refuse.
 *
 * The refusal is the point. Three independent things must hold: the connection exists, its
 * domain is verified BY THE PROVIDER (not by us assuming), and the From address actually lives
 * inside that domain. The third is not paranoia: `from_address` and `sending_domain` are two
 * columns, and nothing stops a later edit leaving an address behind on a domain that changed.
 */
export async function resolveSendIdentity(connectionId: string | null): Promise<SenderResolution> {
  if (!connectionId) {
    return { ok: false, reason: "no_connection", error: "This conversation has no email connection." };
  }

  const connection = await getConnectionById(connectionId);
  if (!connection) {
    return { ok: false, reason: "no_connection", error: "This conversation has no email connection." };
  }

  if (connection.sendingDomainStatus !== "verified" || !connection.sendingDomain) {
    return {
      ok: false,
      reason: "domain_unverified",
      error: "Verify your sending domain before replying by email.",
    };
  }

  /**
   * Default to the address the customer already writes to.
   *
   * Their customers know `info@theirshop.com` and will reply to it — which forwards straight
   * back to us, closing the loop. An arbitrary new address would break that round trip.
   */
  const fromAddress = connection.fromAddress ?? connection.forwardFromAddress;
  if (!fromAddress || !addressBelongsToDomain(fromAddress, connection.sendingDomain)) {
    return {
      ok: false,
      reason: "no_from_address",
      error: "Your reply address is not inside your verified domain.",
    };
  }

  return {
    ok: true,
    identity: {
      fromName: connection.fromName,
      fromAddress,
      replyTo: fromAddress,
    },
  };
}

/**
 * Build the headers that put our reply INSIDE the customer's existing thread.
 *
 * Without `In-Reply-To` and `References` the reply arrives in their client as a brand-new
 * conversation sitting next to the one they wrote — which reads as an unrelated message from a
 * company that ignored them. This is the single most visible difference between email and every
 * other channel Denku answers on.
 */
export async function resolveThreadHeaders(
  orgId: string,
  conversationId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<ThreadHeaders> {
  const fallback: ThreadHeaders = { subject: replySubject(null), inReplyTo: null, references: [] };

  try {
    const [{ data: conversation }, { data: lastInbound }] = await Promise.all([
      db
        .from("conversations")
        .select("meta, external_thread_id")
        .eq("id", conversationId)
        .eq("org_id", orgId)
        .maybeSingle<{ meta: Record<string, unknown> | null; external_thread_id: string | null }>(),
      // The message we are answering — its Message-ID is what `In-Reply-To` must name.
      db
        .from("messages")
        .select("external_message_id, meta")
        .eq("conversation_id", conversationId)
        .eq("org_id", orgId)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ external_message_id: string | null; meta: Record<string, unknown> | null }>(),
    ]);

    const meta = conversation?.meta ?? {};
    const subject = replySubject(typeof meta.subject === "string" ? meta.subject : null);

    const inReplyTo = lastInbound?.external_message_id ?? null;

    /**
     * The References chain: the thread root, whatever the last message carried, then the message
     * we are replying to. De-duplicated and root-first, which is the order every client expects.
     */
    const chain: string[] = [];
    const root = conversation?.external_thread_id ?? null;
    if (root) chain.push(root);

    const priorRefs = (lastInbound?.meta as { email_references?: unknown } | null)?.email_references;
    if (Array.isArray(priorRefs)) {
      for (const ref of priorRefs) if (typeof ref === "string") chain.push(ref);
    }
    if (inReplyTo) chain.push(inReplyTo);

    return { subject, inReplyTo, references: Array.from(new Set(chain)) };
  } catch (err) {
    console.error("[EMAIL][THREAD][HEADERS][ERROR]", err instanceof Error ? err.message : String(err));
    return fallback;
  }
}

