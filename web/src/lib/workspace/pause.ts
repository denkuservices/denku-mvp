/**
 * UNIFIED WORKSPACE PAUSE/RESUME IMPLEMENTATION
 * 
 * ⚠️ CRITICAL: DO NOT ADD ANOTHER PAUSE PATH ⚠️
 * 
 * This is the SINGLE source of truth for all workspace pause/resume operations.
 * ALL pause/resume operations MUST go through these functions:
 * - UI manual pause/resume
 * - Billing pause (hard_cap / past_due)
 * - Any future pause source
 * 
 * These functions ensure IDENTICAL telephony behavior regardless of pause source.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import { unbindOrgPhoneNumbers, rebindOrgPhoneNumbers } from "@/lib/vapi/phoneNumberBinding";

/**
 * Pause workspace - UNIFIED IMPLEMENTATION
 * 
 * This function is called by ALL pause sources:
 * - UI manual pause (reason='manual')
 * - Billing hard cap (reason='hard_cap')
 * - Billing past due (reason='past_due')
 * 
 * Performs:
 * 1. Updates organization_settings (workspace_status='paused', paused_reason, paused_at)
 * 2. Calls VAPI API to unbind phone numbers (assistantId=null) - CRITICAL for telephony
 * 
 * Throws on failure - does NOT swallow errors.
 * Idempotent - safe to call multiple times.
 */
