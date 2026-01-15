/**
 * TELEPHONY PAUSE ENFORCEMENT - SINGLE SOURCE OF TRUTH
 * 
 * ⚠️ CRITICAL: This function ensures VAPI phone numbers match DB pause state ⚠️
 * 
 * This function reads organization_settings and enforces telephony pause state.
 * It ensures that if an org is paused in DB, phone numbers are unbound in VAPI.
 * 
 * Safe to call multiple times (idempotent).
 * Throws on VAPI failures - does NOT swallow errors.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import { unbindOrgPhoneNumbers } from "@/lib/vapi/phoneNumberBinding";

/**
 * Enforce telephony pause state based on DB settings.
 * 
 * Reads organization_settings and unbinds phone numbers if org is paused.
 * This ensures VAPI state matches DB state.
 * 
 * @param orgId - Organization ID
 * @returns { ok: true, message: string } on success
 * @throws Error if VAPI unbind fails
 */
export async function enforceTelephonyPause(
  orgId: string
): Promise<{ ok: boolean; message: string }> {
  // Read organization_settings to check pause state
  const { data: orgSettings, error: fetchError } = await supabaseAdmin
    .from("organization_settings")
    .select("workspace_status, paused_reason")
    .eq("org_id", orgId)
    .maybeSingle<{
      workspace_status: "active" | "paused" | null;
      paused_reason: "manual" | "hard_cap" | "past_due" | null;
    }>();

  if (fetchError) {
    const errorMsg = `Failed to read org settings: ${fetchError.message}`;
    logEvent({
      tag: "[WORKSPACE][ENFORCE_PAUSE][FETCH_ERROR]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: {
        error: fetchError.message,
        error_code: fetchError.code,
      },
    });
    throw new Error(errorMsg);
  }

  if (!orgSettings) {
    // No settings found - nothing to enforce
    return {
      ok: true,
      message: "Organization settings not found - no enforcement needed",
    };
  }

  const workspaceStatus = orgSettings.workspace_status ?? "active";
  const pausedReason = orgSettings.paused_reason;

  // Check if org should be paused (billing-paused or manual pause)
  const shouldBePaused =
    workspaceStatus === "paused" &&
    (pausedReason === "hard_cap" || pausedReason === "past_due" || pausedReason === "manual");

  if (!shouldBePaused) {
    // Org is not paused - no enforcement needed
    logEvent({
      tag: "[WORKSPACE][ENFORCE_PAUSE][SKIP]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "info",
      details: {
        workspace_status: workspaceStatus,
        paused_reason: pausedReason,
        message: "Organization is not paused - no telephony enforcement needed",
      },
    });
    return {
      ok: true,
      message: "Organization is not paused - no telephony enforcement needed",
    };
  }

  // Org is paused - enforce VAPI unbind
  if (!pausedReason) {
    // Invalid state: paused but no reason - log and skip
    logEvent({
      tag: "[WORKSPACE][ENFORCE_PAUSE][INVALID_STATE]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "warn",
      details: {
        workspace_status: workspaceStatus,
        paused_reason: pausedReason,
        message: "Organization is paused but paused_reason is null - skipping enforcement",
      },
    });
    return {
      ok: true,
      message: "Organization is paused but paused_reason is null - skipping enforcement",
    };
  }

  // CRITICAL: Unbind phone numbers to match DB pause state
  // This ensures VAPI routing is stopped even if previous unbind failed
  try {
    await unbindOrgPhoneNumbers(orgId, pausedReason);

    logEvent({
      tag: "[WORKSPACE][ENFORCE_PAUSE][SUCCESS]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "info",
      details: {
        workspace_status: workspaceStatus,
        paused_reason: pausedReason,
        message: "Phone numbers unbound successfully",
      },
    });

    return {
      ok: true,
      message: "Phone numbers unbound successfully",
    };
  } catch (unbindErr) {
    // CRITICAL ERROR: Unbind failed - DB says paused but telephony is NOT stopped
    const errorMsg = unbindErr instanceof Error ? unbindErr.message : String(unbindErr);
    logEvent({
      tag: "[WORKSPACE][ENFORCE_PAUSE][UNBIND_ERROR]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: {
        workspace_status: workspaceStatus,
        paused_reason: pausedReason,
        error: errorMsg,
        critical: true,
        message: "Failed to unbind phone numbers - DB says paused but calls may still ring",
      },
    });
    // Re-throw to ensure caller knows enforcement failed
    throw new Error(`Failed to enforce telephony pause: ${errorMsg}. Org is paused in DB but calls may still ring.`);
  }
}
