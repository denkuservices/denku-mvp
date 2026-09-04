import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GATE_COOKIE_NAME, readGateDecision } from "@/lib/auth/gateCookie";

/**
 * The signed-in person's `profiles` row(s), fetched once per request (perf, 2026-09-04).
 *
 * This repo's `profiles` table carries **both** `id` and `auth_user_id`, and the resolvers built
 * over the years disagree about which one identifies a person: `resolveViewer` tries `id` first
 * and falls back to `auth_user_id`; `getActiveOrgId` matches `auth_user_id` only. Those
 * differences are deliberate and load-bearing (CLAUDE.md landmines #16/#20) — unifying them would
 * change which workspace some accounts see.
 *
 * What was NOT deliberate is the cost. `resolveViewer`'s fallback was two **sequential** queries,
 * and for any account keyed by `auth_user_id` — which is how signup writes them — the first one
 * always missed, so every platform page paid a wasted cross-country round-trip before it began.
 * Then `getActiveOrgId` asked a third time, and on the dashboard home two more components asked
 * again: five reads of one row, measured on a real workspace.
 *
 * So the rows are fetched **once**, matching either column, and each resolver picks from them with
 * its own rule intact. One round-trip per request instead of five; not one line of selection
 * semantics changed.
 *
 * Ordered `updated_at desc, created_at desc` — a superset of both callers' orderings, so "the
 * first matching row" still means what it meant to each of them.
 */
export interface ProfileRow {
  id: string | null;
  auth_user_id: string | null;
  org_id: string | null;
}

/** Supabase user ids are UUIDs; anything else is not going into a PostgREST `or` filter. */
const UUID = /^[0-9a-fA-F-]{36}$/;

export const getProfileRowsForUser = cache(async function getProfileRowsForUser(
  userId: string
): Promise<ProfileRow[]> {
  if (!userId || !UUID.test(userId)) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, auth_user_id, org_id")
    // Both identities in one query. The id is a verified UUID (checked above) precisely because
    // this value is interpolated into PostgREST's filter grammar rather than parameterised.
    .or(`id.eq.${userId},auth_user_id.eq.${userId}`)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as ProfileRow[];
});

/**
 * The org for this user, resolved the way `resolveViewer` has always resolved it: a row keyed by
 * `id` wins, then one keyed by `auth_user_id`; a row without an org is skipped either way.
 */
export function orgIdPreferringProfileId(rows: ProfileRow[], userId: string): string | null {
  // Deliberately "the newest row for this key, then does it have an org" — NOT "the newest row
  // that has an org". The original was `.eq(col, id).order(updated_at desc).limit(1)` followed by
  // a truthiness check, so a newer row without an org ended the `id` attempt rather than being
  // skipped over in favour of an older one. Reproducing that exactly is the whole point.
  const byId = rows.find((r) => r.id === userId);
  if (byId?.org_id) return byId.org_id;

  const byAuth = rows.find((r) => r.auth_user_id === userId);
  return byAuth?.org_id ?? null;
}

/**
 * The org for this user by `auth_user_id` only — `getActiveOrgId`'s rule, unchanged. Note it does
 * NOT fall back to `id`: that difference is the one landmine #20 is about.
 */
export function orgIdByAuthUserId(rows: ProfileRow[], userId: string): string | null {
  // Same shape as above: newest row for this key, then the org check — matching the original
  // `.limit(1)` exactly rather than searching past a newer row that has no org.
  return rows.find((r) => r.auth_user_id === userId)?.org_id ?? null;
}

/**
 * The org answers the middleware already worked out, if they belong to this session.
 *
 * The middleware resolves the same `profiles` rows one hop before the page renders, and records
 * both resolver rules' answers in its signed cookie. Reading them here removes the second half of
 * a serial prologue that every dashboard page paid before it could issue a single data query.
 *
 * Two conditions, both required. The cookie must be **validly signed** (so it cannot be forged to
 * point a page at another workspace), and its `uid` must match the id of the session actually
 * making this request (so a cookie lifted from someone else's browser resolves to nothing). The
 * caller supplies that id from `getSessionUserId()`, which verifies the JWT cryptographically.
 *
 * Returns null when there is nothing usable — an old cookie without `orgById`, an expired one, an
 * unsigned deployment — and every caller then does the query exactly as before.
 */
export async function orgsFromGate(
  userId: string | null
): Promise<{ byAuthUserId: string; byProfileId: string | null } | null> {
  if (!userId) return null;
  try {
    const gate = await readGateDecision((await cookies()).get(GATE_COOKIE_NAME)?.value);
    if (!gate || gate.uid !== userId || gate.orgById === undefined) return null;
    return { byAuthUserId: gate.org, byProfileId: gate.orgById };
  } catch {
    return null;
  }
}
