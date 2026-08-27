import type { ChannelAdapter, NormalizedInbound, NormalizeContext } from "@/lib/platform/adapters/types";

/**
 * Telegram channel adapter.
 *
 * Maps one Telegram `Update` into normalized inbound messages. Pure, deterministic, never
 * throws — anything it does not understand returns `[]` and the webhook still answers 200.
 *
 * Three decisions worth knowing:
 *
 * - **The thread key is the chat id, not the user id.** They are the same number in a private
 *   chat, but in a group they are not, and keying on the user would merge every group a person
 *   speaks in into one conversation.
 * - **The contact key is the user id.** A person keeps that id across chats and even if they
 *   change their @username, which is the only stable thing Telegram gives us. It is also why
 *   this channel answers the open question from P3 — a Telegram contact has a real name from
 *   the first message, with no phone number involved.
 * - **The message id is scoped to the chat.** Telegram's `message_id` restarts per chat, so
 *   `chatId:messageId` is what makes the idempotent append actually idempotent.
 *
 * Non-text updates (photos, stickers, joins, edits) are skipped rather than stored as empty
 * messages: a blank bubble in the Inbox would read as a bug, and there is nothing for the
 * reply engine to answer.
 */

interface TelegramUser {
  id?: number | string;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramMessage {
  message_id?: number;
  from?: TelegramUser;
  chat?: { id?: number | string; type?: string; title?: string; username?: string };
  date?: number;
  text?: string;
  caption?: string;
}

export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
}

/** The name a human would call them, from the pieces Telegram sends. */
export function telegramDisplayName(from: TelegramUser | undefined): string | null {
  if (!from) return null;
  const full = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (from.username) return `@${from.username}`;
  return null;
}

export const telegramAdapter: ChannelAdapter = {
  channel: "telegram",
  normalizeInbound(raw: unknown, ctx: NormalizeContext): NormalizedInbound[] {
    const update = raw as TelegramUpdate | null;
    if (!update || !ctx.orgId) return [];

    const msg = update.message;
    if (!msg) return [];

    // Captions carry the human's words when they attach a photo; the attachment itself is
    // not something the AI can act on yet, but the sentence beside it is.
    const text = typeof msg.text === "string" && msg.text ? msg.text : msg.caption;
    if (typeof text !== "string" || text.trim().length === 0) return [];

    const chatId = msg.chat?.id != null ? String(msg.chat.id) : null;
    if (!chatId) return [];

    // A bot's own message coming back to us is not a customer talking.
    if (msg.from?.is_bot === true) return [];

    const userId = msg.from?.id != null ? String(msg.from.id) : chatId;

    return [
      {
        channel: "telegram",
        orgId: ctx.orgId,
        agentId: ctx.agentId ?? null,
        externalThreadId: chatId,
        contact: {
          externalId: userId,
          displayName: telegramDisplayName(msg.from),
        },
        message: {
          role: "user",
          direction: "inbound",
          content: text,
          externalMessageId: msg.message_id != null ? `${chatId}:${msg.message_id}` : null,
          // Telegram `date` is epoch SECONDS (Meta's is milliseconds — the one place these
          // two chat channels disagree, and an easy hour-off bug if copied across).
          createdAt: typeof msg.date === "number" ? new Date(msg.date * 1000).toISOString() : undefined,
        },
        transcriptForIntent: text,
        meta: {
          telegram_chat_id: chatId,
          telegram_chat_type: msg.chat?.type ?? null,
          telegram_user_id: userId,
          telegram_username: msg.from?.username ?? null,
          telegram_language_code: msg.from?.language_code ?? null,
          telegram_update_id: update.update_id ?? null,
        },
      },
    ];
  },
};
