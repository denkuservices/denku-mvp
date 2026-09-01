import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { describeImage, describeVideo, transcribeAudio } from "@/lib/llm/multimodal";
import { storeInboundMedia } from "@/lib/platform/media/store";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_MEDIA_PER_ORG_PER_HOUR,
  MEDIA_BYTE_LIMITS,
  isUnderstandableMime,
  kindForMime,
  type AttachmentRecord,
  type InboundAttachment,
  type MediaProcessingResult,
  type MediaResolver,
} from "@/lib/platform/media/types";

/**
 * The perception stage: what the customer sent, turned into something the business can act on.
 *
 * This is the channel-agnostic half of "the AI can see and hear". It runs inside
 * `ingestInboundMessage`, between the conversation and the message, and its output is folded into
 * the message BODY rather than kept somewhere clever. That decision is the whole design:
 *
 *   Everything downstream — the Inbox, the reply engine's history, the intent classifier, recall,
 *   the ticket a human eventually reads — already reads `messages.content`. Putting the
 *   description and the transcript there means all of them gain sight and hearing at once, with no
 *   changes of their own. Keeping perception in a side channel would mean teaching each of them
 *   separately, and the second one we forgot would be a customer answered as if they had sent
 *   nothing.
 *
 * The rendition is bracketed and unmistakable (`[image] …`, `[voice message] …`) for the same
 * reason a transcript names its speakers: the model must never be able to confuse what the
 * customer SAID with what we OBSERVED, and the owner reading the thread must be able to see which
 * words are the AI's description and which are their customer's.
 *
 * Never throws. Every failure becomes a recorded attachment with an honest status, and the message
 * still lands.
 */

/** A minute of a customer's voice note, rendered so the model treats it as their own words. */
const LABELS: Record<string, string> = {
  image: "image",
  audio: "voice message",
  video: "video",
  file: "file",
};

