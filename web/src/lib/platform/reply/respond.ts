import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Channel } from "@/lib/platform/channels";
import { appendMessage } from "@/lib/platform/conversations";
import { canReplyOn, getTransport } from "@/lib/platform/transports/registry";
import { contactDisplayName, loadHistory, resolveReplyEmployee } from "@/lib/platform/reply/employee";
import { generateReply } from "@/lib/platform/reply/engine";
import { greetingFor, isOpeningCommand } from "@/lib/platform/reply/greeting";
import { notifyNewArtifactsForConversation } from "@/lib/notifications/artifactNotifications";
import { getHandlingState } from "@/lib/platform/handling";
import type { ReplyResult } from "@/lib/platform/reply/types";

/**
 * One inbound message in, one answer out — for any chat channel.
 *
 * This is the function a channel webhook calls after `ingestInboundMessage` has recorded what
 * the customer said. It owns the ORDER of things, and the order is the whole design:
 *
 *   1. **Send before storing.** If we stored the reply first and the send then failed, the
 *      owner's Inbox would show a message their customer never received — the one kind of lie
 *      a shared inbox must not tell. Storing after means the rarer, milder failure: the customer
 *      has the reply and our record is incomplete, which is logged and visible.
 *   2. **The outbound message carries the provider's own id**, so a redelivered update cannot
 *      produce a second copy of the same reply in the thread.
 *   3. **Artifacts notify after the customer is answered.** The owner's email is important; it
 *      is not more important than the person waiting for a sentence.
 *
 * Never throws. A chat webhook that throws makes the provider retry the same update forever.
 */

export interface RespondInput {
  orgId: string;
  channel: Channel;
  conversationId: string;
  contactId: string | null;
  /** Channel-native destination (a Telegram chat id). */
  threadId: string;
  /** Which of the org's connections to answer through. */
  connectionId: string | null;
  /** The AI Employee assigned to this connection, when there is one. */
  agentId: string | null;
  /** What the customer just said. */
  incoming: string;
  db?: SupabaseClient;
}

export async function respondToInbound(input: RespondInput): Promise<ReplyResult> {
  const db = input.db ?? supabaseAdmin;
  const silent: ReplyResult = { ok: false, text: null, artifacts: [] };

  try {
    if (!canReplyOn(input.channel)) return { ...silent, reason: "channel_cannot_reply" };
    const transport = getTransport(input.channel);
    if (!transport) return { ...silent, reason: "no_transport" };

    /**
     * A person has this conversation — the AI does not speak over them.
     *
     * Without this check, an owner who takes over from the Inbox would be answering a customer at
     * the same time as their own AI, seconds apart, possibly contradicting each other. That is the
     * failure that makes a shared inbox worse than no shared inbox, and it costs one read to
     * avoid. The customer's own opt-out from automated handling is honoured here too, for the same
     * one read.
     *
     * Handing back is deliberate, from the takeover control — never automatic on a timer, because
     * "the human went quiet" and "the human is done" look identical from here.
     */
    const [handling, employee] = await Promise.all([
      getHandlingState(input.orgId, input.conversationId, db),
      // Resolved alongside the handling check rather than after it: they ask different tables and
      // neither answer depends on the other, so waiting for the first before starting the second
      // was a round trip spent on nothing.
      resolveReplyEmployee(input.orgId, input.agentId, db),
    ]);

    if (handling.handling === "human") {
      console.info("[REPLY][HELD][HUMAN]", { org_id: input.orgId, conversation_id: input.conversationId });
      return { ...silent, reason: "human_handling" };
    }
    if (handling.automationOptedOut) {
      console.info("[REPLY][HELD][OPTED_OUT]", { org_id: input.orgId, conversation_id: input.conversationId });
      return { ...silent, reason: "automation_opted_out" };
    }

    if (!employee) return { ...silent, reason: "no_employee" };

    const target = {
      orgId: input.orgId,
      conversationId: input.conversationId,
      threadId: input.threadId,
      connectionId: input.connectionId,
    };

    // Fire and forget: the customer should see "typing…" while the model works, and a failed
    // courtesy must never delay the actual answer.
    void transport.indicateTyping?.(target);

    const [history, contactName] = await Promise.all([
      loadHistory(input.orgId, input.conversationId, 20, db),
      contactDisplayName(input.orgId, input.contactId, db),
    ]);

    // "I just opened this bot" is answered with the greeting, not with a model. See greeting.ts —
    // in the first live test /start produced silence, which is what a new customer saw first.
    const result: ReplyResult = isOpeningCommand(input.incoming)
      ? { ok: true, text: greetingFor(employee, contactName), artifacts: [] }
      : await generateReply(
          {
            orgId: input.orgId,
            conversationId: input.conversationId,
            contactId: input.contactId,
            channel: input.channel,
            employee,
            history,
            incoming: input.incoming,
            contactName,
          },
          db
        );

    if (!result.text) {
      console.warn("[REPLY][SILENT]", {
        org_id: input.orgId,
        channel: input.channel,
        conversation_id: input.conversationId,
        reason: result.reason,
      });
      return result;
    }

    const sent = await transport.sendText(target, result.text);
    if (!sent.ok) {
      console.error("[REPLY][SEND][FAILED]", {
        org_id: input.orgId,
        channel: input.channel,
        conversation_id: input.conversationId,
        error: sent.error,
      });
      return { ...result, ok: false, reason: "send_failed" };
    }

    await appendMessage(
      {
        orgId: input.orgId,
        conversationId: input.conversationId,
        role: "assistant",
        direction: "outbound",
        content: result.text,
        externalMessageId: sent.externalMessageId ?? null,
        meta: { generated: true, artifacts: result.artifacts },
      },
      db
    );

    if (result.artifacts.length > 0) {
      await notifyNewArtifactsForConversation(input.conversationId, input.orgId);
    }

    console.info("[REPLY][SENT]", {
      org_id: input.orgId,
      channel: input.channel,
      conversation_id: input.conversationId,
      artifacts: result.artifacts.map((a) => a.type),
    });

    return { ...result, ok: true };
  } catch (err) {
    console.error("[REPLY][ERROR]", err instanceof Error ? err.message : String(err));
    return { ...silent, reason: "unhandled" };
  }
}
