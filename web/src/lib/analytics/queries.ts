import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AnalyticsSummary, DailyTrendRow, ByAgentRow, OutcomeBreakdownRow } from "./types";
import { toISODate, fillDateRange, fillWeekRange, getWeekStart } from "./format";


type CallRow = {
  id: string;
  agent_id: string | null;
  raw_payload: string | null; // JSON string containing assistant info
  started_at: string | null;
  duration_seconds: number | null;
  cost_usd: number | null;
  outcome: string | null;
  direction: string | null;
};

/**
 * Fetch calls for a date range.
 * This is the ONLY function that queries the calls table.
 * All other analytics are computed from the returned calls array.
 * 
 * NOTE: We do NOT query the agents table. Agent names are derived from call data
 * (raw_payload.assistant.name or agent_id fallback). This reduces queries from 5 to 4.
 * The calls table is the analytics source of truth - we avoid joins to keep query count minimal.
 */
export async function fetchCalls({
  orgId,
  from,
  to,
  agentId,
  outcome,
  direction,
}: {
  orgId: string;
  from: Date;
  to: Date;
  agentId?: string;
  outcome?: string;
  direction?: string;
}): Promise<CallRow[]> {
  const supabase = await createSupabaseServerClient();
  const fromISO = from.toISOString();
  const toISO = to.toISOString();

  // Build calls query with only existing columns (no agent_name - it doesn't exist in DB)
  let callsQuery = supabase
    .from("calls")
    .select("id, agent_id, raw_payload, started_at, duration_seconds, cost_usd, outcome, direction")
    .eq("org_id", orgId)
    .gte("started_at", fromISO)
    .lte("started_at", toISO);

  if (agentId) {
    callsQuery = callsQuery.eq("agent_id", agentId);
  }
  if (outcome) {
    callsQuery = callsQuery.eq("outcome", outcome);
  }
  if (direction) {
    callsQuery = callsQuery.eq("direction", direction);
  }

  const result = await callsQuery.returns<CallRow[]>();
  if (result.error) throw new Error(`Failed to fetch calls: ${result.error.message}`);
  return result.data || [];
}

/**
 * Fetch leads count for a date range.
 */
export async function fetchLeadsCount({
  orgId,
  from,
  to,
}: {
  orgId: string;
  from: Date;
  to: Date;
}): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const fromISO = from.toISOString();
  const toISO = to.toISOString();

  const result = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", fromISO)
    .lte("created_at", toISO);

  return result.count ?? 0;
}

/**
 * Fetch tickets count for a date range.
 */
export async function fetchTicketsCount({
  orgId,
  from,
  to,
}: {
  orgId: string;
  from: Date;
  to: Date;
}): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const fromISO = from.toISOString();
  const toISO = to.toISOString();

  const result = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", fromISO)
    .lte("created_at", toISO);

  return result.count ?? 0;
}

/**
 * Fetch appointments count for a date range.
 */
export async function fetchAppointmentsCount({
  orgId,
  from,
  to,
}: {
  orgId: string;
  from: Date;
  to: Date;
}): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const fromISO = from.toISOString();
  const toISO = to.toISOString();

  const result = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", fromISO)
    .lte("created_at", toISO);

  return result.count ?? 0;
}

/**
 * Fetch agents for an org (lightweight query: id and name only).
 * Used to build agent name lookup map for By-Agent analytics.
 * This is a single query per page load (no N+1).
 */
export async function fetchAgents(orgId: string): Promise<Array<{ id: string; name: string | null }>> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .from("agents")
    .select("id, name")
    .eq("org_id", orgId)
    .returns<Array<{ id: string; name: string | null }>>();

  if (result.error) {
    return [];
  }

  return result.data || [];
}

/**
 * Compute summary from pre-fetched data (no additional queries).
 * Includes estimated savings calculation (Tesla-style ROI metric).
 */
