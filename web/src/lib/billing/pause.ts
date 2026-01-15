import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import { unbindOrgPhoneNumbers, rebindOrgPhoneNumbers } from "@/lib/vapi/phoneNumberBinding";

/**
 * Pause the workspace by setting workspace_status = 'paused', paused_at = now(), and paused_reason.
 * ALWAYS sets paused_reason:
 *   - 'hard_cap' for hard_cap reason
 *   - 'past_due' for payment_failed reason
 * Updates public.organization_settings table using supabaseAdmin (service role) to bypass RLS.
 * Throws error if update fails (does not swallow errors).
 */
export async function pauseOrgBilling(
  orgId: string,
  reason: "hard_cap" | "payment_failed",
  details?: Record<string, unknown>
): Promise<void> {
  const pausedAt = new Date().toISOString();
  // Always set paused_reason based on reason parameter
  const pausedReason: "hard_cap" | "past_due" = reason === "hard_cap" ? "hard_cap" : "past_due";

  const { error } = await supabaseAdmin
    .from("organization_settings")
    .upsert(
      {
        org_id: orgId,
        workspace_status: "paused",
        paused_at: pausedAt,
        paused_reason: pausedReason, // Always set paused_reason
      },
      { onConflict: "org_id" }
    );

  if (error) {
    const errorMsg = `Failed to pause workspace: ${error.message}`;
    // Log error before throwing (do not swallow errors)
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
        error_hint: error.hint,
        table: "public.organization_settings",
        column: "paused_reason",
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
      paused_reason: pausedReason, // Always set
      paused_at: pausedAt,
      table: "public.organization_settings",
      ...details,
    },
  });

  // CRITICAL: Unbind phone numbers from assistants to prevent inbound calls
  // This MUST succeed - VAPI routing is controlled by phone number assistantId
  // If unbind fails, the org is paused in DB but calls will still ring (CRITICAL BUG)
  try {
    await unbindOrgPhoneNumbers(orgId, pausedReason);
  } catch (unbindErr) {
    // CRITICAL ERROR: Unbind failed - org is paused in DB but telephony is NOT stopped
    const errorMsg = unbindErr instanceof Error ? unbindErr.message : String(unbindErr);
    logEvent({
      tag: "[BILLING][PAUSE][UNBIND_CRITICAL_ERROR]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: {
        reason: reason,
        paused_reason: pausedReason,
        error: errorMsg,
        critical: true,
        message: "Org paused in DB but phone numbers NOT unbound - calls will still ring",
        ...details,
      },
    });
    // Re-throw to ensure caller knows unbind failed
    // DB update succeeded, but telephony is NOT stopped
    throw new Error(`Failed to unbind phone numbers: ${errorMsg}. Org is paused in DB but calls may still ring.`);
  }
}

/**
 * Resume organization billing (set back to active).
 * Updates organization_settings table.
 * Rebinds phone numbers to assistants if org was paused.
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
        workspace_status: "active",
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

  // CRITICAL: Rebind phone numbers to assistants to allow inbound calls again
  // rebindOrgPhoneNumbers has guard - will not rebind if still billing-paused
  // If rebind fails, the org is active in DB but calls will NOT ring (CRITICAL BUG)
  try {
    await rebindOrgPhoneNumbers(orgId);
  } catch (rebindErr) {
    // CRITICAL ERROR: Rebind failed - org is active in DB but telephony is NOT restored
    const errorMsg = rebindErr instanceof Error ? rebindErr.message : String(rebindErr);
    logEvent({
      tag: "[BILLING][RESUME][REBIND_CRITICAL_ERROR]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: {
        error: errorMsg,
        critical: true,
        message: "Org active in DB but phone numbers NOT rebound - calls will NOT ring",
        ...details,
      },
    });
    // Re-throw to ensure caller knows rebind failed
    // DB update succeeded, but telephony is NOT restored
    throw new Error(`Failed to rebind phone numbers: ${errorMsg}. Org is active in DB but calls may not ring.`);
  }
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