function humanBytes(size: number | null | undefined): string {
  if (!size || size <= 0) return "unknown size";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Have we already spent an hour's worth of vision and transcription for this workspace?
 *
 * Counted in the database, because `lib/rateLimit.ts` is an in-memory Map and a no-op on Vercel
 * (landmine #8). Fails OPEN — a broken count must never make a paying customer's photo invisible.
 */
export async function mediaBudgetRemaining(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", since)
      .not("meta->media", "is", null);

    if (error) return true;
    return (count ?? 0) < MAX_MEDIA_PER_ORG_PER_HOUR;
  } catch {
    return true;
  }
}

/** One line of the rendition, from a finished record. */
export function renderAttachment(record: AttachmentRecord): string {
  const label = LABELS[record.kind] ?? "file";
  const name = record.filename ? ` ${record.filename}` : "";

  switch (record.status) {
    case "understood":
      return `[${label}] ${record.understanding}`;
    case "too_large":
      return `[${label}${name}] received, too large to open (${humanBytes(record.size)}). Ask the customer to describe it or send a smaller one.`;
    case "unsupported":
      return `[${label}${name}] received. This is not a format the AI can read.`;
    case "stored_only":
      return `[${label}${name}] received and saved, but the AI could not read it.`;
    case "failed":
    default:
      return `[${label}${name}] received, but the AI could not open it. Do not guess what it shows.`;
  }
}

/** Merge the customer's own words with what we perceived, in that order. */
export function composeMessageContent(caption: string, rendition: string): string {
  const words = caption.trim();
  const seen = rendition.trim();
  if (words && seen) return `${words}\n\n${seen}`;
  return words || seen;
}

function emptyResult(): MediaProcessingResult {
  return { records: [], rendition: "", understood: false };
}

function record(
  attachment: InboundAttachment,
  over: Partial<AttachmentRecord> & { status: AttachmentRecord["status"] }
): AttachmentRecord {
  return {
    kind: attachment.kind,
    mime: attachment.mime ?? null,
    filename: attachment.filename ?? null,
    size: attachment.size ?? null,
    durationSeconds: attachment.durationSeconds ?? null,
    storagePath: null,
    understanding: null,
    ...over,
  };
}

/**
 * Fetch, keep and read one attachment.
 *
 * Order matters: the copy is stored BEFORE the model is called, so that a vision timeout still
 * leaves the owner with the actual photo. The reverse order would mean the one failure mode where
 * we have neither a description nor the picture.
 */
async function processOne(
  attachment: InboundAttachment,
  input: ProcessInput
): Promise<AttachmentRecord> {
  const limit = MEDIA_BYTE_LIMITS[attachment.kind] ?? MEDIA_BYTE_LIMITS.file;

  // Refuse on the size the channel already declared — before spending a fetch on it.
  if (typeof attachment.size === "number" && attachment.size > limit) {
    return record(attachment, { status: "too_large" });
  }

  const media = await input.resolve(attachment).catch(() => null);
  if (!media) return record(attachment, { status: "failed", error: "resolve_failed" });

  if (media.size > limit) {
    return record(attachment, { status: "too_large", size: media.size, mime: media.mime });
  }

  const mime = media.mime || attachment.mime || "application/octet-stream";
  const kind = attachment.kind === "file" ? kindForMime(mime) : attachment.kind;

  // A file the visitor uploaded to us is already stored; storing it again would double the bill
  // and leave an orphan nobody points at.
  const storagePath =
    attachment.storagePath ??
    (await storeInboundMedia({
      orgId: input.orgId,
      conversationId: input.conversationId,
      kind,
      media,
      db: input.db,
    }));

  const base = record(attachment, {
    status: "stored_only",
    kind,
    mime,
    size: media.size,
    filename: attachment.filename ?? media.filename ?? null,
    storagePath,
  });

  if (!isUnderstandableMime(mime)) {
    return { ...base, status: storagePath ? "stored_only" : "unsupported" };
  }

  const understanding =
    kind === "image"
      ? await describeImage({ mime, base64: media.base64, hint: input.caption })
      : kind === "audio"
        ? await transcribeAudio({ mime, base64: media.base64, filename: attachment.filename })
        : kind === "video"
          ? await describeVideo({ mime, base64: media.base64 })
          : { ok: false, text: null, error: "unsupported_kind" };

  if (!understanding.ok || !understanding.text) {
    return { ...base, status: "failed", error: understanding.error ?? "empty_understanding" };
  }

  return { ...base, status: "understood", understanding: understanding.text };
}

export interface ProcessInput {
  orgId: string;
  conversationId: string;
  attachments: InboundAttachment[];
  /** The customer's own text on the same message, used as a hint and kept out of the rendition. */
  caption: string;
  resolve: MediaResolver;
  db?: SupabaseClient;
}

/**
 * Read everything the customer attached, in parallel, and render it.
 *
 * Parallel because these are the seconds a customer spends staring at "typing…": two photos read
 * one after the other is twice the wait for no benefit. Bounded by
 * `MAX_ATTACHMENTS_PER_MESSAGE`, which is what keeps "parallel" from meaning "forty model calls".
 */
export async function processInboundMedia(input: ProcessInput): Promise<MediaProcessingResult> {
  const attachments = (input.attachments ?? []).filter(Boolean);
  if (attachments.length === 0) return emptyResult();

  try {
    if (!(await mediaBudgetRemaining(input.orgId, input.db))) {
      console.warn("[PLATFORM][MEDIA][BUDGET][EXHAUSTED]", { org_id: input.orgId });
      const records = attachments.map((a) => record(a, { status: "failed", error: "rate_limited" }));
      return {
        records,
        rendition: records.map(renderAttachment).join("\n"),
        understood: false,
      };
    }

    const processed = attachments.slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
    const skipped = attachments.slice(MAX_ATTACHMENTS_PER_MESSAGE);

    const records = await Promise.all(processed.map((a) => processOne(a, input)));
    for (const a of skipped) {
      records.push(record(a, { status: "unsupported", error: "over_attachment_limit" }));
    }

    const understood = records.some((r) => r.status === "understood");

    console.info("[PLATFORM][MEDIA][PROCESSED]", {
      org_id: input.orgId,
      conversation_id: input.conversationId,
      count: records.length,
      understood: records.filter((r) => r.status === "understood").length,
      kinds: records.map((r) => r.kind),
    });

    return {
      records,
      rendition: records.map(renderAttachment).join("\n"),
      understood,
    };
  } catch (err) {
    console.error("[PLATFORM][MEDIA][ERROR]", err instanceof Error ? err.message : String(err));
    // A crash in perception must not cost the message. Record what we know and move on.
    const records = attachments.map((a) => record(a, { status: "failed", error: "unhandled" }));
    return { records, rendition: records.map(renderAttachment).join("\n"), understood: false };
  }
}
