"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Resolve org_id for the current authenticated user.
 * Queries public.profiles using auth_user_id.
 * 
 * @returns org_id string if found, null otherwise
 * @throws if user is not authenticated
 */
export async function getActiveOrgId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  // Get profile with org_id
  const { data: profiles } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("auth_user_id", user.id)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (!profiles || profiles.length === 0 || !profiles[0].org_id) {
    return null;
  }

  return profiles[0].org_id;
}
