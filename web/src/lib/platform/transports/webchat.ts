import "server-only";

import { randomUUID } from "node:crypto";
import type { ReplyTransport, TransportResult, TransportTarget } from "@/lib/platform/reply/types";

/**
 * Web Chat's outbound half — and the one transport where "sending" is not a network call.
 *
 * Every other transport hands a string to somebody else's API: Telegram's `sendMessage`, Resend.
 * Here there is no provider. The visitor's browser is holding the conversation open and asking
 * us for new messages, so a reply is *delivered by being recorded* — the row in `messages` IS
 * the outbound channel, and `/api/webchat/poll` reads it.
 *
 * That inverts the rule `respondToInbound` is built around ("send before storing, because a
 * stored-but-unsent reply is a lie the Inbox tells the owner"). It is not a violation: with no
 * separate send there is no window in which the two can disagree. The failure this transport
 * has instead is *arrival* — the visitor may have closed the tab before the poll fetched it —
 * and that is the same failure every chat channel has once a message leaves the building.
 *
 * So `sendText` does exactly one thing: mint the id the reply will be stored under. The caller
 * (`respondToInbound` for the AI, `sendHumanReply` for a person) appends the message itself,
 * which means both paths keep working here with no special case for this channel.
 */
export const webChatTransport: ReplyTransport = {
  channel: "web",

  async sendText(target: TransportTarget, text: string): Promise<TransportResult> {
    if (!target.threadId) {
      return { ok: false, error: "This conversation has no web chat session." };
    }
    if (!text.trim()) {
      return { ok: false, error: "Nothing to send." };
    }

    /**
     * A synthetic id, because there is no provider to give us one.
     *
     * It still earns its place: `appendMessage` is idempotent on `external_message_id`, and a
     * fresh uuid per reply keeps that column non-null and unique for this channel like every
     * other, so nothing downstream has to special-case a missing id.
     */
    return { ok: true, externalMessageId: `${target.threadId}:out:${randomUUID()}` };
  },

  /**
   * No typing indicator from this side.
   *
   * The widget already knows it is waiting — it sent the message — so it shows the dots itself,
   * instantly, with no round trip. A server-side "typing" flag would arrive a poll interval
   * late and tell the visitor something they could already see.
   */
};
