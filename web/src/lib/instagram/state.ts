import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * Signed, self-verifying OAuth `state` for the Instagram connect flow (CSRF +
 * org binding) — no server-side state store needed. Payload = `{ orgId, nonce,
 * exp }`, HMAC-SHA256'd with the app secret. The callback re-resolves org from
 * the session and requires it to match `orgId` here (defense in depth).
 *
 * Format: base64url(`<orgId>.<nonce>.<exp>`) + "." + base64url(hmac).
 */
const TTL_MS = 10 * 60 * 1000; // 10 minutes

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function createOAuthState(orgId: string, secret: string, now: number = Date.now()): string {
  const nonce = b64url(randomBytes(16));
  const payload = `${orgId}.${nonce}.${now + TTL_MS}`;
  const body = b64url(Buffer.from(payload, "utf8"));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyOAuthState(
  state: string,
  secret: string,
  now: number = Date.now()
): { ok: true; orgId: string } | { ok: false; reason: string } {
  const dot = state?.lastIndexOf(".");
  if (!state || dot <= 0) return { ok: false, reason: "malformed" };
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);

  const expected = createHmac("sha256", secret).update(body).digest();
  const provided = fromB64url(sig);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  const [orgId, , expStr] = fromB64url(body).toString("utf8").split(".");
  const exp = Number(expStr);
  if (!orgId || !Number.isFinite(exp)) return { ok: false, reason: "malformed_payload" };
  if (now > exp) return { ok: false, reason: "expired" };
  return { ok: true, orgId };
}
