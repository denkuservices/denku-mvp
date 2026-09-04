import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "denku_gate" && cookieValue ? { value: cookieValue } : undefined) }),
}));

import {
  orgIdByAuthUserId,
  orgIdPreferringProfileId,
  orgsFromGate,
  type ProfileRow,
} from "@/lib/auth/profileRows";
import { signGateDecision } from "@/lib/auth/gateCookie";

/**
 * Which workspace a person sees.
 *
 * `profiles` in this repo carries BOTH `id` and `auth_user_id`, and the resolvers built over the
 * years deliberately disagree about which one identifies someone: `resolveViewer` prefers `id` and
 * falls back to `auth_user_id`; `getActiveOrgId` uses `auth_user_id` only. CLAUDE.md landmine #20
 * is the story of what happens when those two answer differently — the dashboard shows one
 * workspace while capability checks run against another.
 *
 * Both were rewritten for speed (one query instead of two sequential ones; the middleware's signed
 * cookie instead of a query at all). These tests exist because a rewrite like that is exactly how
 * a resolver quietly adopts the other's rule.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const KEY = Buffer.alloc(32, 5).toString("base64");

const row = (r: Partial<ProfileRow>): ProfileRow => ({ id: null, auth_user_id: null, org_id: null, ...r });

describe("org resolution rules", () => {
  it("prefers the row keyed by profiles.id, then the one keyed by auth_user_id", () => {
    const rows = [row({ id: USER, org_id: "org-by-id" }), row({ auth_user_id: USER, org_id: "org-by-auth" })];
    expect(orgIdPreferringProfileId(rows, USER)).toBe("org-by-id");
    // The other rule does NOT fall back to `id` — that difference is the landmine.
    expect(orgIdByAuthUserId(rows, USER)).toBe("org-by-auth");
  });

  it("falls back to auth_user_id when no row is keyed by id", () => {
    const rows = [row({ auth_user_id: USER, org_id: "org-a" })];
    expect(orgIdPreferringProfileId(rows, USER)).toBe("org-a");
    expect(orgIdByAuthUserId(rows, USER)).toBe("org-a");
  });

  it("stops at the newest matching row rather than hunting for one that has an org", () => {
    /*
     * The original queries were `.eq(col, id).order(updated_at desc).limit(1)` followed by a
     * truthiness check — so a NEWER row without an org ended that attempt. Searching past it to an
     * older row that happens to carry an org would silently move somebody's workspace, which is
     * the whole reason this case is pinned.
     */
    const rows = [row({ auth_user_id: USER, org_id: null }), row({ auth_user_id: USER, org_id: "older-org" })];
    expect(orgIdByAuthUserId(rows, USER)).toBeNull();

    // Same rule on the id-preferring path: a newest id-row with no org falls THROUGH to
    // auth_user_id (that is the fallback), but never to an older id-row.
    const mixed = [
      row({ id: USER, org_id: null }),
      row({ id: USER, org_id: "older-id-org" }),
      row({ auth_user_id: USER, org_id: "auth-org" }),
    ];
    expect(orgIdPreferringProfileId(mixed, USER)).toBe("auth-org");
  });

  it("resolves nothing for a user with no rows", () => {
    expect(orgIdPreferringProfileId([], USER)).toBeNull();
    expect(orgIdByAuthUserId([], USER)).toBeNull();
    expect(orgIdPreferringProfileId([row({ id: OTHER, org_id: "someone-else" })], USER)).toBeNull();
    expect(orgIdByAuthUserId([row({ auth_user_id: OTHER, org_id: "someone-else" })], USER)).toBeNull();
  });
});

describe("org from the middleware's signed gate", () => {
  const ORIGINAL = process.env.SECRET_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.SECRET_ENCRYPTION_KEY = KEY;
    cookieValue = undefined;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
    else process.env.SECRET_ENCRYPTION_KEY = ORIGINAL;
  });

  it("carries both rules' answers, so neither resolver adopts the other's", async () => {
    cookieValue = (await signGateDecision({
      uid: USER,
      org: "org-by-auth",
      orgById: "org-by-id",
      step: 6,
      ec: true,
    }))!;

    const gate = await orgsFromGate(USER);
    expect(gate).toEqual({ byAuthUserId: "org-by-auth", byProfileId: "org-by-id" });
  });

  it("refuses a cookie belonging to a different session", async () => {
    // The whole point: a signed statement about someone else's workspace, replayed in this
    // browser, must resolve to nothing rather than to their org.
    cookieValue = (await signGateDecision({ uid: OTHER, org: "their-org", orgById: null, step: 6, ec: true }))!;
    expect(await orgsFromGate(USER)).toBeNull();
  });

  it("refuses a cookie minted before both answers were recorded", async () => {
    // `orgById` absent means "not recorded", not "no such row" — the caller must go to the
    // database rather than assume the id-keyed row does not exist. This is the shape every
    // cookie in a browser has during the ten minutes after this change deploys.
    cookieValue = (await signGateDecision({ uid: USER, org: "org-a", step: 6, ec: true } as never))!;
    expect(cookieValue).toBeTruthy();
    expect(await orgsFromGate(USER)).toBeNull();
  });

  it("refuses a tampered cookie, and an absent one", async () => {
    cookieValue = "not.a.real.token";
    expect(await orgsFromGate(USER)).toBeNull();

    cookieValue = undefined;
    expect(await orgsFromGate(USER)).toBeNull();
  });

  it("resolves nothing without a session id", async () => {
    cookieValue = (await signGateDecision({ uid: USER, org: "org-a", orgById: null, step: 6, ec: true }))!;
    expect(await orgsFromGate(null)).toBeNull();
  });

  it("records a null id-row honestly, so the id-preferring rule falls back", async () => {
    cookieValue = (await signGateDecision({ uid: USER, org: "org-a", orgById: null, step: 6, ec: true }))!;
    const gate = await orgsFromGate(USER);
    // `resolveViewer` computes `byProfileId ?? byAuthUserId` — the same fallback as the query.
    expect(gate?.byProfileId ?? gate?.byAuthUserId).toBe("org-a");
  });
});
