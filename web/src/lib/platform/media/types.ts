
/**
 * What a customer can send that is not a sentence — the channel-agnostic vocabulary.
 *
 * Every chat channel carries media, and every one of them carries it differently: Telegram hands
 * over a `file_id` that must be exchanged for a short-lived URL signed with the bot token,
 * Instagram a CDN link that expires, Resend an attachment behind its Receiving API, the web widget
 * a file the visitor's own browser uploaded. The one thing they have in common is what the
 * *business* needs from it: to know what is in the picture, and what was said in the voice note.
 *
 * So an adapter's job stops at DESCRIBING the attachment (kind, mime, and an opaque `ref` its own
 * channel understands). Fetching bytes is a channel-specific act that needs credentials, which is
 * why it arrives as an injected `MediaResolver` — the same shape `ingestInboundMessage` already
 * uses for the intent and automation stages. Adapters stay pure; secrets stay in the webhook.
 */

export type MediaKind = "image" | "audio" | "video" | "file";

/** How an attachment ended up being handled. Stored, so the Inbox can be honest about it. */
export type MediaStatus =
  /** The AI read/heard it and the message carries what it found. */
  | "understood"
  /** Kept, but nothing could be read from it (a PDF on a provider that cannot read PDFs). */
  | "stored_only"
  /** We know what it is and deliberately do not process it (kind or mime out of scope). */
  | "unsupported"
  /** Over the byte ceiling — refused before any model or storage call. */
  | "too_large"
  /** We tried and it did not work: fetch failed, model timed out, quota tripped. */
  | "failed";

/** What an adapter knows about one attachment, before anything has been fetched. */
export interface InboundAttachment {
  kind: MediaKind;
  /** Best-known mime type. Null when the channel does not say — the resolver may fill it in. */
  mime: string | null;
  filename?: string | null;
  /** Declared size in bytes, when the channel states one. Used to refuse early. */
  size?: number | null;
  durationSeconds?: number | null;
  /**
   * The channel-native handle its own resolver understands: a Telegram `file_id`, an Instagram
   * CDN url, a Resend attachment id, a storage object key. Opaque to everything else.
   */
  ref: string;
  /**
   * A directly fetchable URL when the channel provides one. Kept separate from `ref` because a
   * resolver may need both (Instagram: the url is the ref; Telegram: the ref becomes a url only
   * after an authenticated round trip).
   */
  url?: string | null;
  /** Anything the adapter wants the record to carry — a sticker's emoji, a document's title. */
  note?: string | null;
  /**
   * Already in our own bucket, so perception must not store a second copy.
   *
   * Set by the one channel where the file reaches us before the message does: the web widget
   * uploads it, gets a key back, and sends that key with the text. Every other channel hands over
   * a link that dies, which is why storing is otherwise part of the perception stage.
   */
  storagePath?: string | null;
}

/** The bytes, once a channel's resolver has produced them. */
export interface ResolvedMedia {
  mime: string;
  /** Base64, because that is what both model APIs take and what storage can decode. */
  base64: string;
  size: number;
  filename?: string | null;
}

/**
 * Fetch the bytes for one attachment, using whatever credential this channel needs.
 *
 * Supplied by the channel's webhook to `ingestInboundMessage`. Must never throw — return null and
 * the attachment is recorded as `failed` while the message itself still lands.
 */
export type MediaResolver = (attachment: InboundAttachment) => Promise<ResolvedMedia | null>;

/** What is written to `messages.meta.media[]` — the durable record of one attachment. */
export interface AttachmentRecord {
  kind: MediaKind;
  mime: string | null;
  filename: string | null;
  size: number | null;
  durationSeconds: number | null;
  status: MediaStatus;
  /** Object key in the `channel-media` bucket, or null when no copy was kept. */
  storagePath: string | null;
  /** The description or transcript, when there is one. */
  understanding: string | null;
  /** Machine-readable failure reason, for logs and support. Never shown to a customer. */
  error?: string;
}

export interface MediaProcessingResult {
  records: AttachmentRecord[];
  /**
   * The text rendition to merge into the message body — what every downstream reader (the Inbox,
   * the reply engine's history, the intent classifier, recall) will actually see.
   */
  rendition: string;
  /** True when at least one attachment was genuinely read or heard. */
  understood: boolean;
}

/**
 * Byte ceilings, per kind.
 *
 * Two different things are being protected. The model APIs have their own inline limits (Gemini
 * refuses an inline payload over ~20MB), and a serverless function has a memory budget that a
 * base64 copy of a 50MB video eats twice over. Both say: decide before fetching, from the size the
 * channel already declared, and refuse in a way the owner can see rather than crashing the webhook.
 */
export const MEDIA_BYTE_LIMITS: Record<MediaKind, number> = {
  image: 8 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  video: 15 * 1024 * 1024,
  file: 8 * 1024 * 1024,
};

/**
 * How many attachments on one message we are willing to process.
 *
 * A customer sending five photos of a damaged delivery is normal. A client posting forty is not a
 * customer. Everything past the cap is still RECORDED — the owner sees that it arrived — it is
 * just not sent to a model.
 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

/**
 * Per-workspace hourly ceiling on media understanding.
 *
 * The same reasoning as the reply engine's spend guard: `lib/rateLimit.ts` is an in-memory Map and
 * a no-op on Vercel, so the only honest limiter is the database. Vision and transcription cost
 * more per call than a text reply, which is exactly why an unbounded one is worth guarding.
 */
export const MAX_MEDIA_PER_ORG_PER_HOUR = 200;

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const AUDIO_MIMES = new Set([
  "audio/ogg",
  "audio/oga",
  "audio/opus",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/flac",
]);

const VIDEO_MIMES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/mpeg"]);

/** Classify a mime type into the kind that decides which model call to make. */
export function kindForMime(mime: string | null | undefined): MediaKind {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  if (IMAGE_MIMES.has(m) || m.startsWith("image/")) return "image";
  if (AUDIO_MIMES.has(m) || m.startsWith("audio/")) return "audio";
  if (VIDEO_MIMES.has(m) || m.startsWith("video/")) return "video";
  return "file";
}

/**
 * Is this something a model can actually take?
 *
 * Deliberately allow-listed rather than "anything that starts with image/". An unknown image
 * format is a failed API call and a wasted second of a customer's wait; a known one is a
 * description. The unknown ones are still stored and shown — just not sent.
 */
export function isUnderstandableMime(mime: string | null | undefined): boolean {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  return IMAGE_MIMES.has(m) || AUDIO_MIMES.has(m) || VIDEO_MIMES.has(m);
}
