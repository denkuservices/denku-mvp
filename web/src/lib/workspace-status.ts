"use server";

import { getOrgSettingsContext } from "@/lib/org/orgSettingsContext";

/**
 * Check if a workspace is paused
 * Returns true if workspace_status is 'paused', false otherwise
 *
 * Reads through the per-request cached settings context (perf, 2026-08-31) so this — a
 * load-bearing gate called on many mutation paths — shares one `organization_settings` round-trip
 * with the status/timezone reads instead of issuing its own. Default-false-when-missing preserved.
 */
export async function isWorkspacePaused(orgId: string): Promise<boolean> {
  return (await getOrgSettingsContext(orgId)).workspaceStatus === "paused";
}

/**
 * Get workspace status for an org
 * Returns 'active' | 'paused' (defaults to 'active')
 */
export async function getWorkspaceStatus(orgId: string): Promise<"active" | "paused"> {
  return (await getOrgSettingsContext(orgId)).workspaceStatus;
}

