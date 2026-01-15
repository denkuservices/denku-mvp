import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";

/**
 * Pause the workspace by setting workspace_status = 'paused', paused_at = now(), and paused_reason.
 * Updates organization_settings table.
 * Uses supabaseAdmin (service role) to bypass RLS.
 */
export async function pauseOrgBilling(
  orgId: string,
  reason: "hard_cap" | "payment_failed",
  details?: Record<string, unknown>
): Promise<void> {
  const pausedAt = new Date().toISOString();
  const pausedReason = reason === "hard_cap" ? "hard_cap" : "past_due";

  const { error } = await supabaseAdmin
    .from("organization_settings")
    .upsert(
      {
        org_id: orgId,
        workspace_status: "paused",
        paused_at: pausedAt,
        paused_reason: pausedReason,
      },
      { onConflict: "org_id" }
    );

  if (error) {
    const errorMsg = `Failed to pause workspace: ${error.message}`;
    logEvent({
      tag: "[BILLING][PAUSE][ERROR]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: {
        reason: reason,
        paused_reason: pausedReason,
        error: error.message,
        error_code: error.code,
        ...details,
      },
    });
    throw new Error(errorMsg);
  }

  logEvent({
    tag: "[BILLING][PAUSE]",
    ts: Date.now(),
    stage: "COST",
    source: "system",
    org_id: orgId,
    severity: "warn",
    details: {
      workspace_status: "paused",
      reason: reason,
      paused_reason: pausedReason,
      paused_at: pausedAt,
      ...details,
    },
  });
}

/**
 * Resume organization billing (set back to active).
 * Updates organization_settings table.
 */
export async function resumeOrgBilling(
  orgId: string,
  details?: Record<string, unknown>
): Promise<void> {
  await supabaseAdmin
    .from("organization_settings")
    .upsert(
      {
        org_id: orgId,
        billing_status: "active",
        paused_reason: null,
        paused_at: null,
      },
      { onConflict: "org_id" }
    );

  logEvent({
    tag: "[BILLING][RESUME]",
    ts: Date.now(),
    stage: "COST",
    source: "system",
    org_id: orgId,
    severity: "info",
    details: {
      ...details,
    },
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
