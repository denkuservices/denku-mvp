"use server";

import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GATE_COOKIE_NAME } from "@/lib/auth/gateCookie";

export async function signOutAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: error.message };

  /*
   * Drop the middleware's cached gate decision too.
   *
   * It is bound to the user id inside the session's JWT, so leaving it behind would not let
   * anyone in — the next request has no session to match it against, and a different person
   * signing in on this browser presents a different id. Clearing it is hygiene: a signed
   * statement about somebody's workspace should not outlive their session on a shared machine.
   */
  (await cookies()).delete(GATE_COOKIE_NAME);

  return { ok: true };
}
