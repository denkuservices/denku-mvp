import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The signed-in user, fetched **once per request** (perf, 2026-09-04).
 *
 * `supabase.auth.getUser()` is not a token decode — it is an HTTP round-trip to Supabase Auth
 * that validates the session server-side. It is one of the slowest single things a dashboard
 * request does, and rendering one page used to pay for it three to six times over: the app
 * layout called it, then the org resolver, then a helper the page used, then often the page
 * itself again. Each was a separate client instance, so none of them shared an answer.
 *
 * React's `cache()` scopes memoization to the request, which is exactly the lifetime this answer
 * is valid for: within one render the session cannot change, and the next request starts fresh —
 * a sign-out or a token refresh is seen immediately, as before.
 *
 * Callers keep their own semantics. This only removes the duplicate network calls; who resolves
 * an org by `profiles.id` and who resolves it by `auth_user_id` is deliberately left alone
 * (CLAUDE.md landmine #16/#20 — those resolvers differ on purpose and unifying them would change
 * which workspace some accounts see).
 */
export const getCachedUser = cache(async function getCachedUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
});

/**
 * Same call, but surfacing the error the way `auth.getUser()` does.
 *
 * A few callers distinguish "no session" from "auth is broken" and must keep doing so; they get
 * the error without paying for a second round-trip.
 */
export const getCachedUserResult = cache(async function getCachedUserResult(): Promise<{
  user: User | null;
  error: { message: string } | null;
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return { user: data?.user ?? null, error: error ? { message: error.message } : null };
});

/**
 * Just the signed-in user's id — established WITHOUT a network call (perf, 2026-09-04).
 *
 * Almost everything a dashboard page does starts by asking "who is this, and which workspace?",
 * and answering the first half was costing a full HTTP round-trip to Supabase Auth before any
 * data query could begin. Measured on a real workspace it was the single most expensive item on
 * the page — a serial prologue nothing else could overlap with.
 *
 * `getClaims()` verifies the session's JWT against the project's ES256 public key locally, so the
 * id is just as trustworthy and costs nothing after the first JWKS fetch. It falls back to
 * `getUser()` on its own if the project ever reverts to a shared-secret token, and this function
 * falls back too if anything else goes wrong — so the id is never *less* verified than before,
 * only cheaper to obtain.
 *
 * Use this when the id is all you need. Anything that reads the user's email, metadata or
 * confirmation state must still go through `getCachedUser()`.
 */
export const getSessionUserId = cache(async function getSessionUserId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    if (typeof sub === "string" && sub) return sub;
  } catch {
    // Fall through to the authoritative call.
  }
  return (await getCachedUser())?.id ?? null;
});
