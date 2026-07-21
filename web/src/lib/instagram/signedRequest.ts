import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Parse + verify Meta's `signed_request` (the format used by the Deauthorize and
 * Data Deletion callbacks — NOT the webhook's X-Hub-Signature-256).
 *
 * Format: `<base64url(sig)>.<base64url(payloadJson)>`, where sig = HMAC-SHA256 of
 * the RAW base64url payload string, keyed with the app secret. Constant-time.
 * Pure + unit-tested — no env, no I/O. Returns null on any failure.
 */
export type SignedRequest = {
  userId: string | null; // Instagram-scoped user id
  issuedAt: number | null;
  raw: Record<string, unknown>;
};

export function parseSignedRequest(
  signedRequest: string | null | undefined,
  appSecret: string
): SignedRequest | null {
  if (!signedRequest || !appSecret) return null;
  const dot = signedRequest.indexOf(".");
  if (dot <= 0) return null;

  const encodedSig = signedRequest.slice(0, dot);
  const payload = signedRequest.slice(dot + 1);

  let sig: Buffer;
  try {
    sig = Buffer.from(encodedSig, "base64url");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (data.algorithm && String(data.algorithm).toUpperCase() !== "HMAC-SHA256") return null;

  return {
    userId: data.user_id != null ? String(data.user_id) : null,
    issuedAt: typeof data.issued_at === "number" ? data.issued_at : null,
    raw: data,
  };
}
