import { supabaseAdmin } from "@/lib/supabase/admin";
import { getWorkspaceStatus } from "@/lib/workspace-status";
import { getOrgBillingStatus } from "@/lib/billing/pause";

/**
 * Plan-to-concurrency limit mapping.
 * Centralized in this file - do not hardcode elsewhere.
 */
const PLAN_CONCURRENCY_LIMITS: Record<string, number> = {
  mvp: 2,
  starter: 1,
  growth: 4,
  scale: 10,
};

/**
 * Safe fallback concurrency limit for unknown plans.
 */
const DEFAULT_CONCURRENCY_LIMIT = 1;

/**
 * Get organization plan and status.
 * Returns { plan: string, status: string } or null if not found.
 * 
 * Status is derived from:
 * 1. organization_settings.workspace_status and paused_reason (via getOrgBillingStatus)
 *    - If workspace_status='paused' and paused_reason in ('hard_cap','past_due'), blocks calls
 * 2. organizations.status (if column exists)
 * 3. organization_settings.workspace_status (fallback)
 * 4. Defaults to "active"
 * 
 * Plan is read from organizations.plan (defaults to "mvp" if missing/unknown).
 * 
 * TODO: Plan will move to a dedicated plans/org_plan model soon.
 * Currently uses organizations VIEW (which maps to orgs table with defaults).
 */
export async function getOrgPlan(orgId: string): Promise<{ plan: string; status: string } | null> {
  try {
    // Check billing status (derived from workspace_status and paused_reason)
    // Blocks if workspace_status='paused' and paused_reason in ('hard_cap','past_due')
    const billingStatus = await getOrgBillingStatus(orgId);
    if (billingStatus && billingStatus !== "active") {
      // Billing status blocks calls (org is billing-paused)
      return { plan: "mvp", status: "paused" }; // Return paused to block
    }

    // TODO: Plan will move to dedicated model. For now, using organizations VIEW (maps to orgs with defaults)
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("plan, status")
      .eq("id", orgId)
      .maybeSingle<{ plan: string | null; status: string | null }>();

    if (orgError) {
      // Column might not exist yet - fall back to workspace_status and default plan
      console.log("[CONCURRENCY] organizations.plan/status columns may not exist, using fallbacks");
      const workspaceStatus = await getWorkspaceStatus(orgId);
      return { plan: "mvp", status: workspaceStatus };
    }

    if (!org) {
      return null;
    }

    // Get status: prefer organizations.status, fallback to workspace_status
    let status = org.status ?? null;
    if (!status) {
      const workspaceStatus = await getWorkspaceStatus(orgId);
      status = workspaceStatus;
    }

    return {
      plan: org.plan ?? "mvp",
      status: status ?? "active",
    };
  } catch (err) {
    // Handle case where columns don't exist or other errors
    console.log("[CONCURRENCY] Exception fetching org plan, using defaults:", err);
    const workspaceStatus = await getWorkspaceStatus(orgId).catch(() => "active" as const);
    return { plan: "mvp", status: workspaceStatus };
  }
}

/**
 * Get concurrency limit for an organization based on plan and status.
 * 
 * Rules:
 * - If status != "active" => 0 (blocked/paused)
 * - Map plan to limit:
 *   - "mvp" => 2
 *   - "starter" => 1
 *   - "growth" => 4
 *   - "scale" => 10
 * - Unknown plan => 1 (safe fallback) + TODO
 * 
 * Returns the concurrency limit (number).
 */
export async function getOrgConcurrencyLimit(orgId: string): Promise<number> {
  const orgPlan = await getOrgPlan(orgId);

  if (!orgPlan) {
    // Org not found - safe fallback
    return DEFAULT_CONCURRENCY_LIMIT;
  }

  // If status is not "active", concurrency is blocked
  if (orgPlan.status !== "active") {
    return 0;
  }

  // Map plan to limit
  const limit = PLAN_CONCURRENCY_LIMITS[orgPlan.plan.toLowerCase()];

  if (limit === undefined) {
    // TODO: Log unknown plan for monitoring
    console.warn(`[CONCURRENCY] Unknown plan "${orgPlan.plan}" for org ${orgId}, using fallback limit`);
    return DEFAULT_CONCURRENCY_LIMIT;
  }

  return limit;
}
