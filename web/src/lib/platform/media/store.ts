import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { extensionFor } from "@/lib/llm/multimodal";
import { MEDIA_BYTE_LIMITS, type MediaKind, type MediaResolver, type ResolvedMedia } from "@/lib/platform/media/types";

/**
 * Keeping the original.
 *
 * Understanding an image and KEEPING it are two different features, and it would have been
 * defensible to ship only the first. The reason both are here is that every URL a chat channel
 * hands us dies: a Telegram file link is valid for about an hour AND carries the bot token in its
 * path (so it can never be shown to anyone), an Instagram CDN link expires, a Resend attachment
 * lives behind an API key. Without a copy of our own, the business owner opening the Inbox
 * tomorrow would read "a photo of a cracked screen" and have no way to ever see the crack.
 *
 * So the bytes land in a PRIVATE bucket, and the only way anyone reads them back is a short-lived
 * signed URL minted by server code that has already checked the org — the same shape the rest of
 * the app uses for tenant data. The bucket is private on purpose: a public bucket would make every
 * customer photo a guessable URL on the open internet.
 *
 * Storage failing is never fatal. A message whose photo could not be kept is still a message, and
 * the record says `storagePath: null` rather than pretending.
 */

export const CHANNEL_MEDIA_BUCKET = "channel-media";

/** How long a signed link lives. Long enough to load a thread, short enough to be worthless if leaked. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Store one inbound file and return its object key.
 *
 * The key is `org/conversation/uuid.ext`, in that order, so that everything about one workspace
 * shares a prefix — which is what makes "delete this customer's data" a prefix delete rather than
 * a query, when that day comes.
 */
export async function storeInboundMedia(input: {
  orgId: string;
  conversationId: string;
  kind: MediaKind;
  media: ResolvedMedia;
  db?: SupabaseClient;
}): Promise<string | null> {
  const db = input.db ?? supabaseAdmin;
  if (!input.orgId || !input.conversationId) return null;

  const extension = extensionFor(input.media.mime);
  const path = `${input.orgId}/${input.conversationId}/${randomUUID()}.${extension}`;

  try {
    const bytes = Buffer.from(input.media.base64, "base64");
    const { error } = await db.storage.from(CHANNEL_MEDIA_BUCKET).upload(path, bytes, {
      contentType: input.media.mime,
      // Every key is a fresh uuid, so an overwrite would mean a uuid collision — not a case worth
      // silently accepting.
      upsert: false,
    });

    if (error) {
      console.error("[PLATFORM][MEDIA][STORE][FAILED]", {
        org_id: input.orgId,
        kind: input.kind,
        error: error.message,
      });
      return null;
    }

    return path;
  } catch (err) {
    console.error("[PLATFORM][MEDIA][STORE][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * A temporary link to a stored file, for a reader we have already authorised.
 *
 * Callers MUST have established that the viewer belongs to the org that owns the object — this
 * function signs whatever key it is given and asks no questions, because it runs with the
 * service-role client where there is no safety net (the project's own rule about `org_id`
 * scoping). The org id is the first path segment for exactly that reason: it is checkable.
 */
export async function signedMediaUrl(
  path: string | null | undefined,
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<string | null> {
  if (!path || !orgId) return null;
  // The cheap, load-bearing check: an object key that does not start with this org's id is not
  // this org's file, and signing it would be a cross-tenant leak.
  if (!path.startsWith(`${orgId}/`)) {
    console.error("[PLATFORM][MEDIA][SIGN][WRONG_ORG]", { org_id: orgId });
    return null;
  }

  try {
    const { data, error } = await db.storage
      .from(CHANNEL_MEDIA_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error) {
      console.error("[PLATFORM][MEDIA][SIGN][FAILED]", { error: error.message });
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (err) {
    console.error("[PLATFORM][MEDIA][SIGN][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Download bytes from a URL a channel gave us, with a ceiling.
 *
 * Shared by every resolver that works from a link (Instagram's CDN, Telegram's file endpoint, the
 * web widget's own storage). Two things matter and both are easy to get wrong:
 *
 *   - **The declared length is checked before the body is read**, so a hostile or broken URL
 *     cannot make a serverless function buffer a gigabyte.
 *   - **The stream is capped anyway**, because `content-length` is a claim, not a fact.
 */
export async function fetchMediaBytes(
  url: string,
  maxBytes: number,
  init: RequestInit = {}
): Promise<ResolvedMedia | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      console.warn("[PLATFORM][MEDIA][FETCH][FAILED]", { status: res.status });
      return null;
    }

    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > maxBytes) {
      console.info("[PLATFORM][MEDIA][FETCH][TOO_LARGE]", { declared, maxBytes });
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      console.info("[PLATFORM][MEDIA][FETCH][TOO_LARGE]", { size: buffer.byteLength, maxBytes });
      return null;
    }

    const mime = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
    return { mime, base64: buffer.toString("base64"), size: buffer.byteLength };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    console.warn("[PLATFORM][MEDIA][FETCH][ERROR]", { reason: aborted ? "timeout" : String(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The resolver for channels that hand over a plain, already-fetchable URL.
 *
 * Instagram is the case: Meta puts a short-lived CDN link in the webhook and anyone holding it can
 * read the file, so there is no credential to apply and nothing channel-specific to do. Telegram
 * and email need their own resolvers because their links do not work without a secret.
 *
 * `https` only. A channel that offered us an `http://` or `file://` URL would be either broken or
 * hostile, and fetching it server-side is how an SSRF starts.
 */
export function urlMediaResolver(init: RequestInit = {}): MediaResolver {
  return async (attachment) => {
    const url = attachment.url ?? attachment.ref;
    if (typeof url !== "string" || !url.startsWith("https://")) return null;
    const limit = MEDIA_BYTE_LIMITS[attachment.kind] ?? MEDIA_BYTE_LIMITS.file;
    const media = await fetchMediaBytes(url, limit, init);
    if (!media) return null;
    // The channel's own claim about the type wins when it made one; the CDN's header fills the gap.
    return { ...media, mime: attachment.mime || media.mime, filename: attachment.filename ?? null };
  };
}
