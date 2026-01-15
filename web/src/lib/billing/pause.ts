/**
 * BILLING PAUSE/RESUME - WRAPPERS FOR UNIFIED IMPLEMENTATION
 * 
 * ⚠️ DO NOT ADD BILLING-SPECIFIC PAUSE LOGIC HERE ⚠️
 * 
 * These functions are thin wrappers around the unified pauseWorkspace/resumeWorkspace.
 * ALL pause/resume logic is in web/src/lib/workspace/pause.ts to ensure identical behavior.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import { pauseWorkspace, resumeWorkspace } from "@/lib/workspace/pause";

/**
 * Pause workspace due to billing issue (hard_cap or payment_failed).
 * 
 * This is a wrapper around the unified pauseWorkspace() function.
 * ALL pause operations use the same code path for identical telephony behavior.
 */
export async function pauseOrgBilling(
  orgId: string,
  reason: "hard_cap" | "payment_failed",
  details?: Record<string, unknown>
): Promise<void> {
  // Map billing reason to paused_reason
  const pausedReason: "hard_cap" | "past_due" = reason === "hard_cap" ? "hard_cap" : "past_due";

  logEvent({
    tag: "[BILLING][PAUSE][WRAPPER]",
    ts: Date.now(),
    stage: "COST",
    source: "system",
    org_id: orgId,
    severity: "info",
    details: {
      reason: reason,
      paused_reason: pausedReason,
      message: "Calling unified pauseWorkspace",
      ...details,
    },
  });

  // Call unified pause implementation - same code path as UI pause
  await pauseWorkspace(orgId, pausedReason, {
    ...details,
    source: "billing",
    billing_reason: reason,
  });
}

/**
 * Resume workspace after billing issue resolved.
 * 
 * This is a wrapper around the unified resumeWorkspace() function.
 * ALL resume operations use the same code path for identical telephony behavior.
 */
export async function resumeOrgBilling(
  orgId: string,
  details?: Record<string, unknown>
): Promise<void> {
  logEvent({
    tag: "[BILLING][RESUME][WRAPPER]",
    ts: Date.now(),
    stage: "COST",
    source: "system",
    org_id: orgId,
    severity: "info",
    details: {
      message: "Calling unified resumeWorkspace",
      ...details,
    },
  });

  // Call unified resume implementation - same code path as UI resume
  await resumeWorkspace(orgId, {
    ...details,
    source: "billing",
  });
}

/**
 * Get organization billing status.
 */
export async function getOrgBillingStatus(
  orgId: string
): Promise<"active" | "past_due" | "paused" | null> {
  const { data } = await supabaseAdmin
    .from("organization_settings")
    .select("billing_status")
    .eq("org_id", orgId)
    .maybeSingle<{ billing_status: string | null }>();

  if (!data) {
    return null;
  }

  const status = data.billing_status;
  if (status === "active" || status === "past_due" || status === "paused") {
    return status;
  }

  return "active"; // Default to active if invalid
}
