import "server-only";

import { cache } from "react";
import { getSessionUserId } from "@/lib/auth/currentUser";
import { getProfileRowsForUser, orgIdPreferringProfileId, orgsFromGate } from "@/lib/auth/profileRows";

/**
 * Resolve the current user's org for platform (Sprint 5) server pages.
 *
 * `profiles` carries both `id` and `auth_user_id` (uuid) across this project's history, and
 * different code paths key on one or the other. This resolver tries both (id first, matching
 * the existing dashboard pages) so the new surfaces don't add a third inconsistent variant.
 * Returns null when unresolved (pages render an empty state rather than throwing).
 */
export async function resolveActiveOrgId(): Promise<string | null> {
  return (await resolveViewer()).orgId;
}

/**
 * The org AND the person looking at it.
 *
 * Some platform state is per-viewer rather than per-org — the Inbox's unread watermarks are the
 * first of them (`lib/platform/reads.ts`): whether the owner has read a conversation says
 * nothing about their colleague. Those surfaces need both ids from the one auth round-trip, so
 * the resolution lives here rather than being re-implemented beside each of them.
 *
 * **Wrapped in React `cache`**, so a layout and the page inside it share ONE auth round-trip
 * instead of two. `auth.getUser()` is an HTTP call to Supabase Auth rather than a token decode —
 * it validates the session against the server — which makes it one of the slowest single things
 * a dashboard request does, and it was being paid twice on every full page load.
 */
export const resolveViewer = cache(async function resolveViewer(): Promise<{
  orgId: string | null;
  userId: string | null;
}> {
  /*
   * Identity from the session's JWT, verified locally — no round-trip to Supabase Auth.
   * See `getSessionUserId`; the fallback there keeps this exactly as trustworthy as `getUser()`.
   */
  const userId = await getSessionUserId();
  if (!userId) return { orgId: null, userId: null };

  /*
   * The org, from the decision the middleware reached one hop ago when it can be trusted for this
   * session — otherwise from the database.
   *
   * The rule below is untouched either way: prefer the row keyed by `profiles.id`, fall back to
   * the one keyed by `auth_user_id` (CLAUDE.md landmine #20 — the two must not be merged). The
   * gate simply supplies both answers, computed from the same rows this query would return.
   *
   * The query itself is also no longer a ladder: the `id` attempt and the `auth_user_id` attempt
   * used to be two SEQUENTIAL round-trips, and for any account keyed by `auth_user_id` — which is
   * how signup writes them — the first one always missed.
   */
  const gate = await orgsFromGate(userId);
  if (gate) return { orgId: gate.byProfileId ?? gate.byAuthUserId ?? null, userId };

  const rows = await getProfileRowsForUser(userId);
  return { orgId: orgIdPreferringProfileId(rows, userId), userId };
});
