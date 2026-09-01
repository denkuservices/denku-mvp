import "server-only";

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CHANNEL_MEDIA_BUCKET } from "@/lib/platform/media/store";
import { extensionFor } from "@/lib/llm/multimodal";
import { kindForMime, type InboundAttachment, type MediaKind, type MediaResolver } from "@/lib/platform/media/types";

/**
 * Letting a stranger upload a file.
 *
 * Every other channel's media arrives through a provider that already knows who sent it: Telegram
 * has an account behind the bot, Meta has an Instagram user, email has a From address. The web
 * widget has a person on a website who has told us nothing, on a public endpoint, and the site key
 * in the page source is an address rather than a password (see `skills/webchat-integration.md`).
 * That is why the registry entry used to say attachments were off, and the reasoning was right:
 * accepting uploads here is a decision, not a widget feature.
 *
 * It is taken now, because the case is real — a shop's customer photographing the item they are
 * asking about is the single most useful thing the widget could carry — and it is taken with the
 * limits doing the work that identity cannot:
 *
 *   1. **A signed session token, checked first.** No token, no upload: the same door `send` uses,
 *      so an uploader is at least a visitor the embed route already vetted by Referer.
 *   2. **An allow-list of formats**, not a block-list. Images and audio are what a customer sends
 *      to ask a question; an executable, an archive or an SVG (which is script) is not, and would
 *      make this endpoint a file drop for someone else's malware.
 *   3. **A hard byte ceiling**, enforced on the actual bytes rather than a declared length.
 *   4. **A per-session count**, so one visitor cannot turn a shop's storage into their backup
 *      drive. Counted in the bucket itself, because that is the only number that cannot be lied
 *      about.
 *   5. **A path keyed by org AND session**, which is what makes `send` able to prove that the key
 *      a request presents was issued to that request's own session. Without it, a visitor could
 *      attach another workspace's file to their own message and have our AI read it out to them.
 *
 * Nothing here makes the endpoint free of abuse — a determined script can still burn a workspace's
 * upload allowance. It makes the damage bounded and attributable, which for a public endpoint is
 * the honest goal.
 */

/** What a website visitor may send. Images to show a thing, audio to say a thing. */
const ALLOWED: Record<string, MediaKind> = {
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/heic": "image",
  "image/heif": "image",
  "audio/ogg": "audio",
  "audio/opus": "audio",
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/x-m4a": "audio",
  "audio/wav": "audio",
  "audio/x-wav": "audio",
  "audio/webm": "audio",
};

/**
 * 8 MB.
 *
 * A phone photo is 2–5 MB and a two-minute voice memo is under 2 MB, so this fits what people
 * actually send with room to spare — while staying well under the point where a serverless
 * function holding the bytes plus a base64 copy of them becomes a memory problem.
 */
export const MAX_WEBCHAT_UPLOAD_BYTES = 8 * 1024 * 1024;

/** How many files one visitor session may leave behind. */
export const MAX_UPLOADS_PER_SESSION = 10;

export function webChatUploadKind(mime: string | null | undefined): MediaKind | null {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  return ALLOWED[m] ?? null;
}

/** Everything one session uploads shares this prefix — the basis of both the count and the check. */
export function sessionUploadPrefix(orgId: string, sessionId: string): string {
  return `${orgId}/webchat/${sessionId}`;
}

/**
 * Does this storage key belong to the session presenting it?
 *
 * The whole reason `send` can trust an attachment reference from an anonymous browser. The key is
 * unguessable anyway (a uuid), but unguessable is not the same as unforgeable, and this is the
 * check that makes the difference irrelevant.
 */
export function isOwnedUpload(path: string, orgId: string, sessionId: string): boolean {
  if (typeof path !== "string" || path.includes("..")) return false;
  return path.startsWith(`${sessionUploadPrefix(orgId, sessionId)}/`);
}

/** How many files this session has already left. Fails CLOSED — the one guard that must not fail open. */
export async function withinUploadBudget(orgId: string, sessionId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(CHANNEL_MEDIA_BUCKET)
      .list(sessionUploadPrefix(orgId, sessionId), { limit: MAX_UPLOADS_PER_SESSION + 1 });

    if (error) {
      console.error("[WEBCHAT][UPLOAD][BUDGET][FAILED]", { error: error.message });
      return false;
    }
    return (data?.length ?? 0) < MAX_UPLOADS_PER_SESSION;
  } catch (err) {
    console.error("[WEBCHAT][UPLOAD][BUDGET][ERROR]", err instanceof Error ? err.message : String(err));
    return false;
  }
}

