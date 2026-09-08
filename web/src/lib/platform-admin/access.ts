import "server-only";

import { cache } from "react";
import { NextResponse } from "next/server";
import { getCachedUser } from "@/lib/auth/currentUser";

/**
 * Who may operate the PLATFORM, as opposed to a workspace.
 *
 * `lib/auth/permissions.ts` answers "who may do what inside a workspace" and deliberately has no
 * row for this: every capability there is scoped by `org_id`, and the whole point of these screens
 * is to read across all 43 of them and hand capacity to any one. Adding a `platform_admin`
 * capability to that matrix would have meant inventing a role that no workspace can grant and that
 * `guard()` would then have to special-case — a fourth role that is not a role.
 *
 * So this is a separate, deliberately narrow gate, and it makes four choices worth defending:
 *
 * 1. **The email comes from Supabase Auth, never from `profiles`.** `profiles.email` is an
 *    application-writable column; `auth.users.email` is changed only through a verified flow.
 *    Reading the former would mean anyone who could write their own profile row could name
 *    themselves the platform operator.
 * 2. **It is `getUser()`, not `getClaims()` and not the gate cookie.** Both of those are local
 *    verifications that were introduced (R-157) to make the DASHBOARD gate cheap, and the same
 *    document says the money-side checks keep paying for the round trip. A revoked session must
 *    not still be able to hand out free phone lines for the ten minutes the cookie lives.
 * 3. **The email must be confirmed.** An unconfirmed address is an assertion, not an identity.
 * 4. **An empty allowlist admits nobody.** A misconfigured environment fails closed here, unlike
 *    the dashboard gate which fails open — the house rule, and this is emphatically the money side.
 *
 * Note that this is only ONE of two locks. These screens live under `/admin`, which
 * `middleware.ts` already puts behind HTTP Basic Auth, so reaching them needs the operator
 * password *and* the right signed-in account. Neither is sufficient alone. Do not move a platform
 * route out from under `/admin` to avoid the Basic Auth prompt.
 */

/**
 * The default operator, in code rather than only in the environment.
 *
 * A deploy that forgets `PLATFORM_ADMIN_EMAILS` should still work for the person who owns the
 * platform, and the alternative — an empty allowlist on prod — locks the owner out of their own
 * billing analytics with no way in. The env var overrides it entirely, which is what makes this
 * rotatable without a deploy.
 */
const DEFAULT_PLATFORM_ADMINS = ["adkirikci@gmail.com"];

/** Parse the allowlist. Pure, so the test can drive it without an auth session. */
export function parsePlatformAdmins(raw: string | undefined): string[] {
  const configured = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return configured.length > 0 ? configured : DEFAULT_PLATFORM_ADMINS;
}

/** Is this the platform operator? Pure — the caller supplies what it read from Auth. */
export function isPlatformAdminEmail(
  email: string | null | undefined,
  emailConfirmed: boolean,
  allowlist: string[]
): boolean {
  if (!emailConfirmed) return false;
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return allowlist.includes(normalized);
}

export type PlatformAdmin = { userId: string; email: string };

/**
 * The signed-in platform operator, or null.
 *
 * Memoized per request the way `getViewer()` is — a page asks from the layout and again from two
 * or three sections, and each ask is otherwise a round trip to Supabase Auth.
 */
export const getPlatformAdmin = cache(async function getPlatformAdmin(): Promise<PlatformAdmin | null> {
  try {
    const user = await getCachedUser();
    if (!user) return null;

    // Supabase has used both names across versions; `requireVerifiedEmail.ts` reads them the same
    // way and the two must agree, or a user verified enough for the dashboard would be refused here.
    const confirmed = Boolean(
      (user as { email_confirmed_at?: string | null }).email_confirmed_at ??
        (user as { confirmed_at?: string | null }).confirmed_at
    );

    const allowlist = parsePlatformAdmins(process.env.PLATFORM_ADMIN_EMAILS);
    if (!isPlatformAdminEmail(user.email, confirmed, allowlist)) return null;

    return { userId: user.id, email: (user.email ?? "").toLowerCase() };
  } catch {
    // A broken auth read is not a platform operator.
    return null;
  }
});

/**
 * Gate for a platform API route.
 *
 * Refuses with 404, not 403. A 403 confirms the endpoint exists and that the caller merely lacks
 * the right account — which is a fact worth not publishing about a route that can provision phone
 * numbers. The Basic Auth layer in front has already made it unreachable to the public; this makes
 * it uninteresting to a signed-in customer who guesses the URL.
 */
export async function guardPlatformAdmin(): Promise<
  { ok: true; admin: PlatformAdmin } | { ok: false; response: NextResponse }
> {
  const admin = await getPlatformAdmin();
  if (admin) return { ok: true, admin };

  return {
    ok: false,
    response: NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }),
  };
}
