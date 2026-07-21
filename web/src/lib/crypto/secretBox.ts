import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-layer secret encryption (AES-256-GCM) for credentials at rest —
 * e.g. Instagram OAuth tokens (Sprint 1.5). Defense-in-depth ON TOP of the
 * service-role-only table + Supabase disk encryption: a DB dump or an accidental
 * log of a row still does not expose usable tokens without the key.
 *
 * Packed format: "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>".
 * Key: `INSTAGRAM_TOKEN_ENCRYPTION_KEY` — 32 bytes, provided as base64 or hex.
 * (Generate: `openssl rand -base64 32`.) Missing/invalid key throws — callers
 * that persist tokens must treat that as "not configured", never store plaintext.
 */
const KEY_ENV = "INSTAGRAM_TOKEN_ENCRYPTION_KEY";

function getKey(): Buffer {
  const raw = (process.env[KEY_ENV] ?? "").trim();
  if (!raw) throw new Error(`[secretBox] ${KEY_ENV} is not set`);
  // Accept base64 or hex; must decode to exactly 32 bytes.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== 32) {
    throw new Error(`[secretBox] ${KEY_ENV} must decode to 32 bytes (got ${key.length})`);
  }
  return key;
}

/** True when a usable encryption key is configured (no throw). */
export function isSecretBoxConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // GCM standard nonce size
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(packed: string): string {
  const parts = (packed ?? "").split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("[secretBox] malformed ciphertext");
  }
  const key = getKey();
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ct = Buffer.from(parts[3], "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