export interface StoredUpload {
  path: string;
  kind: MediaKind;
  mime: string;
  size: number;
  filename: string | null;
}

/** Put the visitor's file in the bucket. Returns the key their next `send` will reference. */
export async function storeVisitorUpload(input: {
  orgId: string;
  sessionId: string;
  mime: string;
  bytes: Buffer;
  filename?: string | null;
}): Promise<StoredUpload | null> {
  const kind = webChatUploadKind(input.mime);
  if (!kind) return null;
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_WEBCHAT_UPLOAD_BYTES) return null;

  const path = `${sessionUploadPrefix(input.orgId, input.sessionId)}/${randomUUID()}.${extensionFor(input.mime)}`;

  try {
    const { error } = await supabaseAdmin.storage.from(CHANNEL_MEDIA_BUCKET).upload(path, input.bytes, {
      contentType: input.mime,
      upsert: false,
    });
    if (error) {
      console.error("[WEBCHAT][UPLOAD][STORE][FAILED]", { org_id: input.orgId, error: error.message });
      return null;
    }
  } catch (err) {
    console.error("[WEBCHAT][UPLOAD][STORE][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }

  return {
    path,
    kind,
    mime: input.mime,
    size: input.bytes.byteLength,
    /**
     * The visitor's own filename is never used as part of the storage key — only shown. A name
     * chosen by a stranger has no business deciding where a file lands.
     */
    filename: sanitizeFilename(input.filename),
  };
}

/** Control characters have no place in a displayed name — and a NUL in a header is an attack. */
function stripControlChars(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 32 && code !== 127) out += ch;
  }
  return out;
}

/** A filename safe to display: no path, no control characters, bounded length. */
export function sanitizeFilename(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = stripControlChars(base).trim();
  return cleaned ? cleaned.slice(0, 120) : null;
}

/**
 * Read a visitor's upload back out of our own bucket.
 *
 * The only resolver that does not go out to the internet: the file is already ours, so perception
 * downloads it, reads it, and — because `storagePath` is set — does not store it a second time.
 */
export function webChatMediaResolver(orgId: string, sessionId: string): MediaResolver {
  return async (attachment: InboundAttachment) => {
    if (!isOwnedUpload(attachment.ref, orgId, sessionId)) {
      console.error("[WEBCHAT][MEDIA][FOREIGN_PATH]", { org_id: orgId });
      return null;
    }

    try {
      const { data, error } = await supabaseAdmin.storage.from(CHANNEL_MEDIA_BUCKET).download(attachment.ref);
      if (error || !data) {
        console.warn("[WEBCHAT][MEDIA][DOWNLOAD][FAILED]", { error: error?.message });
        return null;
      }

      const bytes = Buffer.from(await data.arrayBuffer());
      if (bytes.byteLength > MAX_WEBCHAT_UPLOAD_BYTES) return null;

      const mime = attachment.mime || data.type || "application/octet-stream";
      return {
        mime,
        base64: bytes.toString("base64"),
        size: bytes.byteLength,
        filename: attachment.filename ?? null,
      };
    } catch (err) {
      console.warn("[WEBCHAT][MEDIA][DOWNLOAD][ERROR]", err instanceof Error ? err.message : String(err));
      return null;
    }
  };
}

/** Turn what `send` was given into attachment descriptors, dropping anything not this session's. */
export function webChatAttachmentsFrom(
  raw: unknown,
  orgId: string,
  sessionId: string
): InboundAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: InboundAttachment[] = [];

  for (const item of raw.slice(0, MAX_UPLOADS_PER_SESSION)) {
    const ref = typeof (item as { ref?: unknown })?.ref === "string" ? (item as { ref: string }).ref : "";
    if (!isOwnedUpload(ref, orgId, sessionId)) continue;

    const mime = typeof (item as { mime?: unknown })?.mime === "string" ? (item as { mime: string }).mime : null;
    const filename = sanitizeFilename((item as { filename?: string | null })?.filename ?? null);

    out.push({
      // The client's claim about the kind is ignored: it is derived from the mime we accepted at
      // upload time, and a mime the allow-list rejected never produced a key in the first place.
      kind: kindForMime(mime),
      mime,
      filename,
      ref,
      // Already ours — perception reads it, and must not store it again.
      storagePath: ref,
    });
  }

  return out;
}
