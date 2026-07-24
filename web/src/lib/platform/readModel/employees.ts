import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listChannelsByEmployee } from "@/lib/platform/readModel/channels";
import type { EmployeeView, ChannelView } from "@/lib/platform/readModel/types";

/**
 * Employees read model (Sprint 5, P0). **Employee-centric by design (owner req #1):** an
 * EmployeeView OWNS a list of ChannelViews — the model is never channel-resource-centric.
 *
 * Ownership is derived from where bindings live TODAY: a voice channel is owned by the
 * Employee a `phone_lines` row is assigned to (`assigned_agent_id`). Instagram connections
 * are org-level (not agent-bound in the current schema), so they appear on the org Channels
 * inventory, not under a specific Employee, until `employee_channels` is backfilled (R-081) —
 * at which point ownership comes from there. We never invent ownership we can't prove.
 *
 * Pure mapper exported for testing. Org-scoped; never throws.
 */

export interface AgentRow {
  id: string;
  name: string;
  language: string | null;
  voice: string | null;
  vapi_assistant_id: string | null;
  vapi_sync_status: string | null;
}

/** Build an EmployeeView from an agent row + the channels it owns. Pure. */
export function agentRowToEmployeeView(agent: AgentRow, ownedChannels: ChannelView[]): EmployeeView {
  const hasConnected = ownedChannels.some((c) => c.status === "connected");
  return {
    id: agent.id,
    name: agent.name,
    language: agent.language,
    voice: agent.voice,
    status: hasConnected ? "active" : "inactive",
    channels: ownedChannels,
    vapiAssistantId: agent.vapi_assistant_id,
  };
}

export async function listEmployeeViews(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<EmployeeView[]> {
  if (!orgId) return [];
  try {
    const { data: agents } = await db
      .from("agents")
      .select("id, name, language, voice, vapi_assistant_id, vapi_sync_status")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });

    // Registry-driven ownership (R-104): every channel whose connection source declares an
    // ownerColumn contributes automatically — no per-channel query here.
    const channelsByEmployee = await listChannelsByEmployee(orgId, db);

    return ((agents ?? []) as AgentRow[]).map((a) =>
      agentRowToEmployeeView(a, channelsByEmployee.get(a.id) ?? [])
    );
  } catch (err) {
    console.error("[PLATFORM][READMODEL][EMPLOYEES]", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function getEmployeeView(
  orgId: string,
  employeeId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<EmployeeView | null> {
  if (!orgId || !employeeId) return null;
  const all = await listEmployeeViews(orgId, db);
  return all.find((e) => e.id === employeeId) ?? null;
}
