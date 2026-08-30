import "server-only";

import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * One cached read of an org's `organization_settings` row per request (perf, 2026-08-31).
 *
 * A single dashboard page render used to read this same row THREE times over three separate
 * network round-trips — `getWorkspaceStatus`, `isWorkspacePaused` and `getOrgTimezone` each
 * `SELECT`ed a different column. Wrapped in React `cache()` and selecting every column those
 * callers need at once, the whole request tree now pays ONE query. `cache()` keys on `orgId`, so
 * two orgs in the (rare) same request stay distinct, and the memoization lives only for that
 * request — a pause landing in a later request is seen normally.
 *
 * Reads through the service-role client with an explicit `org_id` filter, matching how
 * `workspace-status.ts` already reads privileged settings; the `orgId` is always resolved from the
 * authenticated viewer upstream, so this never widens access.
 */
export interface OrgSettingsContext {
  workspaceStatus: "active" | "paused";
  defaultTimezone: string;
  onboardingStep: number;
}

export const getOrgSettingsContext = cache(async function getOrgSettingsContext(
  orgId: string
): Promise<OrgSettingsContext> {
  const { data, error } = await supabaseAdmin
    .from("organization_settings")
    .select("workspace_status, default_timezone, onboarding_step")
    .eq("org_id", orgId)
    .maybeSingle<{
      workspace_status: "active" | "paused" | null;
      default_timezone: string | null;
      onboarding_step: number | null;
    }>();

  // Defaults match the pre-existing per-helper fallbacks exactly (active / UTC / 0), so a missing
  // or unreadable row behaves as it did before this consolidation.
  if (error || !data) {
    return { workspaceStatus: "active", defaultTimezone: "UTC", onboardingStep: 0 };
  }

  return {
    workspaceStatus: data.workspace_status === "paused" ? "paused" : "active",
    defaultTimezone: data.default_timezone ?? "UTC",
    onboardingStep: data.onboarding_step ?? 0,
  };
});
