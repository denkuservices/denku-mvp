"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Check if an organization is in preview mode (no active plan).
 * 
 * Source of truth: `org_plan_limits.plan_code`
 * Rule: isPreviewMode = true if plan_code IS NULL, else false
 * 
 * Preview mode means:
 * - No active subscription/plan
 * - Organization is in trial/preview state
 * - Certain features should be gated (e.g., adding phone numbers)
 * 
 * @param orgId Organization ID
 * @returns true if in preview mode (no plan), false if plan is active
 */
export async function isPreviewMode(orgId: string): Promise<boolean> {
  const { data: planLimits } = await supabaseAdmin
    .from("org_plan_limits")
    .select("plan_code")
    .eq("org_id", orgId)
    .maybeSingle<{ plan_code: string | null }>();

  // Preview mode = no plan_code (NULL)
  return !planLimits?.plan_code;
}
