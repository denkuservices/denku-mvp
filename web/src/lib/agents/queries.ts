import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgConcurrencyLimit } from "@/lib/organizations/plans";

export type AgentListRow = {
  id: string;
  name: string;
  language: string | null;
  inbound_phone: string | null;
  status: "Connected" | "Issues";
  active_calls: number;
  plan_limit: number;
  last_call_at: string | null; // ISO string or null, never undefined
  vapi_sync_status: string | null;
  vapi_assistant_id: string | null;
};

/**
 * Fetch agents with computed performance metrics.
 * Returns agents scoped to the current org with aggregated call stats.
 * 
 * PART D: Uses call_concurrency_leases as source of truth for active_calls (reporting).
 * Falls back to calls table if leases query fails.
 * Always returns agents even if stats fail (with active_calls=0).
 */
export async function getAgentsList(orgId: string): Promise<AgentListRow[]> {
  const supabase = await createSupabaseServerClient();
  const orgLimit = await getOrgConcurrencyLimit(orgId);

  // Fetch agents for org - ALWAYS return agents even if stats fail
  const { data: agents, error: agentsError } = await supabase
    .from("agents")
    .select("id, name, language, inbound_phone, vapi_sync_status, vapi_assistant_id")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (agentsError) {
    console.error("[AGENTS] Error fetching agents:", agentsError);
    return [];
  }

  if (!agents || agents.length === 0) {
    return [];
  }

  const agentIds = agents.map((a) => a.id);

  // Build aggregates map - initialize all agents with zero counts
  type AgentCallStats = {
    activeCalls: number;
    lastCallAt: Date | null;
  };

  const statsMap = new Map<string, AgentCallStats>();
  for (const agentId of agentIds) {
    statsMap.set(agentId, { activeCalls: 0, lastCallAt: null });
  }

  // PART D: Try to get active_calls from leases first (preferred - aligns with enforcement)
  // Count active leases grouped by agent_id for this org
  let useLeases = false;
  try {
    const { data: leasesData, error: leasesError } = await supabase
      .from("call_concurrency_leases")
      .select("agent_id")
      .eq("org_id", orgId)
      .in("agent_id", agentIds)
      .is("released_at", null)
      .gt("expires_at", new Date().toISOString());

    if (!leasesError && leasesData) {
      useLeases = true;
      // Count active leases per agent (agent_id is stored for reporting)
      for (const lease of leasesData) {
        if (!lease.agent_id) continue; // Ignore leases with null agent_id for agent reporting
        const stats = statsMap.get(lease.agent_id);
        if (stats) {
          stats.activeCalls++;
        }
      }
    }
  } catch (leasesErr) {
    // Leases table might not exist yet or query failed - fall back to calls
    console.log("[AGENTS] Leases query failed (expected if table doesn't exist), using calls fallback:", leasesErr);
  }

  // Fallback: If leases didn't work, count from calls table with stale guard
  // Only count calls started in last 6 hours to avoid stale data
  if (!useLeases && agentIds.length > 0) {
    try {
      const staleThreshold = new Date();
      staleThreshold.setHours(staleThreshold.getHours() - 6);
      const staleThresholdIso = staleThreshold.toISOString();

      const { data: callsData, error: callsError } = await supabase
        .from("calls")
        .select("agent_id, started_at, ended_at")
        .eq("org_id", orgId)
        .in("agent_id", agentIds)
        .gte("started_at", staleThresholdIso); // Only recent calls (stale guard)

      if (!callsError && callsData) {
        for (const call of callsData) {
          if (!call.agent_id) continue;
          const stats = statsMap.get(call.agent_id);
          if (!stats) continue;

          // Active calls: ended_at IS NULL
          if (!call.ended_at) {
            stats.activeCalls++;
          }
        }
      }
    } catch (callsErr) {
      // If calls query also fails, agents will have active_calls=0 (already initialized)
      console.error("[AGENTS] Calls query failed, using zero counts:", callsErr);
    }
  }

  // Get last_call_at from calls table (still use calls for historical data)
  if (agentIds.length > 0) {
    try {
      const { data: callsData } = await supabase
        .from("calls")
        .select("agent_id, started_at")
        .eq("org_id", orgId)
        .in("agent_id", agentIds);

      if (callsData) {
        for (const call of callsData) {
          if (!call.agent_id || !call.started_at) continue;
          const stats = statsMap.get(call.agent_id);
          if (stats) {
            const callDate = new Date(call.started_at);
            if (!Number.isNaN(callDate.getTime())) {
              if (!stats.lastCallAt || callDate > stats.lastCallAt) {
                stats.lastCallAt = callDate;
              }
            }
          }
        }
      }
    } catch (lastCallErr) {
      // Non-critical - last_call_at will remain null
      console.log("[AGENTS] Error fetching last_call_at:", lastCallErr);
    }
  }

  // Derive status and build result rows
  const rows: AgentListRow[] = agents.map((agent) => {
    const stats = statsMap.get(agent.id) || { activeCalls: 0, lastCallAt: null };

    // Status derivation: "Connected" if vapi_sync_status indicates success AND vapi_assistant_id is present
    let status: "Connected" | "Issues" = "Issues";
    if (agent.vapi_assistant_id) {
      const syncStatus = (agent.vapi_sync_status || "").toLowerCase();
      if (
        syncStatus.includes("synced") ||
        syncStatus.includes("connected") ||
        syncStatus.includes("success")
      ) {
        status = "Connected";
      }
    } else if (agent.vapi_sync_status) {
      const lowerStatus = agent.vapi_sync_status.toLowerCase();
      if (lowerStatus.includes("success") || lowerStatus.includes("connected")) {
        status = "Connected";
      }
    }

    // Ensure last_call_at is null (not undefined) if no calls
    const lastCallAtIso: string | null = stats.lastCallAt ? stats.lastCallAt.toISOString() : null;

    return {
      id: agent.id,
      name: agent.name || "Unnamed Agent",
      language: agent.language,
      inbound_phone: agent.inbound_phone,
      status,
      active_calls: stats.activeCalls,
      plan_limit: orgLimit, // Org-level limit (same for all agents)
      last_call_at: lastCallAtIso, // Always null or string, never undefined
      vapi_sync_status: agent.vapi_sync_status,
      vapi_assistant_id: agent.vapi_assistant_id,
    };
  });

  // Sort: issues first, then last_call_at desc, then name asc
  rows.sort((a, b) => {
    // Issues first
    if (a.status !== b.status) {
      return a.status === "Issues" ? -1 : 1;
    }
    // Then last_call_at desc
    if (a.last_call_at && b.last_call_at) {
      const aTime = new Date(a.last_call_at).getTime();
      const bTime = new Date(b.last_call_at).getTime();
      if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
        return bTime - aTime;
      }
    } else if (a.last_call_at) {
      return -1;
    } else if (b.last_call_at) {
      return 1;
    }
    // Then name asc
    return a.name.localeCompare(b.name);
  });

  return rows;
}