export function computeSummary(
  calls: CallRow[],
  leadsCount: number,
  ticketsCount: number,
  appointmentsCount: number
): AnalyticsSummary {
  const totalCalls = calls.length;
  const totalCost = calls.reduce((sum, c) => sum + Number(c.cost_usd ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + Number(c.duration_seconds ?? 0), 0);
  const avgDuration = totalCalls === 0 ? 0 : totalDuration / totalCalls;

  // Calculate estimated savings vs human agents
  // Assumption: Human agent cost = $25/hour
  const HUMAN_AGENT_HOURLY_RATE = 25;
  const totalCallMinutes = totalDuration / 60;
  const estimatedHumanCost = totalCallMinutes * (HUMAN_AGENT_HOURLY_RATE / 60);
  const aiCost = totalCost;
  const estimatedSavings = Math.max(estimatedHumanCost - aiCost, 0);

  return {
    totalCalls,
    totalCost,
    avgDuration,
    leadsCount,
    ticketsCount,
    appointmentsCount,
    estimatedSavings,
  };
}

/**
 * Compute daily or weekly trend from pre-fetched data (no additional queries).
 * Supports adaptive bucketing:
 * - Day bucket: aggregates by day (for 7d and 30d ranges)
 * - Week bucket: aggregates by week (for 90d range to avoid 90 rows)
 */
export function computeDailyTrend(
  calls: CallRow[],
  from: Date,
  to: Date,
  bucket: "day" | "week" = "day"
): DailyTrendRow[] {
  // Generate bucket range based on bucket type
  const bucketRange = bucket === "week" ? fillWeekRange(from, to) : fillDateRange(from, to);
  
  // Initialize all buckets with zeros
  const bucketMap = new Map<string, { calls: number; cost: number; dur: number }>();
  for (const bucketKey of bucketRange) {
    bucketMap.set(bucketKey, { calls: 0, cost: 0, dur: 0 });
  }

  // Aggregate calls by bucket
  for (const c of calls) {
    if (!c.started_at) continue;
    const callDate = new Date(c.started_at);
    
    // Determine bucket key based on bucket type
    const bucketKey = bucket === "week" 
      ? getWeekStart(callDate)
      : toISODate(new Date(Date.UTC(callDate.getUTCFullYear(), callDate.getUTCMonth(), callDate.getUTCDate())));
    
    if (!bucketMap.has(bucketKey)) continue;
    const row = bucketMap.get(bucketKey)!;
    row.calls += 1;
    row.cost += Number(c.cost_usd ?? 0);
    row.dur += Number(c.duration_seconds ?? 0);
  }

  return bucketRange.map((date) => {
    const v = bucketMap.get(date)!;
    return {
      date,
      calls: v.calls,
      avgDuration: v.calls === 0 ? 0 : v.dur / v.calls,
      cost: v.cost,
    };
  });
}

/**
 * Resolve agent display name from call data and agent lookup map.
 * Resolution order:
 * 1. agentNameById[agent_id] (from agents table lookup)
 * 2. raw_payload?.assistant?.name (extracted from JSON)
 * 3. "Unassigned" (if no agent info)
 * 
 * NOTE: We query agents table once per page load to build a lookup map.
 * This provides accurate agent names while keeping query count at 5 (acceptable).
 */
function resolveAgentName(
  call: CallRow,
  agentNameById: Record<string, string>
): string {
  // Primary: lookup agent name from agents table
  if (call.agent_id && agentNameById[call.agent_id]) {
    return agentNameById[call.agent_id];
  }

  // Fallback: try to parse raw_payload (it's stored as JSON string in DB)
  if (call.raw_payload && typeof call.raw_payload === "string") {
    try {
      const raw = JSON.parse(call.raw_payload) as any;
      // Try assistant.name first
      const assistantName = raw?.assistant?.name || raw?.message?.assistant?.name;
      if (assistantName && typeof assistantName === "string" && assistantName.trim()) {
        return assistantName.trim();
      }
      // Try assistantName (alternative field)
      const assistantNameAlt = raw?.assistantName;
      if (assistantNameAlt && typeof assistantNameAlt === "string" && assistantNameAlt.trim()) {
        return assistantNameAlt.trim();
      }
    } catch {
      // If JSON parse fails, continue to fallback
    }
  }

  // Default: unassigned
  return "Unassigned";
}

/**
 * Compute by-agent breakdown from pre-fetched data (no additional queries).
 * Groups by resolved agent display name (string), not agent_id.
 * 
 * NOTE: Agent names come from agents table lookup (via agentNameById map) with
 * fallback to raw_payload.assistant.name. This ensures accurate agent names
 * while keeping query count at 5 (one agents query per page load).
 */
export function computeByAgent(
  calls: CallRow[],
  agentNameById: Record<string, string>
): ByAgentRow[] {
  // Aggregate by resolved agent name (string key, not agent_id)
  const agentData = new Map<string, { calls: number; cost: number; dur: number }>();
  
  for (const c of calls) {
    const agentName = resolveAgentName(c, agentNameById);
    const v = agentData.get(agentName) ?? { calls: 0, cost: 0, dur: 0 };
    v.calls += 1;
    v.cost += Number(c.cost_usd ?? 0);
    v.dur += Number(c.duration_seconds ?? 0);
    agentData.set(agentName, v);
  }

  return Array.from(agentData.entries())
    .map(([agent_name, v]) => ({
      agent_id: null, // Not used for display, kept for backward compatibility
      agent_name,
      calls: v.calls,
      avgDuration: v.calls === 0 ? 0 : v.dur / v.calls,
      cost: v.cost,
    }))
    .sort((a, b) => b.calls - a.calls);
}

/**
 * Compute outcome breakdown from pre-fetched data (no additional queries)
 */
export function computeOutcomeBreakdown(calls: CallRow[]): OutcomeBreakdownRow[] {
  const totalCalls = calls.length;

  if (totalCalls === 0) {
    return [];
  }

  // Aggregate by outcome
  const outcomeMap = new Map<string, number>();
  for (const c of calls) {
    const outcome = c.outcome && c.outcome.trim() ? c.outcome : "Unclassified";
    outcomeMap.set(outcome, (outcomeMap.get(outcome) || 0) + 1);
  }

  return Array.from(outcomeMap.entries())
    .map(([outcome, calls]) => ({
      outcome,
      calls,
      percentage: (calls / totalCalls) * 100,
    }))
    .sort((a, b) => b.calls - a.calls);
}


