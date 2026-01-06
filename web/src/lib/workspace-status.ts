"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Check if a workspace is paused
 * Returns true if workspace_status is 'paused', false otherwise
 */
export async function isWorkspacePaused(orgId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("organization_settings")
    .select("workspace_status")
    .eq("org_id", orgId)
    .maybeSingle<{ workspace_status: "active" | "paused" }>();

  if (error || !data) {
    // Default to active if settings not found
    return false;
  }

  return data.workspace_status === "paused";
}

/**
 * Get workspace status for an org
 * Returns 'active' | 'paused' (defaults to 'active')
 */
export async function getWorkspaceStatus(orgId: string): Promise<"active" | "paused"> {
  const { data, error } = await supabaseAdmin
    .from("organization_settings")
    .select("workspace_status")
    .eq("org_id", orgId)
    .maybeSingle<{ workspace_status: "active" | "paused" }>();

  if (error || !data) {
    return "active"; // Default to active
  }

  return data.workspace_status;
}

