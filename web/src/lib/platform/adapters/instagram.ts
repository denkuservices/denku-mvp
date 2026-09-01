import type { ChannelAdapter, NormalizedInbound, NormalizeContext } from "@/lib/platform/adapters/types";
import type { InboundAttachment, MediaKind } from "@/lib/platform/media/types";

/**
 * Instagram channel adapter (Sprint 4.5 — IG onto the shared abstractions).
 *
 * Maps one Instagram webhook `entry` (Messaging API / Messenger envelope) into normalized
 * inbound messages. The thread key is the customer's IG-scoped sender id (one Conversation
 * per customer thread). Inbound DMs → role "user"/inbound; business echoes (is_echo) →
 * role "assistant"/outbound, so the stored thread reflects both sides even though Denku is
 * receive-only (it does not SEND — no reply/AI logic here, per the Instagram landmine).
 *
 * **Media is read even though Instagram is receive-only** (Sprint 8). Answering is still off —
 * that needs the reply epic and Meta's Advanced Access — but a DM that is nothing but a photo of a
 * product used to vanish from the Inbox entirely, which made the channel look broken to the one
 * business that actually connected it. Now the photo is described and the description is the
 * message, so the owner reads what arrived and can answer it themselves.
 *
 * Pure + deterministic + never throws (returns [] for non-message entries), per contract.
 */

/** One file on a DM. Meta gives a type and a CDN url; the url is short-lived and unsigned. */
interface IgAttachment {
  type?: string;
  payload?: { url?: string; title?: string; sticker_id?: number | string };
}

interface IgMessaging {
  sender?: { id?: string | number };
  recipient?: { id?: string | number };
  timestamp?: number | string;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: IgAttachment[];
  };
}

interface IgEntry {
  id?: string | number;
  time?: number;
  messaging?: unknown;
}

function toIso(ts: number | string | undefined): string | undefined {
  if (ts == null) return undefined;
  const n = typeof ts === "string" ? Number(ts) : ts;
  if (!Number.isFinite(n)) return undefined;
  // IG timestamps are epoch milliseconds.
  return new Date(n).toISOString();
}

/**
 * Meta's attachment types, mapped to what we do with them.
 *
 * `share`, `story_mention` and `reel` are references to other Instagram content rather than a file
 * the customer made, and following them needs Graph API calls we do not have Advanced Access for.
 * They are dropped rather than half-supported: the alternative is a broken image in the Inbox and
 * a vision call against an HTML error page.
 */
const IG_KINDS: Record<string, MediaKind> = {
  image: "image",
  audio: "audio",
  video: "video",
  file: "file",
};

/** Attachment descriptors for one IG message. Media only — shares and story mentions are skipped. */
export function instagramAttachments(attachments: IgAttachment[] | undefined): InboundAttachment[] {
  if (!Array.isArray(attachments)) return [];
  const out: InboundAttachment[] = [];
  for (const a of attachments) {
    const kind = IG_KINDS[(a?.type ?? "").toLowerCase()];
    const url = a?.payload?.url;
    if (!kind || typeof url !== "string" || !url.startsWith("https://")) continue;
    out.push({
      kind,
      // Meta states a type, never a mime. The CDN's `content-type` fills it in at fetch time.
      mime: null,
      filename: a.payload?.title ?? null,
      ref: url,
      url,
    });
  }
  return out;
}

export const instagramAdapter: ChannelAdapter = {
  channel: "instagram",
  normalizeInbound(raw: unknown, ctx: NormalizeContext): NormalizedInbound[] {
    const entry = raw as IgEntry | null;
    if (!entry || !ctx.orgId) return [];
    const messaging: IgMessaging[] = Array.isArray(entry.messaging) ? (entry.messaging as IgMessaging[]) : [];
    if (messaging.length === 0) return [];

    const out: NormalizedInbound[] = [];
    for (const m of messaging) {
      const text = typeof m.message?.text === "string" ? m.message.text : "";
      const attachments = instagramAttachments(m.message?.attachments);
      // Reactions, read receipts, deletes: an event with neither words nor a file is not a message.
      if (!text && attachments.length === 0) continue;

      const isEcho = m.message?.is_echo === true;
      const senderId = m.sender?.id != null ? String(m.sender.id) : null;
      const recipientId = m.recipient?.id != null ? String(m.recipient.id) : null;
      // The customer is the non-business party: sender for inbound, recipient for echoes.
      const customerId = isEcho ? recipientId : senderId;
      if (!customerId) continue;

      out.push({
        channel: "instagram",
        orgId: ctx.orgId,
        agentId: ctx.agentId ?? null,
        externalThreadId: customerId, // one thread per customer
        contact: { externalId: customerId },
        message: {
          role: isEcho ? "assistant" : "user",
          direction: isEcho ? "outbound" : "inbound",
          content: text,
          attachments,
          externalMessageId: m.message?.mid ?? null,
          createdAt: toIso(m.timestamp),
        },
        // Chat text is the intent signal when a chat channel opts into the Intent stage.
        transcriptForIntent: isEcho ? null : text,
      });
    }
    return out;
  },
};
