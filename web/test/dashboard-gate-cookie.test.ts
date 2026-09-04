import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The signed gate cookie is what lets the middleware stop re-deriving "who is this and are they
 * onboarded" on every single dashboard navigation. It is therefore the one piece of the
 * performance work that could, if it were wrong, let somebody past a gate — so the properties
 * tested here are the ones the middleware relies on being true:
 *
 *   - a decision survives a round trip intact,
 *   - a tampered payload, a tampered signature or a foreign key is refused,
 *   - an expired decision is refused,
 *   - and with no key configured nothing is issued at all (so the middleware simply keeps doing
 *     the full check rather than trusting an unsigned value).
 */

const KEY = Buffer.alloc(32, 7).toString("base64");

async function freshModule() {
  // The derived HMAC key is memoised per module instance, so each env permutation needs its own.
  vi.resetModules();
  return import("@/lib/auth/gateCookie");
}

const ORIGINAL = process.env.SECRET_ENCRYPTION_KEY;
const ORIGINAL_IG = process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.SECRET_ENCRYPTION_KEY = KEY;
  delete process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
  else process.env.SECRET_ENCRYPTION_KEY = ORIGINAL;
  if (ORIGINAL_IG === undefined) delete process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY;
  else process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY = ORIGINAL_IG;
  vi.useRealTimers();
});

const decision = { uid: "user-1", org: "org-1", step: 6, ec: true };

describe("dashboard gate cookie", () => {
  it("round-trips a decision", async () => {
    const { signGateDecision, readGateDecision } = await freshModule();

    const token = await signGateDecision(decision);
    expect(token).toBeTruthy();

    const back = await readGateDecision(token);
    expect(back?.uid).toBe("user-1");
    expect(back?.org).toBe("org-1");
    expect(back?.step).toBe(6);
    expect(back?.ec).toBe(true);
    expect(back?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("refuses a payload edited after signing", async () => {
    const { signGateDecision, readGateDecision } = await freshModule();

    const token = (await signGateDecision({ ...decision, step: 1 }))!;
    const [, sig] = token.split(".");

    // Re-encode the payload claiming onboarding is finished, keeping the original signature.
    const forgedBody = Buffer.from(
      JSON.stringify({ ...decision, step: 6, exp: Math.floor(Date.now() / 1000) + 600 })
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(await readGateDecision(`${forgedBody}.${sig}`)).toBeNull();
  });

  it("refuses a token signed with a different key", async () => {
    const first = await freshModule();
    const token = (await first.signGateDecision(decision))!;

    process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const second = await freshModule();

    expect(await second.readGateDecision(token)).toBeNull();
  });

  it("refuses an expired decision", async () => {
    const { signGateDecision, readGateDecision } = await freshModule();

    const token = await signGateDecision(decision, 60);
    expect(await readGateDecision(token)).not.toBeNull();

    // Ten minutes on: the middleware must go back to the authoritative check, which is what
    // bounds how long a revoked session or a reset onboarding step can go unnoticed.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 10 * 60 * 1000);
    expect(await readGateDecision(token)).toBeNull();
  });

  it("issues nothing when no signing key is configured", async () => {
    delete process.env.SECRET_ENCRYPTION_KEY;
    const { signGateDecision, readGateDecision, isGateSigningConfigured } = await freshModule();

    expect(await isGateSigningConfigured()).toBe(false);
    expect(await signGateDecision(decision)).toBeNull();
    expect(await readGateDecision("anything.atall")).toBeNull();
  });

  it("treats malformed input as simply absent", async () => {
    const { readGateDecision } = await freshModule();

    for (const bad of [undefined, null, "", "nodot", ".onlysig", "a.b", "%%%.%%%"]) {
      expect(await readGateDecision(bad as string | undefined)).toBeNull();
    }
  });

  it("accepts a hex key, matching secretBox's key handling", async () => {
    process.env.SECRET_ENCRYPTION_KEY = "ab".repeat(32);
    const { signGateDecision, readGateDecision } = await freshModule();

    const token = await signGateDecision(decision);
    expect(await readGateDecision(token)).not.toBeNull();
  });
});
