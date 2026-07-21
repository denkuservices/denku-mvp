"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { disconnectConnection } from "@/lib/instagram/connections";

/**
 * Disconnect the org's Instagram connection: clears the stored token and marks
 * the row revoked. Owner/admin only (connecting a business account is sensitive).
 */
export async function disconnectInstagramAction(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("auth_user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ org_id: string | null; role: string | null }>();

  if (!profile?.org_id) return { ok: false, error: "No organization" };
  if (profile.role !== "owner" && profile.role !== "admin") {
    return { ok: false, error: "Only owners and admins can manage Instagram" };
  }

  return disconnectConnection(profile.org_id);
}
