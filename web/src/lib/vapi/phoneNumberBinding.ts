import { supabaseAdmin } from "@/lib/supabase/admin";
import { vapiFetch } from "@/lib/vapi/server";
import { logEvent } from "@/lib/observability/logEvent";

/**
 * Unbind all phone numbers from assistants for an organization.
 * This prevents inbound calls from routing to any agent.
 * Uses supabaseAdmin (service role) to bypass RLS.
 * Does not throw - continues processing even if individual agents fail.
 */
export async function unbindOrgPhoneNumbersFromAssistants(orgId: string): Promise<void> {
  try {
    // Fetch all agents with vapi_assistant_id and vapi_phone_number_id for this org
    const { data: agents, error: agentsErr } = await supabaseAdmin
      .from("agents")
      .select("id, vapi_assistant_id, vapi_phone_number_id")
      .eq("org_id", orgId)
      .not("vapi_assistant_id", "is", null)
      .not("vapi_phone_number_id", "is", null);

    if (agentsErr) {
      logEvent({
        tag: "[VAPI][BINDING][UNBIND][ERROR]",
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
      return; // Don't throw - log and return
    }

    if (!agents || agents.length === 0) {
      // No agents to unbind - this is fine
      return;
    }

    const now = new Date().toISOString();

    // Unbind phone numbers from assistants (prevents calls)
    for (const agent of agents) {
      if (!agent.vapi_assistant_id || !agent.vapi_phone_number_id) continue;

      try {
        // Unbind phone number from assistant (set assistantId to null)
        // This prevents calls from being routed to the assistant
        await vapiFetch(`/phone-number/${agent.vapi_phone_number_id}`, {
          method: "PATCH",
          body: JSON.stringify({ assistantId: null }),
        });

        // Update agent sync status
        await supabaseAdmin
          .from("agents")
          .update({
            vapi_sync_status: "paused",
            vapi_synced_at: now,
          })
          .eq("id", agent.id);

        // Log binding event
        logEvent({
          tag: "[VAPI][BINDING][UNBIND]",
          ts: Date.now(),
          stage: "CALL",
          source: "system",
          org_id: orgId,
          severity: "info",
          details: {
            agent_id: agent.id,
            phone_number_id: agent.vapi_phone_number_id,
            assistant_id: agent.vapi_assistant_id,
          },
        });
      } catch (vapiErr) {
        const errorMsg = vapiErr instanceof Error ? vapiErr.message : String(vapiErr);
        logEvent({
          tag: "[VAPI][BINDING][UNBIND][ERROR]",
          ts: Date.now(),
          stage: "CALL",
          source: "system",
          org_id: orgId,
          severity: "error",
          details: {
            agent_id: agent.id,
            phone_number_id: agent.vapi_phone_number_id,
            assistant_id: agent.vapi_assistant_id,
            error: errorMsg,
          },
        });
        // Continue with other agents even if one fails
        console.error(
          `[UNBIND] Failed to unbind phone number ${agent.vapi_phone_number_id} from assistant ${agent.vapi_assistant_id}:`,
          vapiErr
        );
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logEvent({
      tag: "[VAPI][BINDING][UNBIND][ERROR]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: {
        error: errorMsg,
      },
    });
    // Don't throw - log and return
    console.error("[UNBIND] Unexpected error in unbindOrgPhoneNumbersFromAssistants:", err);
  }
}

/**
 * Rebind all phone numbers to assistants for an organization.
 * This allows inbound calls to route to agents again.
 * Uses supabaseAdmin (service role) to bypass RLS.
 * Does not throw - continues processing even if individual agents fail.
 */
export async function rebindOrgPhoneNumbersToAssistants(orgId: string): Promise<void> {
  try {
    // Fetch all agents with vapi_assistant_id and vapi_phone_number_id for this org
    const { data: agents, error: agentsErr } = await supabaseAdmin
      .from("agents")
      .select("id, vapi_assistant_id, vapi_phone_number_id")
      .eq("org_id", orgId)
      .not("vapi_assistant_id", "is", null)
      .not("vapi_phone_number_id", "is", null);

    if (agentsErr) {
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
      return; // Don't throw - log and return
    }

    if (!agents || agents.length === 0) {
      // No agents to rebind - this is fine
      return;
    }

    const now = new Date().toISOString();

    // Re-bind phone numbers to assistants
    for (const agent of agents) {
      if (!agent.vapi_assistant_id || !agent.vapi_phone_number_id) continue;

      try {
        // Re-bind phone number to assistant
        await vapiFetch(`/phone-number/${agent.vapi_phone_number_id}`, {
          method: "PATCH",
          body: JSON.stringify({ assistantId: agent.vapi_assistant_id }),
        });

        // Update agent sync status
        await supabaseAdmin
          .from("agents")
          .update({
            vapi_sync_status: "success",
            vapi_synced_at: now,
          })
          .eq("id", agent.id);

        // Log binding event
        logEvent({
          tag: "[VAPI][BINDING][REBIND]",
          ts: Date.now(),
          stage: "CALL",
          source: "system",
          org_id: orgId,
          severity: "info",
          details: {
            agent_id: agent.id,
            phone_number_id: agent.vapi_phone_number_id,
            assistant_id: agent.vapi_assistant_id,
          },
        });
      } catch (vapiErr) {
        const errorMsg = vapiErr instanceof Error ? vapiErr.message : String(vapiErr);
        logEvent({
          tag: "[VAPI][BINDING][REBIND][ERROR]",
          ts: Date.now(),
          stage: "CALL",
          source: "system",
          org_id: orgId,
          severity: "error",
          details: {
            agent_id: agent.id,
            phone_number_id: agent.vapi_phone_number_id,
            assistant_id: agent.vapi_assistant_id,
            error: errorMsg,
          },
        });
        // Continue with other agents even if one fails
        console.error(
          `[REBIND] Failed to rebind phone number ${agent.vapi_phone_number_id} to assistant ${agent.vapi_assistant_id}:`,
          vapiErr
        );
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logEvent({
      tag: "[VAPI][BINDING][REBIND][ERROR]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: {
        error: errorMsg,
      },
    });
    // Don't throw - log and return
    console.error("[REBIND] Unexpected error in rebindOrgPhoneNumbersToAssistants:", err);
  }
}
