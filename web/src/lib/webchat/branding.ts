import "server-only";

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CHANNEL_MEDIA_BUCKET } from "@/lib/platform/media/store";

/**
 * The picture at the top of the chat panel — who a visitor thinks they are talking to.
 *
 * Small module, three decisions in it, and each one is the answer to a question that looked
 * open when the widget only had a name:
 *
 *   1. **It is stored, not linked.** A business pasting a URL to their own logo would be the
 *      easier feature and a broken one: the widget document is served under
 *      `img-src 'self' data:`, so a picture on anyone else's host does not render, and the
 *      alternative — putting a customer-typed origin into a CSP header — is a security control
 *      written by whoever last edited a settings field. So the file lands in our bucket and is
 *      served from our origin, and the header stays a constant.
 *
 *   2. **The allow-list is images a browser can actually draw, minus SVG.** An SVG is a
 *      document with scripting and external references in it; served from Denku's own origin it
 *      would be same-origin script, in the frame that holds a visitor's session token. PNG,
 *      JPEG and WebP cover every logo and portrait anyone will upload.
 *
 *   3. **512 KB.** This image is fetched by every visitor on every page that loads the widget.
 *      A 4 MB portrait would work perfectly in the preview and quietly cost a busy shop real
 *      bandwidth, which is the kind of bug nobody reports and everybody pays for.
 *
 * The one thing this file does NOT do is guess. A file whose bytes do not begin the way its
 * declared type says they should is refused rather than corrected: the sniff below is the only
 * check that survives a browser (or a script) lying about `Content-Type`.
 */

/** What a business may use as the widget's face. No SVG — see above. */
const AVATAR_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

export const MAX_AVATAR_BYTES = 512 * 1024;

/** `image/png` → `png`, or null when it is not something we accept. */
export function avatarExtension(mime: string | null | undefined): string | null {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  return AVATAR_TYPES[m] ?? null;
}

/**
 * Do the first bytes agree with the declared type?
 *
 * `File.type` comes from the browser, which reads it off the filename as often as not — and from
 * a script, it comes from whoever wrote the script. Since the answer to this question is later
 * echoed back to visitors as a `Content-Type`, it is worth reading the actual bytes: an HTML file
 * renamed `logo.png` and served as `image/png` is inert, and served as `text/html` is not.
 */
export function looksLikeImage(mime: string, bytes: Buffer): boolean {
  if (bytes.byteLength < 12) return false;
  const ext = avatarExtension(mime);
  if (ext === "png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (ext === "jpg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (ext === "webp") {
    return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

/** Where one install's avatars live. Org-first, like every other key in this bucket. */
export function avatarPrefix(orgId: string, connectionId: string): string {
  return `${orgId}/webchat/branding/${connectionId}`;
}

/** Is this key one this workspace's own install may point at? */
export function isOwnedAvatar(path: string | null | undefined, orgId: string, connectionId: string): boolean {
  if (typeof path !== "string" || path.includes("..")) return false;
  return path.startsWith(`${avatarPrefix(orgId, connectionId)}/`);
}

export type AvatarProblem = "too_large" | "unsupported_type" | "store_failed";

/**
 * Store a new avatar and return its key.
 *
 * A fresh uuid each time rather than a fixed name: the old file is deleted afterwards by the
 * caller, and a new key is what makes the change visible immediately to every browser and CDN
 * that had cached the last one. Overwriting a stable path would leave shops staring at their
 * previous logo for as long as the cache lived, and "it didn't save" is what they would report.
 */
export async function storeAvatar(input: {
  orgId: string;
  connectionId: string;
  mime: string;
  bytes: Buffer;
}): Promise<{ ok: true; path: string } | { ok: false; error: AvatarProblem }> {
  const ext = avatarExtension(input.mime);
  if (!ext || !looksLikeImage(input.mime, input.bytes)) return { ok: false, error: "unsupported_type" };
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_AVATAR_BYTES) {
    return { ok: false, error: "too_large" };
  }

  const path = `${avatarPrefix(input.orgId, input.connectionId)}/${randomUUID()}.${ext}`;

  try {
    const { error } = await supabaseAdmin.storage.from(CHANNEL_MEDIA_BUCKET).upload(path, input.bytes, {
      contentType: input.mime,
      upsert: false,
    });
    if (error) {
      console.error("[WEBCHAT][AVATAR][STORE][FAILED]", { org_id: input.orgId, error: error.message });
      return { ok: false, error: "store_failed" };
    }
  } catch (err) {
    console.error("[WEBCHAT][AVATAR][STORE][ERROR]", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "store_failed" };
  }

  return { ok: true, path };
}

/** Remove a replaced avatar. Best effort — an orphaned 40 KB file is not worth failing a save. */
export async function deleteAvatar(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    await supabaseAdmin.storage.from(CHANNEL_MEDIA_BUCKET).remove([path]);
  } catch {
    /* the column has already moved on; the bytes are just litter */
  }
}

export interface AvatarBytes {
  bytes: Buffer;
  mime: string;
}

/** Read an avatar back for the public serving route. Never throws. */
export async function readAvatar(path: string): Promise<AvatarBytes | null> {
  if (!path || path.includes("..")) return null;
  try {
    const { data, error } = await supabaseAdmin.storage.from(CHANNEL_MEDIA_BUCKET).download(path);
    if (error || !data) return null;
    const bytes = Buffer.from(await data.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_AVATAR_BYTES) return null;

    /**
     * The type is derived from the key we wrote, never from what storage reports.
     *
     * This value becomes a `Content-Type` on a response served from Denku's own origin. Deriving
     * it from an extension only this module ever writes means the set of possible answers is the
     * three image types above and nothing else.
     */
    const ext = path.split(".").pop()?.toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "jpg" ? "image/jpeg" : null;
    if (!mime) return null;

    return { bytes, mime };
  } catch (err) {
    console.warn("[WEBCHAT][AVATAR][READ][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** The built-in face, when a business has not chosen one. Same-origin, so the widget's CSP allows it. */
export const DEFAULT_AVATAR_URL = "/webchat/agent-avatar.svg";

/**
 * What the widget should load.
 *
 * The site key is already public (it is in the customer's page source), so using it as the
 * address here introduces no identifier a visitor did not already have — and unlike the
 * connection id, it is the one this channel already treats as an address.
 *
 * The `v` is the uploaded file's own id, which is what lets the response be cached hard and still
 * change the moment a business uploads a new picture: same address, different query, so no
 * browser and no CDN can hand back yesterday's logo. Without it the choice would be between a
 * stale avatar and re-fetching the same bytes on every page view of the customer's site.
 */
export function avatarUrlFor(connection: { siteKey: string; avatarPath: string | null }): string {
  if (!connection.avatarPath) return DEFAULT_AVATAR_URL;
  const version = connection.avatarPath.split("/").pop()?.split(".")[0] ?? "";
  return `/api/webchat/avatar/${encodeURIComponent(connection.siteKey)}?v=${encodeURIComponent(version)}`;
}
