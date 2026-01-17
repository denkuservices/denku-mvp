import Link from "next/link";
import { parseAnalyticsParams, getDateRange, resolveOrgId, isAdminOrOwner } from "@/lib/analytics/params";
import {
  fetchCalls,
  fetchLeadsCount,
  fetchTicketsCount,
  fetchAppointmentsCount,
  fetchAgents,
  computeSummary,
  computeDailyTrend,
  computeByAgent,
  computeOutcomeBreakdown,
} from "@/lib/analytics/queries";
import { computeInsights } from "@/lib/analytics/insights";
import { KpiGrid } from "@/components/analytics/KpiGrid";
import { DailyTrendTable } from "@/components/analytics/DailyTrendTable";
import { ByAgentTable } from "@/components/analytics/ByAgentTable";
import { OutcomeBreakdown } from "@/components/analytics/OutcomeBreakdown";
import { InsightsPanel } from "@/components/analytics/InsightsPanel";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTicketsAnalytics } from "@/lib/analytics/tickets.queries";
import { TicketsAnalytics } from "@/components/analytics/TicketsAnalytics";

export const dynamic = "force-dynamic";

function getRangeLabel(range: string): string {
  if (range === "30d") return "Last 30 days";
  if (range === "90d") return "Last 90 days";
  return "Last 7 days";
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Next.js 16: searchParams is a Promise, must await before use
  const resolvedSearchParams = await searchParams;
  const params = parseAnalyticsParams(resolvedSearchParams);
  const orgId = await resolveOrgId();
  const { from, to, compareFrom, compareTo } = getDateRange(params.range);

  // Check if user is admin/owner for export button visibility
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  const canExport = userId ? await isAdminOrOwner(orgId, userId) : false;

  // CENTRALIZED DATA FETCHING: Fetch all data in exactly 5 queries
  // 1. Calls (entire range covering both current and compare periods - filtered in memory)
  // 2. Leads count (current period only)
  // 3. Tickets count (current period only)
  // 4. Appointments count (current period only)
  // 5. Agents (id, name) - lightweight lookup for agent names
  // Total: 5 queries
  
  // Fetch calls for the entire range (from compareFrom to to) to cover both periods
  const allCalls = await fetchCalls({
    orgId,
    from: compareFrom, // Start from compare period start
    to, // End at current period end
    agentId: params.agentId,
    outcome: params.outcome,
    direction: params.direction,
  });

  // Filter calls in memory for current vs compare periods
  const currentCalls = allCalls.filter((c) => {
    if (!c.started_at) return false;
    const callDate = new Date(c.started_at);
    return callDate >= from && callDate <= to;
  });

  const compareCalls = allCalls.filter((c) => {
    if (!c.started_at) return false;
    const callDate = new Date(c.started_at);
    return callDate >= compareFrom && callDate <= compareTo;
  });

  // Fetch counts and agents in parallel
  const [leadsCount, ticketsCount, appointmentsCount, agents] = await Promise.all([
    fetchLeadsCount({ orgId, from, to }),
    fetchTicketsCount({ orgId, from, to }),
    fetchAppointmentsCount({ orgId, from, to }),
    fetchAgents(orgId), // Fetch agents once for lookup map
  ]);

  // Build agent name lookup map (agent_id -> agent_name)
  const agentNameById: Record<string, string> = {};
  for (const agent of agents) {
    if (agent.id && agent.name) {
      agentNameById[agent.id] = agent.name;
    }
  }

  // Compute all aggregations from the fetched data (no additional queries)
  // Agent names resolved from agents table lookup with fallback to raw_payload
  const summary = computeSummary(currentCalls, leadsCount, ticketsCount, appointmentsCount);
  
  // Adaptive bucketing: day for 7d/30d, week for 90d
  const bucket: "day" | "week" = params.range === "90d" ? "week" : "day";
  const dailyTrend = computeDailyTrend(currentCalls, from, to, bucket);
  
  const byAgent = computeByAgent(currentCalls, agentNameById);
  const outcomeBreakdown = computeOutcomeBreakdown(currentCalls);

  // Compute insights from pre-fetched data (no additional queries)
  const compareSummary = computeSummary(compareCalls, 0, 0, 0); // Counts not needed for compare period
  const insights = computeInsights({
    currentSummary: summary,
    compareSummary,
    outcomeBreakdown,
    byAgent,
  });

  // Ensure range is normalized (should already be from parseAnalyticsParams, but be explicit)
  const currentRange: "7d" | "30d" | "90d" = params.range || "7d";
  const rangeLabel = getRangeLabel(currentRange);
  const section = params.section || "calls";

  // Fetch tickets analytics if section is tickets
  let ticketsData = null;
  if (section === "tickets") {
    try {
      // Map calls range to tickets range (tickets supports 24h, but we'll use 7d/30d/90d for now)
      const ticketsRange: "7d" | "30d" | "90d" = currentRange === "7d" ? "7d" : currentRange === "30d" ? "30d" : "90d";
      
      // orgId is already resolved via resolveOrgId() which:
      // 1. Gets authenticated user from supabase.auth.getUser()
      // 2. Queries profiles table for org_id
      // 3. Returns the org_id from the profile
      ticketsData = await getTicketsAnalytics(orgId, {
        range: ticketsRange,
        priority: params.priority,
      });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[analytics] Failed to fetch tickets analytics:", error);
      }
      ticketsData = null;
    }
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-2 justify-end">
          {/* Section switch */}
          <div className="flex items-center gap-2 border-r pr-2">
            <Link
              href={`/dashboard/analytics?range=${currentRange}&section=calls`}
              className={`rounded-md border bg-white px-3 py-2 text-xs font-medium transition-colors ${
                section === "calls"
                  ? "border-zinc-900 bg-zinc-50 font-semibold"
                  : "border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              Calls
            </Link>
            <Link
              href={`/dashboard/analytics?range=${currentRange}&section=tickets`}
              className={`rounded-md border bg-white px-3 py-2 text-xs font-medium transition-colors ${
                section === "tickets"
                  ? "border-zinc-900 bg-zinc-50 font-semibold"
                  : "border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              Tickets
            </Link>
          </div>

          {/* Range switch */}
          <div className="flex items-center gap-2">
            {(["7d", "30d", "90d"] as const).map((r) => {
              const isActive = currentRange === r;
              return (
                <Link
                  key={r}
                  href={`/dashboard/analytics?range=${r}&section=${section}`}
                  className={`rounded-md border bg-white px-3 py-2 text-xs font-medium transition-colors ${
                    isActive
                      ? "border-zinc-900 bg-zinc-50 font-semibold"
                      : "border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  {r.toUpperCase()}
                </Link>
              );
            })}
          </div>

          {/* Export button (admin/owner only) */}
          {canExport && section === "calls" && (
            <Link
              href={`/api/admin/analytics/export?range=${params.range}${params.agentId ? `&agentId=${params.agentId}` : ""}${params.outcome ? `&outcome=${params.outcome}` : ""}${params.direction ? `&direction=${params.direction}` : ""}`}
              className="rounded-md border bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50"
            >
              Export CSV
            </Link>
          )}
        </div>

      {/* Render section content */}
      {section === "calls" ? (
        <>
          {/* KPI cards */}
          <KpiGrid summary={summary} />

          {/* Daily trend */}
          <DailyTrendTable rows={dailyTrend} bucket={bucket} />

          {/* By agent */}
          <ByAgentTable rows={byAgent} />

          {/* Outcome breakdown */}
          <OutcomeBreakdown rows={outcomeBreakdown} />

          {/* Insights */}
          <InsightsPanel
            insights={insights}
            totalCalls={summary.totalCalls}
            uniqueAgentCount={byAgent.length}
            hasPreviousPeriodData={compareSummary.totalCalls > 0}
          />
        </>
      ) : (
        <>
          {ticketsData ? (
            <TicketsAnalytics
              data={ticketsData}
              range={currentRange === "7d" ? "7d" : currentRange === "30d" ? "30d" : "90d"}
            />
          ) : (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">Failed to load tickets analytics.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/*
 * TEST PLAN
 * =========
 *
 * Manual Test Steps:
 * 1. Navigate to /dashboard/analytics
 * 2. Verify default range is 7d
 * 3. Click 30d and 90d range buttons - verify data updates
 * 4. Check KPI cards show correct totals (calls, cost, duration, leads, tickets, appointments)
 * 5. Verify daily trend table shows all days in range (even with 0 calls)
 * 6. Check by-agent table includes "Unassigned" if any calls have null agent_id
 * 7. Verify outcome breakdown shows "Unclassified" for null/empty outcomes
 * 8. Check insights panel appears if conditions are met (cost spike, unclassified rate, etc.)
 * 9. As admin/owner, click Export CSV - verify CSV downloads with correct data
 * 10. As viewer, verify Export CSV button is not visible
 *
 * Expected Results:
 * - All metrics calculate correctly from calls table
 * - No N+1 queries (max 4 queries total)
 * - All dates in range appear in daily trend (no gaps)
 * - Null agent_id shows as "Unassigned"
 * - Null/empty outcome shows as "Unclassified"
 * - Insights trigger based on deterministic rules
 * - Export CSV works for admin/owner only
 * - Page loads without errors even with no data
 */
