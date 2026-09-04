"use server";

import { getSessionUserId } from "@/lib/auth/currentUser";
import { getProfileRowsForUser, orgIdByAuthUserId, orgsFromGate } from "@/lib/auth/profileRows";

/**
 * Resolve org_id for the current authenticated user.
 * Queries public.profiles using auth_user_id.
 * 
 * @returns org_id string if found, null otherwise
 * @throws if user is not authenticated
 */
export async function getActiveOrgId(): Promise<string | null> {
  // Identity from the session's JWT, verified locally (`getSessionUserId`) rather than by an
  // HTTP call to Supabase Auth.
  const userId = await getSessionUserId();
  if (!userId) {
    throw new Error("Not authenticated");
  }

  /*
   * The rule here is unchanged and must stay so: `auth_user_id` only, newest row first, and NO
   * fallback to `id` (CLAUDE.md landmine #20). The gate cookie records exactly that answer
   * alongside the other rule's, so reading it is not adopting a different resolver — it is the
   * same rule, applied by the middleware one hop earlier, to the same rows.
   */
  const gate = await orgsFromGate(userId);
  if (gate) return gate.byAuthUserId ?? null;

  return orgIdByAuthUserId(await getProfileRowsForUser(userId), userId);
}
