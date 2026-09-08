import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Prove the person at the keyboard is the account holder.
 *
 * Two controls in this product can end a business: changing the password (which locks the real
 * owner out) and deleting the account (which ends it outright). Neither of the underlying Supabase
 * calls asks for the current password, so anyone reaching a signed-in tab — a shared laptop, a
 * stolen session cookie, an unlocked phone — could do either. This is the check that stands between
 * those two things and a borrowed session.
 *
 * **Why a throwaway client.** Verifying means signing in again, and `signInWithPassword` on the
 * request's own client would rotate the session and rewrite the auth cookies mid-request — a
 * "verification" that logs the caller out of their own action. So it runs on a client with
 * `persistSession: false` that shares no storage with the caller's session: the sign-in happens,
 * the result is read, and the token it minted is discarded immediately.
 *
 * Fails CLOSED. A missing public env, a network error, a wrong password — all the same answer, and
 * the caller never learns which.
 */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error("[SECURITY][REAUTH] Supabase public env missing; refusing re-authentication");
    return false;
  }
  if (!email || !password) return false;

  const throwaway = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { error } = await throwaway.auth.signInWithPassword({ email, password });
  if (error) return false;

  // Drop the token this verification minted; it must not outlive the check.
  await throwaway.auth.signOut({ scope: "local" }).catch(() => {});
  return true;
}
