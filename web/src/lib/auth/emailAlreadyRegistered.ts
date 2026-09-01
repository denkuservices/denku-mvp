import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Is this email a workspace that already finished signing up?
 *
 * **Why this is asked before any email is sent.** Signup calls
 * `signInWithOtp({ shouldCreateUser: true })`, and Supabase picks the email TEMPLATE from whether
 * the address already exists: a new address gets "Confirm signup" (the eight-digit code the form
 * promises), an existing one gets "Magic Link". So an existing customer who typed their address
 * into the signup form was mailed a one-click sign-in link — and clicking it dropped them
 * straight into their own dashboard, with no explanation of why the account they were "creating"
 * was already there. Nobody chose that behaviour; it is Supabase's template routing showing
 * through a form that had no idea who it was talking to.
 *
 * The fix is to ask first, and to say so rather than send anything.
 *
 * **"Registered" means a `profiles` row, not an `auth.users` row, and the difference matters.**
 * An auth user with no profile is somebody who asked for a code and never came back — mid-signup,
 * not signed up. They still need their code, and refusing them would strand them with an account
 * they cannot reach and no password to sign in with. A profile row is written on every path that
 * completes a workspace (`ensureDefaultOrg`, `bootstrapOrgAndProfile`, `signupAction`), always
 * carrying the auth email, so it is exactly the line between "has an account" and "was in the
 * middle of making one".
 */

export type RegistrationCheck =
  /** A finished account exists for this address. Send nothing. */
  | "registered"
  /** No finished account — either brand new, or a signup someone abandoned. */
  | "new"
  /** The lookup itself failed. The caller decides; nothing is known either way. */
  | "unknown";

export async function emailAlreadyRegistered(email: string): Promise<RegistrationCheck> {
  const address = email.trim();
  if (!address) return "new";

  try {
    /*
     * `ilike` with no wildcards is a case-insensitive match — but `_` is a single-character
     * wildcard in LIKE and is perfectly legal in an email, so `a_b@x.com` would also match
     * `axb@x.com`. PostgREST offers no ESCAPE clause, so the pattern is only used to NARROW and
     * the real comparison is done here, exactly. A wildcard can only widen the candidate set,
     * never hide a true match, so this is safe in the direction that matters.
     */
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .ilike("email", address)
      .limit(10);

    if (error) {
      console.error("[emailAlreadyRegistered] lookup failed:", error.message);
      return "unknown";
    }

    const wanted = address.toLowerCase();
    const match = (data ?? []).some(
      (row: { email: string | null }) => (row.email ?? "").trim().toLowerCase() === wanted
    );

    return match ? "registered" : "new";
  } catch (err) {
    console.error(
      "[emailAlreadyRegistered] threw:",
      err instanceof Error ? err.message : String(err)
    );
    return "unknown";
  }
}
