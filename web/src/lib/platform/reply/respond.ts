import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Channel } from "@/lib/platform/channels";
import { appendMessage } from "@/lib/platform/conversations";
import { canReplyOn, getTransport } from "@/lib/platform/transports/registry";
import { contactDisplayName, loadHistory, resolveReplyEmployee } from "@/lib/platform/reply/employee";
import { generateReply } from "@/lib/platform/reply/engine";
import { greetingFor, isOpeningCommand } from "@/lib/platform/reply/greeting";
import { rescueFailedReply, shouldRescue } from "@/lib/platform/reply/fallback";
import { resolveRecall, recallForStatedName, recallPromptBlock } from "@/lib/platform/recall";
import { saveDraft } from "@/lib/platform/drafts";
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
  /**
   * Whether the AI may send by itself, or only write.
   *
   * Defaults to `"auto"` so every existing caller (Telegram) is unchanged. Email passes
   * `"draft"` unless the business has opted into auto-send, because an email reply is a record:
   * kept, forwarded, sometimes legally meaningful, and never retractable.
   */
  replyMode?: "auto" | "draft";
  /**
   * The name this person claims, when the channel gives us one we did not verify.
   *
   * Present for email, where the `From:` display name is the sender's own assertion. Its
   * presence switches recall onto the name-gated path — see below.
   */
  statedName?: string | null;
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

    /**
     * Recall (R-139) joins this stage rather than running after it.
     *
     * On a chat channel the identity is strong — a Telegram account is not a phone number a
     * colleague might answer — so there is no verification turn to wait for, and the facts are
     * simply part of what the prompt is built from. `resolveRecall` reads only; it returns null
     * for a first-time contact, which renders as no block at all.
     *
     * **Email is the exception, and it is deliberate.** `docs/CONTACT_RECALL_SPEC.md` §3 rates an
     * email address as only MEDIUM strength identity: `info@` is a shared mailbox, mail gets
     * forwarded, and whoever is typing today may not be the person last week's appointment
     * belongs to. So when the channel hands us a name the sender merely asserted, recall goes
     * through the name-gated path, which returns nothing unless that claim matches what we
     * already hold. Unlocking a stranger's appointment because they wrote to a shared address is
     * exactly the failure the spec was written to prevent.
     */
    const [history, contactName, recallFacts] = await Promise.all([
      loadHistory(input.orgId, input.conversationId, 20, db),
      contactDisplayName(input.orgId, input.contactId, db),
      input.statedName !== undefined
        ? recallForStatedName({
            orgId: input.orgId,
            contactId: input.contactId,
            statedName: input.statedName,
            db,
          })
        : resolveRecall({ orgId: input.orgId, contactId: input.contactId, db }),
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
            recall: recallPromptBlock(recallFacts, employee.timezone),
          },
          db
        );

    /**
     * A model that failed is not a reason to leave a customer unanswered.
     *
     * Silence is right when nobody is home — no model configured, the conversation is being
     * handled by a person, the customer opted out, the spend guard tripped. It is wrong when we
     * are alive and simply dropped their message: that happened on a real conversation, and the
     * customer had to ask again two minutes later. Those failures are rescued into a real
     * handover — the ticket is created BEFORE the sentence promising one is sent.
     */
    if (!result.text && shouldRescue(result.reason)) {
      const rescued = await rescueFailedReply({
        orgId: input.orgId,
        conversationId: input.conversationId,
        contactId: input.contactId,
        employee,
        incoming: input.incoming,
        db,
      });
      if (rescued.text) {
        result.text = rescued.text;
        result.artifacts = rescued.artifacts;
      }
    }

    if (!result.text) {
      console.warn("[REPLY][SILENT]", {
        org_id: input.orgId,
        channel: input.channel,
        conversation_id: input.conversationId,
        reason: result.reason,
      });
      return result;
    }

    /**
     * Draft mode: the AI has written the reply, and a person decides whether it goes.
     *
     * Nothing is appended to `messages` here — that table is the record of what was actually
     * exchanged, and this has not been. The draft lands in its own store, the Inbox offers it in
     * the composer, and the conversation stays with the AI (`handling` is untouched) because
     * nobody has taken it over yet.
     *
     * Artifacts created while writing are kept, not rolled back. That follows the rule
     * `fallback.ts` already enforces — the artifact exists BEFORE the sentence promising it is
     * delivered — so nothing has been claimed to the customer that is not true. The cost is a
     * booking the owner may have to cancel if they throw the draft away; the alternative, telling
     * a customer their appointment is made and having no record of it, is the failure that
     * actually hurts.
     */
    if (input.replyMode === "draft") {
      const draft = await saveDraft({
        orgId: input.orgId,
        conversationId: input.conversationId,
        body: result.text,
        artifacts: result.artifacts,
        db,
      });

      if (!draft) {
        console.error("[REPLY][DRAFT][SAVE][FAILED]", {
          org_id: input.orgId,
          conversation_id: input.conversationId,
        });
        return { ...result, ok: false, reason: "draft_save_failed" };
      }

      if (result.artifacts.length > 0) {
        await notifyNewArtifactsForConversation(input.conversationId, input.orgId);
      }

      console.info("[REPLY][DRAFTED]", {
        org_id: input.orgId,
        channel: input.channel,
        conversation_id: input.conversationId,
        artifacts: result.artifacts.map((a) => a.type),
      });

      return { ...result, ok: true, reason: "drafted" };
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
