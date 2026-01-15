import { supabaseAdmin } from "@/lib/supabase/admin";
import { vapiFetch } from "@/lib/vapi/server";
import { logEvent } from "@/lib/observability/logEvent";

/**
 * Unbind all phone numbers from assistants for an organization.
 * This prevents inbound calls from routing to any agent.
 * Uses supabaseAdmin (service role) to bypass RLS.
 * CRITICAL: Calls VAPI API directly to update phone number assistantId = null.
 * Throws on failure - does NOT swallow errors.
 */
export async function unbindOrgPhoneNumbers(
  orgId: string,
  reason: "manual" | "hard_cap" | "past_due"
): Promise<void> {
  // Fetch all agents with vapi_assistant_id and vapi_phone_number_id for this org
  const { data: agents, error: agentsErr } = await supabaseAdmin
    .from("agents")
    .select("id, vapi_assistant_id, vapi_phone_number_id")
    .eq("org_id", orgId)
    .not("vapi_assistant_id", "is", null)
    .not("vapi_phone_number_id", "is", null);

  if (agentsErr) {
    const errorMsg = `Failed to fetch agents for unbind: ${agentsErr.message}`;
    logEvent({
      tag: "[VAPI][BINDING][UNBIND][ERROR]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: {
        reason: reason,
        error: agentsErr.message,
        error_code: agentsErr.code,
      },
    });
    throw new Error(errorMsg);
  }

  if (!agents || agents.length === 0) {
    // No agents to unbind - this is fine
    logEvent({
      tag: "[VAPI][BINDING][UNBIND][SKIP]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "info",
      details: {
        reason: reason,
        message: "No agents with phone numbers to unbind",
      },
    });
    return;
  }

  const now = new Date().toISOString();
  const errors: Array<{ phoneNumberId: string; error: string }> = [];

  // Unbind phone numbers from assistants (prevents calls)
  // CRITICAL: Must call VAPI API to update phone number assistantId = null
  for (const agent of agents) {
    if (!agent.vapi_assistant_id || !agent.vapi_phone_number_id) continue;

    const phoneNumberId = agent.vapi_phone_number_id;
    const previousAssistantId = agent.vapi_assistant_id;

    try {
      // Step 1: Fetch current phone number state to verify previous assistantId
      let currentAssistantId: string | null = null;
      try {
        const phoneNumber = await vapiFetch<{ assistantId?: string | null }>(
          `/phone-number/${phoneNumberId}`
        );
        currentAssistantId = phoneNumber.assistantId ?? null;
      } catch (fetchErr) {
        // Log but continue - we'll still try to unbind
        logEvent({
          tag: "[VAPI][BINDING][UNBIND][FETCH_WARN]",
          ts: Date.now(),
          stage: "CALL",
          source: "system",
          org_id: orgId,
          severity: "warn",
          details: {
            phone_number_id: phoneNumberId,
            error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
          },
        });
      }

      // Step 2: PATCH phone number to set assistantId = null
      // This is the ONLY valid unbind - VAPI routing is controlled by phone number assistantId
      await vapiFetch(`/phone-number/${phoneNumberId}`, {
        method: "PATCH",
        body: JSON.stringify({ assistantId: null }),
      });

      // Step 3: Update agent sync status in DB
      await supabaseAdmin
        .from("agents")
        .update({
          vapi_sync_status: "paused",
          vapi_synced_at: now,
        })
        .eq("id", agent.id);

      // Step 4: Log success with previous assistantId
      logEvent({
        tag: "[VAPI][BINDING][UNBIND][SUCCESS]",
        ts: Date.now(),
        stage: "CALL",
        source: "system",
        org_id: orgId,
        severity: "info",
        details: {
          reason: reason,
          agent_id: agent.id,
          phone_number_id: phoneNumberId,
          previous_assistant_id: previousAssistantId,
          current_assistant_id_before_unbind: currentAssistantId,
          vapi_api_called: true,
        },
      });
    } catch (vapiErr) {
      const errorMsg = vapiErr instanceof Error ? vapiErr.message : String(vapiErr);
      errors.push({ phoneNumberId, error: errorMsg });

      logEvent({
        tag: "[VAPI][BINDING][UNBIND][FAILED]",
        ts: Date.now(),
        stage: "CALL",
        source: "system",
        org_id: orgId,
        severity: "error",
        details: {
          reason: reason,
          agent_id: agent.id,
          phone_number_id: phoneNumberId,
          previous_assistant_id: previousAssistantId,
          error: errorMsg,
          vapi_api_called: true,
        },
      });
    }
  }

  // Log summary
  logEvent({
    tag: "[VAPI][BINDING][UNBIND][SUMMARY]",
    ts: Date.now(),
    stage: "CALL",
    source: "system",
    org_id: orgId,
    severity: errors.length > 0 ? "error" : "info",
    details: {
      reason: reason,
      total_agents: agents.length,
      success_count: agents.length - errors.length,
      failed_count: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    },
  });

  // CRITICAL: Throw if any unbind failed - do NOT swallow errors
  if (errors.length > 0) {
    const errorMsg = `Failed to unbind ${errors.length} phone number(s): ${errors.map((e) => `${e.phoneNumberId} (${e.error})`).join(", ")}`;
    throw new Error(errorMsg);
  }
}

