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
import { unbindOrgPhoneNumbers, rebindOrgPhoneNumbers } from "@/lib/vapi/phoneNumberBinding";

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

/**
 * Enforce telephony resume state based on DB settings.
 * 
 * Reads organization_settings and rebinds phone numbers if org is active.
 * This ensures VAPI state matches DB state.
 * 
 * Guard: Only resumes billing-paused orgs (hard_cap/past_due).
 * Does nothing if org is already active or manually paused.
 * 
 * @param orgId - Organization ID
 * @returns { ok: boolean, message: string, numbersRebound?: number } on success
 * @throws Error if VAPI rebind fails
 */
export async function enforceTelephonyResume(
  orgId: string
): Promise<{ ok: boolean; message: string; numbersRebound?: number }> {
  // Read organization_settings to check resume state
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
      tag: "[WORKSPACE][ENFORCE_RESUME][FETCH_ERROR]",
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

  // Guard: Only resume if org is active (not paused)
  if (workspaceStatus !== "active") {
    // Org is still paused - no resume needed
    logEvent({
      tag: "[WORKSPACE][ENFORCE_RESUME][SKIP]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "info",
      details: {
        workspace_status: workspaceStatus,
        paused_reason: pausedReason,
        message: "Organization is still paused - no telephony resume needed",
      },
    });
    return {
      ok: true,
      message: "Organization is still paused - no telephony resume needed",
    };
  }

  // Org is active - rebind phone numbers
  // Note: If this is called after resumeWorkspace(), paused_reason will be null
  // So we rebind if org is active (regardless of previous paused_reason)
  // The guard in rebindOrgPhoneNumbers() will prevent rebind if org is still paused

  // Get agent count for logging
  const { data: agents } = await supabaseAdmin
    .from("agents")
    .select("id")
    .eq("org_id", orgId)
    .not("vapi_assistant_id", "is", null)
    .not("vapi_phone_number_id", "is", null);
  const numbersToRebind = agents?.length ?? 0;

  // CRITICAL: Rebind phone numbers to match DB active state
  // This ensures VAPI routing is restored even if previous rebind failed
  try {
    await rebindOrgPhoneNumbers(orgId);

    logEvent({
      tag: "[WORKSPACE][ENFORCE_RESUME][SUCCESS]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "info",
      details: {
        workspace_status: workspaceStatus,
        previous_paused_reason: pausedReason,
        numbers_rebound: numbersToRebind,
        message: "Phone numbers rebound successfully",
      },
    });

    return {
      ok: true,
      message: "Phone numbers rebound successfully",
      numbersRebound: numbersToRebind,
    };
  } catch (rebindErr) {
    // CRITICAL ERROR: Rebind failed - DB says active but telephony is NOT restored
    const errorMsg = rebindErr instanceof Error ? rebindErr.message : String(rebindErr);
    logEvent({
      tag: "[WORKSPACE][ENFORCE_RESUME][REBIND_ERROR]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: {
        workspace_status: workspaceStatus,
        previous_paused_reason: pausedReason,
        error: errorMsg,
        critical: true,
        message: "Failed to rebind phone numbers - DB says active but calls may not ring",
      },
    });
    // Re-throw to ensure caller knows enforcement failed
    throw new Error(`Failed to enforce telephony resume: ${errorMsg}. Org is active in DB but calls may not ring.`);
  }
}
