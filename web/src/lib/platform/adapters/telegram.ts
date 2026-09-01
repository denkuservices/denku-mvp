import type { ChannelAdapter, NormalizedInbound, NormalizeContext } from "@/lib/platform/adapters/types";
import type { InboundAttachment } from "@/lib/platform/media/types";

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
 * **Photos and voice notes are no longer skipped** (Sprint 8). They used to be, and the comment
 * here said a blank bubble would read as a bug — which was true, and was the wrong conclusion.
 * A customer photographing the broken part instead of describing it is not an edge case, it is
 * how people use a phone. The adapter now emits an attachment descriptor per file and the shared
 * perception stage fills the bubble with what the AI actually saw or heard. Joins, edits and bot
 * echoes are still ignored — those really are nothing to answer.
 */

interface TelegramUser {
  id?: number | string;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

/** The shape every Telegram file shares: an id we exchange for bytes, plus what it weighs. */
interface TelegramFile {
  file_id?: string;
  file_unique_id?: string;
  file_size?: number;
  file_name?: string;
  mime_type?: string;
  duration?: number;
}

interface TelegramMessage {
  message_id?: number;
  from?: TelegramUser;
  chat?: { id?: number | string; type?: string; title?: string; username?: string };
  date?: number;
  text?: string;
  caption?: string;
  /** Telegram sends the SAME photo at several resolutions; the last entry is the largest. */
  photo?: TelegramFile[];
  voice?: TelegramFile;
  audio?: TelegramFile;
  video?: TelegramFile;
  video_note?: TelegramFile;
  document?: TelegramFile;
  sticker?: TelegramFile & { emoji?: string; is_animated?: boolean; is_video?: boolean };
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

/**
 * Everything attached to one Telegram message, as channel-agnostic descriptors.
 *
 * Telegram models each file type as its own field rather than one `attachments` array, so this is
 * a list of special cases by construction. Two are worth knowing:
 *
 * - **`photo` is an array of the same picture at different sizes.** Telegram orders it smallest
 *   first, so the last entry is the one worth reading — and the earlier ones must NOT be treated
 *   as separate photos, or one holiday snap becomes four vision calls.
 * - **`voice` and `audio` are different things.** `voice` is the hold-to-talk note, which is the
 *   case this whole feature exists for; `audio` is a music file someone forwarded. Both are
 *   transcribable and both are marked as audio, but the voice note gets the duration Telegram
 *   states so the Inbox can show "0:14" without opening it.
 *
 * Stickers are deliberately NOT attachments: they are a webp of a cartoon, and describing one
 * costs a vision call to learn that a customer sent a thumbs-up. The emoji Telegram helpfully
 * includes says the same thing for free, and becomes the message text instead.
 */
export function telegramAttachments(msg: TelegramMessage): InboundAttachment[] {
  const out: InboundAttachment[] = [];

  const push = (
    file: TelegramFile | undefined,
    kind: InboundAttachment["kind"],
    fallbackMime: string | null
  ) => {
    if (!file?.file_id) return;
    out.push({
      kind,
      mime: file.mime_type ?? fallbackMime,
      filename: file.file_name ?? null,
      size: typeof file.file_size === "number" ? file.file_size : null,
      durationSeconds: typeof file.duration === "number" ? file.duration : null,
      ref: file.file_id,
    });
  };

  const photos = Array.isArray(msg.photo) ? msg.photo : [];
  if (photos.length > 0) push(photos[photos.length - 1], "image", "image/jpeg");

  push(msg.voice, "audio", "audio/ogg");
  push(msg.audio, "audio", "audio/mpeg");
  push(msg.video, "video", "video/mp4");
  push(msg.video_note, "video", "video/mp4");

  // A document is whatever the sender dragged in — a PDF invoice, but just as often a photo sent
  // "as a file" to keep it uncompressed. Its own mime type decides which it is, upstream.
  push(msg.document, "file", null);

  return out;
}

export const telegramAdapter: ChannelAdapter = {
  channel: "telegram",
  normalizeInbound(raw: unknown, ctx: NormalizeContext): NormalizedInbound[] {
    const update = raw as TelegramUpdate | null;
    if (!update || !ctx.orgId) return [];

    const msg = update.message;
    if (!msg) return [];

    // Captions carry the human's words when they attach a photo — the sentence beside the file is
    // as much a part of the message as the file itself.
    const written = typeof msg.text === "string" && msg.text ? msg.text : msg.caption;
    const attachments = telegramAttachments(msg);

    // A sticker is answered as the emoji it is, rather than sent to a vision model.
    const sticker = msg.sticker?.emoji ? `${msg.sticker.emoji}` : "";
    const text = typeof written === "string" && written.trim() ? written : sticker;

    // Nothing said, nothing attached: a join, a pin, an edit. Not a customer talking.
    if ((typeof text !== "string" || text.trim().length === 0) && attachments.length === 0) return [];

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
          content: typeof text === "string" ? text : "",
          attachments,
          externalMessageId: msg.message_id != null ? `${chatId}:${msg.message_id}` : null,
          // Telegram `date` is epoch SECONDS (Meta's is milliseconds — the one place these
          // two chat channels disagree, and an easy hour-off bug if copied across).
          createdAt: typeof msg.date === "number" ? new Date(msg.date * 1000).toISOString() : undefined,
        },
        transcriptForIntent: typeof text === "string" ? text : "",
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
