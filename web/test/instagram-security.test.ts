import { describe, it, expect, beforeAll } from "vitest";
import { createHmac } from "node:crypto";
import { verifyMetaSignature } from "@/lib/instagram/signature";
import { createOAuthState, verifyOAuthState } from "@/lib/instagram/state";
import { parseSignedRequest } from "@/lib/instagram/signedRequest";

// Build a Meta-style signed_request (base64url(sig).base64url(payload)).
function makeSignedRequest(payload: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${sig}.${body}`;
}

// A valid 32-byte key (base64) for the token encryption tests.
beforeAll(() => {
  process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("verifyMetaSignature (X-Hub-Signature-256)", () => {
  const secret = "app-secret-123";
  const body = JSON.stringify({ object: "instagram", entry: [{ id: "17841400000000000" }] });
  const good = "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");

  it("accepts a correctly signed body", () => {
    expect(verifyMetaSignature(body, good, secret)).toBe(true);
  });
  it("rejects a wrong signature, wrong secret, tampered body", () => {
    expect(verifyMetaSignature(body, "sha256=deadbeef", secret)).toBe(false);
    expect(verifyMetaSignature(body, good, "different-secret")).toBe(false);
    expect(verifyMetaSignature(body + " ", good, secret)).toBe(false);
  });
  it("rejects missing / malformed headers and empty secret", () => {
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, "sha1=abc", secret)).toBe(false);
    expect(verifyMetaSignature(body, good, "")).toBe(false);
  });
});

describe("OAuth state (CSRF + org binding)", () => {
  const secret = "state-secret";
  const orgId = "org-abc-123";

  it("round-trips and returns the org id", () => {
    const state = createOAuthState(orgId, secret);
    expect(verifyOAuthState(state, secret)).toEqual({ ok: true, orgId });
  });
  it("rejects a wrong secret and a tampered token", () => {
    const state = createOAuthState(orgId, secret);
    expect(verifyOAuthState(state, "other")).toMatchObject({ ok: false });
    expect(verifyOAuthState(state.slice(0, -2) + "xx", secret)).toMatchObject({ ok: false });
  });
  it("rejects an expired state", () => {
    const past = Date.now() - 60 * 60 * 1000;
    const state = createOAuthState(orgId, secret, past);
    expect(verifyOAuthState(state, secret)).toMatchObject({ ok: false, reason: "expired" });
  });
  it("rejects malformed input", () => {
    expect(verifyOAuthState("garbage", secret)).toMatchObject({ ok: false });
    expect(verifyOAuthState("", secret)).toMatchObject({ ok: false });
  });
});

describe("parseSignedRequest (Meta deauthorize / data-deletion callbacks)", () => {
  const secret = "app-secret-xyz";

  it("parses a valid signed_request and returns the user id", () => {
    const sr = makeSignedRequest(
      { user_id: "17841400000000000", algorithm: "HMAC-SHA256", issued_at: 1720000000 },
      secret
    );
    const parsed = parseSignedRequest(sr, secret);
    expect(parsed?.userId).toBe("17841400000000000");
    expect(parsed?.issuedAt).toBe(1720000000);
  });

  it("rejects a wrong secret, a tampered payload, and malformed input", () => {
    const sr = makeSignedRequest({ user_id: "1" }, secret);
    expect(parseSignedRequest(sr, "other-secret")).toBeNull();
    expect(parseSignedRequest(sr.replace(/\.(.+)$/, ".dGFtcGVy"), secret)).toBeNull();
    expect(parseSignedRequest("nodot", secret)).toBeNull();
    expect(parseSignedRequest("", secret)).toBeNull();
    expect(parseSignedRequest(sr, "")).toBeNull();
  });

  it("rejects a non-HMAC-SHA256 algorithm", () => {
    const sr = makeSignedRequest({ user_id: "1", algorithm: "PLAINTEXT" }, secret);
    expect(parseSignedRequest(sr, secret)).toBeNull();
  });
});

describe("secretBox (AES-256-GCM token encryption)", () => {
  it("round-trips a token and produces versioned ciphertext", async () => {
    const { encryptSecret, decryptSecret, isSecretBoxConfigured } = await import("@/lib/crypto/secretBox");
    expect(isSecretBoxConfigured()).toBe(true);
    const token = "IGQVJ...long-lived-token...xyz";
    const packed = encryptSecret(token);
    expect(packed.startsWith("v1:")).toBe(true);
    expect(packed).not.toContain(token); // never stores plaintext
    expect(decryptSecret(packed)).toBe(token);
  });
  it("fails closed on a wrong key and malformed ciphertext", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto/secretBox");
    const packed = encryptSecret("secret");
    process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64"); // rotate key
    expect(() => decryptSecret(packed)).toThrow();
    process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); // restore
    expect(() => decryptSecret("not-valid")).toThrow();
  });
});
