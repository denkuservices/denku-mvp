/**
 * The dashboard gate decision, carried in a signed cookie (perf, 2026-09-04).
 *
 * `middleware.ts` runs on EVERY request into `/dashboard` and `/onboarding` — including the RSC
 * fetch behind every client-side navigation — and it used to spend three sequential network
 * round-trips there before Next even began rendering the page: `auth.getUser()` (an HTTP call to
 * Supabase Auth, not a token decode), then `profiles`, then `organization_settings`. With the
 * database in `us-west-2` and the functions in `iad1` that is roughly a third of a second of
 * cross-country waiting, paid again on every menu click, and it is the single largest fixed cost
 * in a page transition.
 *
 * Two of those three answers barely change: which org a person belongs to, and whether their
 * onboarding has finished. So the middleware records the decision it reached and re-uses it for a
 * few minutes instead of re-deriving it. The cookie is HMAC-signed, so a visitor cannot forge one
 * to walk past onboarding, and it is **bound to the user id inside the verified JWT**, so it
 * cannot be lifted from one session and replayed in another.
 *
 * Three properties make this safe to trust:
 *
 * 1. **Only the ALLOW decision is cached.** A miss, an expiry, a bad signature or a user id that
 *    does not match the session all fall through to the original full check. Nothing is ever
 *    denied on the strength of this cookie.
 * 2. **Ten minutes, and the full check runs again.** That bounds how long a revoked session, a
 *    deleted user or a reset `onboarding_step` can keep a dashboard open — the full path still
 *    calls `auth.getUser()`, which is what actually notices those, so this shortens the interval
 *    between those checks rather than removing them.
 * 3. **No key, no shortcut.** If the signing key is absent the helpers return null and every
 *    request takes the original path. The optimisation disappears; the gate does not.
 *
 * The signature uses WebCrypto rather than `node:crypto` because middleware runs on the Edge
 * runtime, where `createHmac` does not exist. It derives its own key with HKDF from the
 * deployment's existing `SECRET_ENCRYPTION_KEY` — the same reasoning as `deriveSubkey` in
 * `lib/crypto/secretBox.ts`: a distinct key per purpose, and no second env var for an operator
 * to lose.
 */

const KEY_ENVS = ["SECRET_ENCRYPTION_KEY", "INSTAGRAM_TOKEN_ENCRYPTION_KEY"] as const;
const HKDF_LABEL = "denku:dashboard:gate:v1";

/** How long a recorded decision is trusted before the full check runs again. */
export const GATE_COOKIE_TTL_SECONDS = 10 * 60;

export const GATE_COOKIE_NAME = "denku_gate";

export interface GateDecision {
  /** `auth.users.id` this decision was reached for. Must match the session presenting it. */
  uid: string;
  /**
   * The org resolved by matching `profiles.auth_user_id` — the rule the gate itself uses, and the
   * one `lib/org/getActiveOrgId.ts` uses.
   */
  org: string;
  /**
   * The org on the row matching `profiles.id`, or null when there is no such row (or it carries
   * no org). Recorded ALONGSIDE `org` because this repo's resolvers deliberately disagree about
   * which column identifies a person — `resolveViewer` prefers `id` and falls back to
   * `auth_user_id`, `getActiveOrgId` uses `auth_user_id` only (CLAUDE.md landmines #16/#20).
   *
   * Carrying both answers is what lets a page skip the `profiles` query without any resolver
   * silently adopting another's rule: each still applies its own preference, to values derived
   * from the same rows the query would have returned.
   *
   * Absent on a cookie minted before this field existed; callers that need it must treat
   * `undefined` as "not recorded" and fall back to the query, which `readGateDecision` allows.
   */
  orgById?: string | null;
  /** `organization_settings.onboarding_step`, so the billing allowlist behaves identically. */
  step: number;
  /** Email was confirmed at the time of the full check. */
  ec: boolean;
  /** Unix seconds. */
  exp: number;
}

function rawKey(): Uint8Array | null {
  let raw = "";
  for (const name of KEY_ENVS) {
    raw = (process.env[name] ?? "").trim();
    if (raw) break;
  }
  if (!raw) return null;

  try {
    // Accept the same base64-or-hex shapes `secretBox` accepts, so one deployed key serves both.
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      const out = new Uint8Array(32);
      for (let i = 0; i < 32; i++) out[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
      return out;
    }
    const bin = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.length === 32 ? out : null;
  } catch {
    return null;
  }
}

let cachedKey: CryptoKey | null = null;

/**
 * The HMAC key, derived once per runtime instance.
 *
 * Returns null when nothing is configured — callers must then skip the fast path entirely rather
 * than fall back to an unsigned cookie, which would be forgeable.
 */
async function signingKey(): Promise<CryptoKey | null> {
  if (cachedKey) return cachedKey;

  const secret = rawKey();
  if (!secret) return null;

  try {
    const base = await crypto.subtle.importKey("raw", secret as BufferSource, "HKDF", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(0),
        info: new TextEncoder().encode(HKDF_LABEL),
      },
      base,
      256
    );
    cachedKey = await crypto.subtle.importKey(
      "raw",
      bits,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
    return cachedKey;
  } catch {
    return null;
  }
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array | null {
  try {
    const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/**
 * Encode a decision as `<payload>.<signature>`.
 *
 * Deliberately not a JWT: there is no algorithm field to confuse and no key id to resolve, so the
 * only thing that can verify one of these is this file — the same reasoning as
 * `lib/webchat/token.ts`. Returns null when signing is unavailable.
 */
export async function signGateDecision(
  decision: Omit<GateDecision, "exp">,
  ttlSeconds: number = GATE_COOKIE_TTL_SECONDS
): Promise<string | null> {
  const key = await signingKey();
  if (!key) return null;

  const payload: GateDecision = { ...decision, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

/**
 * Verify a cookie and return the decision it carries, or null.
 *
 * Null covers every failure identically — missing, malformed, wrong signature, expired — because
 * the caller's response to all of them is the same: do the real check.
 */
export async function readGateDecision(token: string | undefined | null): Promise<GateDecision | null> {
  if (!token) return null;

  const dot = token.indexOf(".");
  if (dot <= 0) return null;

  const key = await signingKey();
  if (!key) return null;

  const body = token.slice(0, dot);
  const sig = fromB64url(token.slice(dot + 1));
  if (!sig) return null;

  try {
    const ok = await crypto.subtle.verify("HMAC", key, sig as BufferSource, new TextEncoder().encode(body));
    if (!ok) return null;

    const bytes = fromB64url(body);
    if (!bytes) return null;
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as GateDecision;

    if (
      typeof parsed?.uid !== "string" ||
      typeof parsed?.org !== "string" ||
      typeof parsed?.step !== "number" ||
      typeof parsed?.exp !== "number"
    ) {
      return null;
    }
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;

    return parsed;
  } catch {
    return null;
  }
}

/** True when this deployment can sign gate cookies at all. */
export async function isGateSigningConfigured(): Promise<boolean> {
  return (await signingKey()) !== null;
}