export async function pauseWorkspace(
  orgId: string,
  reason: "manual" | "hard_cap" | "past_due",
  details?: Record<string, unknown>
): Promise<void> {
  const pausedAt = new Date().toISOString();

  // Step 1: Update organization_settings
  const { error: dbError } = await supabaseAdmin
    .from("organization_settings")
    .upsert(
      {
        org_id: orgId,
        workspace_status: "paused",
        paused_at: pausedAt,
        paused_reason: reason, // Set paused_reason
      },
      { onConflict: "org_id" }
    );

  if (dbError) {
    const errorMsg = `Failed to pause workspace in DB: ${dbError.message}`;
    logEvent({
      tag: "[WORKSPACE][PAUSE][DB_ERROR]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: {
        reason: reason,
        error: dbError.message,
        error_code: dbError.code,
        ...details,
      },
    });
    throw new Error(errorMsg);
  }

  logEvent({
    tag: "[WORKSPACE][PAUSE][DB_SUCCESS]",
    ts: Date.now(),
    stage: "CALL",
    source: "system",
    org_id: orgId,
    severity: "warn",
    details: {
      workspace_status: "paused",
      reason: reason,
      paused_reason: reason,
      paused_at: pausedAt,
      ...details,
    },
  });

  // Step 2: CRITICAL - Unbind phone numbers from assistants via VAPI API
  // This is the ONLY way to stop inbound calls - VAPI routing is controlled by phone number assistantId
  // If this fails, the org is paused in DB but calls will still ring (CRITICAL BUG)
  try {
    await unbindOrgPhoneNumbers(orgId, reason);
  } catch (unbindErr) {
    // CRITICAL ERROR: Unbind failed - org is paused in DB but telephony is NOT stopped
    const errorMsg = unbindErr instanceof Error ? unbindErr.message : String(unbindErr);
    logEvent({
      tag: "[WORKSPACE][PAUSE][UNBIND_CRITICAL_ERROR]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: {
        reason: reason,
        paused_reason: reason,
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

  logEvent({
    tag: "[WORKSPACE][PAUSE][COMPLETE]",
    ts: Date.now(),
    stage: "CALL",
    source: "system",
    org_id: orgId,
    severity: "info",
    details: {
      reason: reason,
      paused_reason: reason,
      message: "Workspace paused successfully - DB updated and phone numbers unbound",
      ...details,
    },
  });
}

/**
 * Resume workspace - UNIFIED IMPLEMENTATION
 * 
 * This function is called by ALL resume sources:
 * - UI manual resume
 * - Billing resolve (payment succeeded)
 * 
 * Performs:
 * 1. Validates paused_reason - blocks resume if billing-related (hard_cap/past_due)
 * 2. Updates organization_settings (workspace_status='active', paused_reason=null, paused_at=null)
 * 3. Calls VAPI API to rebind phone numbers (assistantId restored) - CRITICAL for telephony
 * 
 * Throws on failure or if resume is not allowed.
 * rebindOrgPhoneNumbers has guard - will not rebind if still billing-paused.
 */
export async function resumeWorkspace(
  orgId: string,
  details?: Record<string, unknown>
): Promise<void> {
  // Step 1: Check if resume is allowed (fetch current paused_reason)
  const { data: orgSettings, error: fetchError } = await supabaseAdmin
    .from("organization_settings")
    .select("workspace_status, paused_reason")
    .eq("org_id", orgId)
    .maybeSingle<{
      workspace_status: "active" | "paused" | null;
      paused_reason: "manual" | "hard_cap" | "past_due" | null;
    }>();

  if (fetchError) {
    const errorMsg = `Failed to fetch org settings: ${fetchError.message}`;
    logEvent({
      tag: "[WORKSPACE][RESUME][FETCH_ERROR]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: {
        error: fetchError.message,
        ...details,
      },
    });
    throw new Error(errorMsg);
  }

  const pausedReason = orgSettings?.paused_reason;
  const currentStatus = orgSettings?.workspace_status ?? "active";

  // Step 1a: Block resume if billing-related pause (hard_cap/past_due)
  // Only allow resume if paused_reason is null or 'manual'
  if (currentStatus === "paused" && (pausedReason === "hard_cap" || pausedReason === "past_due")) {
    const errorMsg = "Billing issue. Update payment method to resume.";
    logEvent({
      tag: "[WORKSPACE][RESUME][BLOCKED]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "warn",
      details: {
        workspace_status: currentStatus,
        paused_reason: pausedReason,
        reason: "billing_paused",
        message: errorMsg,
        ...details,
      },
    });
    throw new Error(errorMsg);
  }

  // Step 2: Update organization_settings
  const { error: dbError } = await supabaseAdmin
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

  if (dbError) {
    const errorMsg = `Failed to resume workspace in DB: ${dbError.message}`;
    logEvent({
      tag: "[WORKSPACE][RESUME][DB_ERROR]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: {
        error: dbError.message,
        error_code: dbError.code,
        ...details,
      },
    });
    throw new Error(errorMsg);
  }

  logEvent({
    tag: "[WORKSPACE][RESUME][DB_SUCCESS]",
    ts: Date.now(),
    stage: "CALL",
    source: "system",
    org_id: orgId,
    severity: "info",
    details: {
      workspace_status: "active",
      previous_paused_reason: pausedReason,
      ...details,
    },
  });

  // Step 3: CRITICAL - Rebind phone numbers to assistants via VAPI API
  // This is the ONLY way to restore inbound calls - VAPI routing is controlled by phone number assistantId
  // rebindOrgPhoneNumbers has guard - will not rebind if still billing-paused
  // If this fails, the org is active in DB but calls will NOT ring (CRITICAL BUG)
  try {
    await rebindOrgPhoneNumbers(orgId);
  } catch (rebindErr) {
    // CRITICAL ERROR: Rebind failed - org is active in DB but telephony is NOT restored
    const errorMsg = rebindErr instanceof Error ? rebindErr.message : String(rebindErr);
    logEvent({
      tag: "[WORKSPACE][RESUME][REBIND_CRITICAL_ERROR]",
      ts: Date.now(),
      stage: "CALL",
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

  logEvent({
    tag: "[WORKSPACE][RESUME][COMPLETE]",
    ts: Date.now(),
    stage: "CALL",
    source: "system",
    org_id: orgId,
    severity: "info",
    details: {
      previous_paused_reason: pausedReason,
      message: "Workspace resumed successfully - DB updated and phone numbers rebound",
      ...details,
    },
  });
}
