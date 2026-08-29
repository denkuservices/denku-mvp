import "server-only";

import { resend } from "@/lib/email/resend";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  resolveSendIdentity,
  resolveThreadHeaders,
  formatFrom,
  angle,
} from "@/lib/email/channel/sending";
import type { ReplyTransport, TransportResult, TransportTarget } from "@/lib/platform/reply/types";

/**
 * Email's outbound half: turn a string into a reply inside an existing mail thread.
 *
 * Three things make this unlike Telegram's transport, and all three are the medium, not the code:
 *
 * 1. **It can legitimately refuse.** Sending as `info@theirshop.com` requires their DNS to carry
 *    our DKIM key. Until it does, this returns `{ ok: false }` — it never falls back to a Denku
 *    address, because a customer receiving a reply from a domain their supplier does not own is
 *    worse than a reply that waits.
 * 2. **Threading is a header contract.** `In-Reply-To` and `References` are what put the answer
 *    under the customer's own message instead of beside it.
 * 3. **It marks itself as automated.** `Auto-Submitted: auto-replied` is how the other side's
 *    out-of-office knows not to answer back — the loop guard's outbound half. Its inbound half
 *    lives in `adapters/email.ts#isAutomatedEmail`.
 *
 * `indicateTyping` is deliberately not implemented: email has no such notion, and the interface
 * makes it optional precisely so a channel can decline.
 */
export const emailTransport: ReplyTransport = {
  channel: "email",

  async sendText(target: TransportTarget, text: string): Promise<TransportResult> {
    if (!resend) {
      console.error("[EMAIL][SEND][NOT_CONFIGURED]");
      return { ok: false, error: "Email sending is not configured." };
    }

    const sender = await resolveSendIdentity(target.connectionId);
    if (!sender.ok) {
      console.warn("[EMAIL][SEND][REFUSED]", {
        conversation_id: target.conversationId,
        reason: sender.reason,
      });
      return { ok: false, error: sender.error };
    }

    const [headers, recipient] = await Promise.all([
      resolveThreadHeaders(target.orgId, target.conversationId),
      recipientFor(target),
    ]);

    if (!recipient) {
      console.error("[EMAIL][SEND][NO_RECIPIENT]", { conversation_id: target.conversationId });
      return { ok: false, error: "This conversation has no reply address." };
    }

    const mailHeaders: Record<string, string> = {
      // RFC 3834. Tells the recipient's autoresponder that answering this would be a loop.
      "Auto-Submitted": "auto-replied",
    };
    if (headers.inReplyTo) mailHeaders["In-Reply-To"] = angle(headers.inReplyTo);
    if (headers.references.length > 0) {
      mailHeaders["References"] = headers.references.map(angle).join(" ");
    }

    try {
      const sent = await resend.emails.send({
        from: formatFrom(sender.identity),
        to: recipient,
        replyTo: sender.identity.replyTo ?? undefined,
        subject: headers.subject,
        // Plain text only, matching what the Inbox stores and renders. An HTML reply would look
        // richer and would immediately diverge from the record of what was said.
        text,
        headers: mailHeaders,
      });

      if (sent.error || !sent.data) {
        console.error("[EMAIL][SEND][FAILED]", {
          conversation_id: target.conversationId,
          error: sent.error?.message,
        });
        return { ok: false, error: sent.error?.message ?? "The email could not be delivered." };
      }

      /**
       * Resend's id is not the RFC Message-ID, but it is globally unique and it is what a
       * redelivery would carry, which is all `messages.external_message_id` needs to keep the
       * append idempotent.
       */
      return { ok: true, externalMessageId: sent.data.id };
    } catch (err) {
      console.error("[EMAIL][SEND][ERROR]", err instanceof Error ? err.message : String(err));
      return { ok: false, error: "The email could not be delivered." };
    }
  },
};

/**
 * Who the reply goes to.
 *
 * NOT the thread id — that is a Message-ID, not an address. The recipient is the contact this
 * conversation is with, recorded by the adapter as the conversation's `external_user_id` and on
 * every inbound message's meta.
 */
async function recipientFor(target: TransportTarget): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("conversations")
      .select("external_user_id")
      .eq("id", target.conversationId)
      .eq("org_id", target.orgId)
      .maybeSingle<{ external_user_id: string | null }>();

    if (data?.external_user_id) return data.external_user_id;

    const { data: inbound } = await supabaseAdmin
      .from("messages")
      .select("meta")
      .eq("conversation_id", target.conversationId)
      .eq("org_id", target.orgId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ meta: Record<string, unknown> | null }>();

    const from = (inbound?.meta as { email_from?: unknown } | null)?.email_from;
    return typeof from === "string" && from ? from : null;
  } catch (err) {
    console.error("[EMAIL][SEND][RECIPIENT][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}
