import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify Meta's `X-Hub-Signature-256` header on an Instagram webhook POST.
 * Meta signs the RAW request body with the app secret: `sha256=<hex>`. The
 * comparison is constant-time. Pure + unit-tested — no env, no I/O.
 *
 * MUST be called with the raw body bytes exactly as received (parse AFTER).
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const m = signatureHeader.trim().match(/^sha256=([0-9a-f]+)$/i);
  if (!m) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(m[1], "hex");
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
