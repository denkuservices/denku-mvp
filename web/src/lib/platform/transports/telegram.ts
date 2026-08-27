import "server-only";

import { getBotToken } from "@/lib/telegram/connections";
import { sendMessage, sendChatAction } from "@/lib/telegram/api";
import type { ReplyTransport, TransportResult, TransportTarget } from "@/lib/platform/reply/types";

/**
 * Telegram's outbound half: turn a string into a message in a chat.
 *
 * Everything channel-specific about SENDING lives here — which is almost nothing, because the
 * decisions that look like Telegram's (plain text, 4096 characters) are enforced in the API
 * client. This file exists so the reply engine never learns the word "chat_id".
 *
 * The message id it returns matters more than it looks: stored as the outbound message's
 * `external_message_id`, it makes the append idempotent, so a Telegram redelivery of the same
 * update cannot produce a duplicate row in the customer's Inbox.
 */
export const telegramTransport: ReplyTransport = {
  channel: "telegram",

  async sendText(target: TransportTarget, text: string): Promise<TransportResult> {
    if (!target.connectionId) return { ok: false, error: "No Telegram connection on this conversation." };

    const token = await getBotToken(target.connectionId);
    if (!token) {
      console.error("[TELEGRAM][SEND][NO_TOKEN]", { connectionId: target.connectionId });
      return { ok: false, error: "Bot credentials are unavailable." };
    }

    const sent = await sendMessage(token, target.threadId, text);
    if (!sent.ok) {
      console.error("[TELEGRAM][SEND][FAILED]", {
        connectionId: target.connectionId,
        conversation_id: target.conversationId,
        reason: sent.description,
      });
      return { ok: false, error: sent.description };
    }

    return {
      ok: true,
      externalMessageId:
        sent.result?.message_id != null ? `${target.threadId}:${sent.result.message_id}` : null,
    };
  },

  async indicateTyping(target: TransportTarget): Promise<void> {
    if (!target.connectionId) return;
    const token = await getBotToken(target.connectionId);
    if (!token) return;
    // Courtesy only — a customer waiting on a model should see the same thing they would see
    // waiting on a person. Never surfaced, never retried.
    await sendChatAction(token, target.threadId).catch(() => undefined);
  },
};
