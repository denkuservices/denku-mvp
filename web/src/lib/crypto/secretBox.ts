import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Application-layer secret encryption (AES-256-GCM) for credentials at rest —
 * e.g. Instagram OAuth tokens (Sprint 1.5). Defense-in-depth ON TOP of the
 * service-role-only table + Supabase disk encryption: a DB dump or an accidental
 * log of a row still does not expose usable tokens without the key.
 *
 * Packed format: "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>".
 * Key: 32 bytes, base64 or hex. (Generate: `openssl rand -base64 32`.)
 * Missing/invalid key throws — callers that persist tokens must treat that as
 * "not configured", never store plaintext.
 *
 * The key is read from `SECRET_ENCRYPTION_KEY`, falling back to the original
 * `INSTAGRAM_TOKEN_ENCRYPTION_KEY`. The fallback is not legacy clutter: it is what
 * lets a second channel (Telegram bot tokens) encrypt with the key already deployed,
 * with no re-encryption and no second env var to lose. Set only ONE of them — two
 * different values would make previously stored ciphertext undecryptable.
 */
const KEY_ENVS = ["SECRET_ENCRYPTION_KEY", "INSTAGRAM_TOKEN_ENCRYPTION_KEY"] as const;

function getKey(): Buffer {
  let raw = "";
  for (const name of KEY_ENVS) {
    raw = (process.env[name] ?? "").trim();
    if (raw) break;
  }
  if (!raw) throw new Error(`[secretBox] none of ${KEY_ENVS.join(" / ")} is set`);
  // Accept base64 or hex; must decode to exactly 32 bytes.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== 32) {
    throw new Error(`[secretBox] encryption key must decode to 32 bytes (got ${key.length})`);
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

/**
 * A separate key for a separate purpose, derived from the one that is already deployed.
 *
 * Web Chat needs to SIGN session tokens, not encrypt anything — a different operation, and
 * using the encryption key directly for it would mean one leaked key breaks two unrelated
 * things and there is no way to rotate one without the other. HKDF gives an independent key
 * per label with no second env var for an operator to lose (the same reasoning that made
 * Telegram reuse `SECRET_ENCRYPTION_KEY` rather than introduce its own).
 *
 * Throws when no key is configured — callers must treat that as "not available", never as
 * "sign with something else".
 */
export function deriveSubkey(label: string): Buffer {
  return Buffer.from(hkdfSync("sha256", getKey(), Buffer.alloc(0), Buffer.from(label, "utf8"), 32));
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