/**
 * @deprecated Use unbindOrgPhoneNumbers instead
 */
export async function unbindOrgPhoneNumbersFromAssistants(orgId: string): Promise<void> {
  return unbindOrgPhoneNumbers(orgId, "manual");
}

/**
 * Rebind all phone numbers to assistants for an organization.
 * This allows inbound calls to route to agents again.
 * Uses supabaseAdmin (service role) to bypass RLS.
 * GUARD: Will NOT rebind if org is billing-paused (paused_reason in 'hard_cap','past_due').
 * CRITICAL: Calls VAPI API directly to update phone number assistantId.
 * Throws on failure - does NOT swallow errors.
 */
export async function rebindOrgPhoneNumbers(orgId: string): Promise<void> {
  // GUARD: Check if org is billing-paused - do not rebind if so
  const { data: orgSettings } = await supabaseAdmin
    .from("organization_settings")
    .select("workspace_status, paused_reason")
    .eq("org_id", orgId)
    .maybeSingle<{
      workspace_status: "active" | "paused" | null;
      paused_reason: "manual" | "hard_cap" | "past_due" | null;
    }>();

  const pausedReason = orgSettings?.paused_reason;
  if (
    orgSettings?.workspace_status === "paused" &&
    (pausedReason === "hard_cap" || pausedReason === "past_due")
  ) {
    // Org is billing-paused - do not rebind
    logEvent({
      tag: "[VAPI][BINDING][REBIND][BLOCKED]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "warn",
      details: {
        workspace_status: orgSettings.workspace_status,
        paused_reason: pausedReason,
        reason: "billing_paused",
      },
    });
    throw new Error(`Cannot rebind: Organization is billing-paused (${pausedReason})`);
  }

  // Fetch all agents with vapi_assistant_id and vapi_phone_number_id for this org
  const { data: agents, error: agentsErr } = await supabaseAdmin
    .from("agents")
    .select("id, vapi_assistant_id, vapi_phone_number_id")
    .eq("org_id", orgId)
    .not("vapi_assistant_id", "is", null)
    .not("vapi_phone_number_id", "is", null);

  if (agentsErr) {
    const errorMsg = `Failed to fetch agents for rebind: ${agentsErr.message}`;
    logEvent({
      tag: "[VAPI][BINDING][REBIND][ERROR]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: {
        error: agentsErr.message,
        error_code: agentsErr.code,
      },
    });
    throw new Error(errorMsg);
  }

  if (!agents || agents.length === 0) {
    // No agents to rebind - this is fine
    logEvent({
      tag: "[VAPI][BINDING][REBIND][SKIP]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "info",
      details: {
        message: "No agents with phone numbers to rebind",
      },
    });
    return;
  }

  const now = new Date().toISOString();
  const errors: Array<{ phoneNumberId: string; assistantId: string; error: string }> = [];

  // Re-bind phone numbers to assistants
  // CRITICAL: Must call VAPI API to update phone number assistantId
  for (const agent of agents) {
    if (!agent.vapi_assistant_id || !agent.vapi_phone_number_id) continue;

    const phoneNumberId = agent.vapi_phone_number_id;
    const assistantId = agent.vapi_assistant_id;

    try {
      // Step 1: Fetch current phone number state to verify current assistantId
      let currentAssistantId: string | null = null;
      try {
        const phoneNumber = await vapiFetch<{ assistantId?: string | null }>(
          `/phone-number/${phoneNumberId}`
        );
        currentAssistantId = phoneNumber.assistantId ?? null;
      } catch (fetchErr) {
        // Log but continue - we'll still try to rebind
        logEvent({
          tag: "[VAPI][BINDING][REBIND][FETCH_WARN]",
          ts: Date.now(),
          stage: "CALL",
          source: "system",
          org_id: orgId,
          severity: "warn",
          details: {
            phone_number_id: phoneNumberId,
            error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
          },
        });
      }

      // Step 2: PATCH phone number to restore assistantId
      // This is the ONLY valid rebind - VAPI routing is controlled by phone number assistantId
      await vapiFetch(`/phone-number/${phoneNumberId}`, {
        method: "PATCH",
        body: JSON.stringify({ assistantId: assistantId }),
      });

      // Step 3: Update agent sync status in DB
      await supabaseAdmin
        .from("agents")
        .update({
          vapi_sync_status: "success",
          vapi_synced_at: now,
        })
        .eq("id", agent.id);

      // Step 4: Log success with assistantId
      logEvent({
        tag: "[VAPI][BINDING][REBIND][SUCCESS]",
        ts: Date.now(),
        stage: "CALL",
        source: "system",
        org_id: orgId,
        severity: "info",
        details: {
          agent_id: agent.id,
          phone_number_id: phoneNumberId,
          assistant_id: assistantId,
          current_assistant_id_before_rebind: currentAssistantId,
          vapi_api_called: true,
        },
      });
    } catch (vapiErr) {
      const errorMsg = vapiErr instanceof Error ? vapiErr.message : String(vapiErr);
      errors.push({ phoneNumberId, assistantId, error: errorMsg });

      logEvent({
        tag: "[VAPI][BINDING][REBIND][FAILED]",
        ts: Date.now(),
        stage: "CALL",
        source: "system",
        org_id: orgId,
        severity: "error",
        details: {
          agent_id: agent.id,
          phone_number_id: phoneNumberId,
          assistant_id: assistantId,
          error: errorMsg,
          vapi_api_called: true,
        },
      });
    }
  }

  // Log summary
  logEvent({
    tag: "[VAPI][BINDING][REBIND][SUMMARY]",
    ts: Date.now(),
    stage: "CALL",
    source: "system",
    org_id: orgId,
    severity: errors.length > 0 ? "error" : "info",
    details: {
      total_agents: agents.length,
      success_count: agents.length - errors.length,
      failed_count: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    },
  });

  // CRITICAL: Throw if any rebind failed - do NOT swallow errors
  if (errors.length > 0) {
    const errorMsg = `Failed to rebind ${errors.length} phone number(s): ${errors.map((e) => `${e.phoneNumberId} -> ${e.assistantId} (${e.error})`).join(", ")}`;
    throw new Error(errorMsg);
  }
}

/**
 * @deprecated Use rebindOrgPhoneNumbers instead
 */
export async function rebindOrgPhoneNumbersToAssistants(orgId: string): Promise<void> {
  return rebindOrgPhoneNumbers(orgId);
}
