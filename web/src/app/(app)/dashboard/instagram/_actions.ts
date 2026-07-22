"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { disconnectConnection } from "@/lib/instagram/connections";
import { subscribeInstagramAccount } from "@/lib/instagram/subscribe";

/** Resolve the caller's org + role, enforcing owner/admin. */
async function requireOrgAdmin(): Promise<
  { ok: true; orgId: string } | { ok: false; error: string }
> {
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
  return { ok: true, orgId: profile.org_id };
}

/**
 * TEMPORARY operator action (Sprint 1.5): subscribe THIS org's connected Instagram
 * account to its webhooks from the dashboard, so an operator without a terminal can
 * run the backfill. Same effect as `POST /api/instagram/subscribe` but scoped to the
 * caller's own org. Remove after the webhook path is verified.
 */
export async function subscribeInstagramForCurrentOrgAction(): Promise<{
  ok: boolean;
  fields?: string[];
  error?: string;
}> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  const res = await subscribeInstagramAccount(auth.orgId);
  return { ok: res.ok, fields: res.fields, error: res.error };
}

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
