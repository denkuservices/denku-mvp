import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/currentUser";
import { computeSummary } from "@/lib/analytics/queries";

export type DashboardOverview = {
  user: { name: string; org: string };
  metrics: {
    agents_total: number;
    agents_active: number;
    calls_total: number; // Total calls handled (all time)
    calls_last_7d: number; // Calls handled in last 7 days
    leads_count: number; // Total leads created
    appointments_count: number; // Total appointments created
    tickets_count: number; // Total tickets created
    estimated_savings: number; // Estimated savings vs human agents ($25/hour)
    total_calls_month: number;
    handled_calls_month: number;
    answer_rate: number;
    tickets_created_month: number;
    appointments_created_month: number;
    estimated_savings_usd: number;
    total_calls_this_month: number;
    total_calls_last_month: number;
    total_calls_series: Array<{ monthLabel: string; value: number }>;
    handled_calls_series: Array<{ monthLabel: string; value: number }>;
    weekly_outcomes: Array<{ label: string; handledCalls: number; supportTickets: number }>;
    total_calls_today: number;
    total_calls_yesterday: number;
    hourly_calls_series: Array<{ label: string; value: number }>;
    agent_performance: Array<{
      name: [string, boolean];
      progress: string;
      quantity: number;
      total_calls: number;
      date: string;
    }>;
  };
  system_status: "Healthy" | "Attention Needed";
  feed: Array<{ id: string; message: string; time: string }>;
  readiness: { score: number; steps: Array<{ label: string; done: boolean }> };
};

type Profile = {
  id: string;
  org_id: string | null;
  email: string | null;
  full_name: string | null;
};

type Org = {
  id: string;
  name: string;
};

type AgentRow = {
  id: string;
  name: string | null;
  created_at: string | null;
};

function timeAgoLabel(iso?: string | null) {
  if (!iso) return "recent";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "recent";

  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const supabase = await createSupabaseServerClient();
  const user = await getCachedUser();

  if (!user) redirect("/login");

  // 1) Profile - use auth_user_id and handle duplicates
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, org_id, email, full_name")
    .eq("auth_user_id", user.id)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  
  const profile = profiles && profiles.length > 0 ? profiles[0] : null;

  const orgId = profile?.org_id ?? null;

  const userName =
    profile?.full_name?.trim() || user.user_metadata?.full_name || user.email || profile?.email || "User";

  /*
   * Every read this page needs, issued at once (perf, 2026-09-04).
   *
   * Home used to be a ladder of about a dozen queries that each waited for the one before it —
   * the org name, then six counts, then three feed lookups, then the readiness probe, then the
   * month metrics, then a six-month scan, then an eight-week scan, then a tickets scan, then a
   * forty-eight-hour scan, then the roster, then the savings window. None of them needed
   * anything from the query above; they were sequential only because that is the order the
   * aggregations happen to be written in. With the database in `us-west-2` and the functions in
   * `iad1`, that ladder was most of a second of pure waiting on the first screen a customer sees
   * after signing in.
   *
   * So the windows are computed up front and every query is STARTED here. The aggregation code
   * below is untouched — it still awaits each result exactly where it did before — but by then
   * the answers are already on their way back, so a dozen round trips cost about one. Only the
   * agent-performance scan still waits, because it genuinely needs the roster's ids first.
   *
   * `fire()` is what makes this work: a Supabase query builder is lazy — a thenable that does
   * not contact the database until something awaits it. Handing it to `Promise.resolve` starts
   * it now, which is the entire point of this block.
   */
  const fire = <T,>(query: PromiseLike<T>): Promise<T> => Promise.resolve(query);

  const now = new Date();

  // Trailing 7 days, for the "calls this week" count.
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  sevenDaysAgo.setUTCHours(0, 0, 0, 0);
  const todayEndUtc = new Date();
  todayEndUtc.setUTCHours(23, 59, 59, 999);

  // This month, and the month before it (for the comparison figure).
  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthEnd = new Date(now);
  monthEnd.setUTCHours(23, 59, 59, 999);

  const lastMonthStart = new Date(monthStart);
  lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1);
  const lastMonthEnd = new Date(monthStart);
  lastMonthEnd.setUTCMilliseconds(-1);

  // Six calendar months, oldest first, for the trend series.
  const monthLabels: string[] = [];
  const monthRanges: Array<{ start: Date; end: Date }> = [];
  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now);
    monthDate.setUTCMonth(monthDate.getUTCMonth() - i);
    monthDate.setUTCDate(1);
    monthDate.setUTCHours(0, 0, 0, 0);

    const monthEndDate = new Date(monthDate);
    monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
    monthEndDate.setUTCMilliseconds(-1);

    monthRanges.push({ start: monthDate, end: monthEndDate });
    const monthName = monthDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
    monthLabels.push(monthName);
  }
  const sixMonthsAgoStart = monthRanges[0].start;

  // Eight weeks, oldest first, for the weekly outcomes chart.
  const weekLabels: string[] = [];
  const weekRanges: Array<{ start: Date; end: Date }> = [];
  for (let i = 7; i >= 0; i--) {
    const weekDate = new Date(now);
    weekDate.setUTCDate(weekDate.getUTCDate() - (i * 7));
    const dayOfWeek = weekDate.getUTCDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(weekDate);
    weekStart.setUTCDate(weekStart.getUTCDate() + daysToMonday);
    weekStart.setUTCHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    weekRanges.push({ start: weekStart, end: weekEnd });
    const startOfYear = new Date(Date.UTC(weekStart.getUTCFullYear(), 0, 1));
    const diffTime = weekStart.getTime() - startOfYear.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weekNum = Math.ceil((diffDays + 1) / 7);
    weekLabels.push("W" + String(weekNum).padStart(2, "0"));
  }
  const eightWeeksAgoStart = weekRanges[0].start;

  // Today and yesterday in the SERVER's local timezone — deliberately unchanged, because the
  // hourly chart's buckets further down are computed the same way.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  // Trailing 30 days, for the legacy savings figure.
  const savingsTo = new Date(now);
  savingsTo.setUTCHours(23, 59, 59, 999);
  const savingsFrom = new Date(savingsTo);
  savingsFrom.setUTCDate(savingsFrom.getUTCDate() - 29); // 30 days inclusive
  savingsFrom.setUTCHours(0, 0, 0, 0);

  const q = orgId
    ? {
        org: fire(supabase.from("orgs").select("id, name").eq("id", orgId).single<Org>()),

        agentsCount: fire(supabase.from("agents").select("*", { count: "exact", head: true }).eq("org_id", orgId)),
        callsCount: fire(supabase.from("calls").select("*", { count: "exact", head: true }).eq("org_id", orgId)),
        callsLast7dCount: fire(
          supabase
            .from("calls")
            .select("*", { count: "exact", head: true })
            .eq("org_id", orgId)
            .gte("started_at", sevenDaysAgo.toISOString())
            .lte("started_at", todayEndUtc.toISOString())
        ),
        leadsCount: fire(supabase.from("leads").select("*", { count: "exact", head: true }).eq("org_id", orgId)),
        appointmentsCount: fire(
          supabase.from("appointments").select("*", { count: "exact", head: true }).eq("org_id", orgId)
        ),
        ticketsCount: fire(supabase.from("tickets").select("*", { count: "exact", head: true }).eq("org_id", orgId)),

        // Feed: only the fields the feed UI renders.
        feedCalls: fire(
          supabase
            .from("calls")
            .select("id, started_at, agent_id")
            .eq("org_id", orgId)
            .order("started_at", { ascending: false })
            .limit(3)
        ),
        feedLeads: fire(
          supabase
            .from("leads")
            .select("id, created_at, agent_id")
            .eq("org_id", orgId)
            .order("created_at", { ascending: false })
            .limit(3)
        ),
        // Six agents: enough for the feed's own items plus the name lookup the calls and leads
        // rows need.
        feedAgents: fire(
          supabase
            .from("agents")
            .select("id, name, created_at")
            .eq("org_id", orgId)
            .order("created_at", { ascending: false })
            .limit(6)
            .returns<AgentRow[]>()
        ),

        // Readiness: is a number bound to any agent?
        agentsWithPhone: fire(
          supabase.from("agents").select("id").eq("org_id", orgId).not("vapi_phone_number_id", "is", null).limit(1)
        ),

        callsMonth: fire(
          supabase
            .from("calls")
            .select("started_at, ended_at, duration_seconds")
            .eq("org_id", orgId)
            .gte("started_at", monthStart.toISOString())
            .lte("started_at", monthEnd.toISOString())
        ),
        lastMonthTotal: fire(
          supabase
            .from("calls")
            .select("*", { count: "exact", head: true })
            .eq("org_id", orgId)
            .gte("started_at", lastMonthStart.toISOString())
            .lte("started_at", lastMonthEnd.toISOString())
        ),
        ticketsMonth: fire(
          supabase
            .from("tickets")
            .select("*", { count: "exact", head: true })
            .eq("org_id", orgId)
            .gte("created_at", monthStart.toISOString())
            .lte("created_at", monthEnd.toISOString())
        ),
        appointmentsMonth: fire(
          supabase
            .from("appointments")
            .select("*", { count: "exact", head: true })
            .eq("org_id", orgId)
            .gte("created_at", monthStart.toISOString())
            .lte("created_at", monthEnd.toISOString())
        ),

        sixMonthCalls: fire(
          supabase
            .from("calls")
            .select("started_at, ended_at, duration_seconds")
            .eq("org_id", orgId)
            .gte("started_at", sixMonthsAgoStart.toISOString())
            .lte("started_at", monthEnd.toISOString())
        ),
        weeklyCalls: fire(
          supabase
            .from("calls")
            .select("started_at, ended_at, duration_seconds")
            .eq("org_id", orgId)
            .gte("started_at", eightWeeksAgoStart.toISOString())
            .lte("started_at", monthEnd.toISOString())
        ),
        weeklyTickets: fire(
          supabase
            .from("tickets")
            .select("created_at")
            .eq("org_id", orgId)
            .gte("created_at", eightWeeksAgoStart.toISOString())
            .lte("created_at", monthEnd.toISOString())
        ),
        calls48h: fire(
          supabase
            .from("calls")
            .select("started_at")
            .eq("org_id", orgId)
            .gte("started_at", startOfYesterday.toISOString())
            .lte("started_at", endOfToday.toISOString())
        ),

        roster: fire(supabase.from("agents").select("id, name").eq("org_id", orgId)),

        savingsCalls: fire(
          supabase
            .from("calls")
            .select("duration_seconds, cost_usd")
            .eq("org_id", orgId)
            .gte("started_at", savingsFrom.toISOString())
            .lte("started_at", savingsTo.toISOString())
        ),
      }
    : null;

  // 2) Org name
  let orgName = "—";
  if (q) {
    const { data: org } = await q.org;
    orgName = org?.name ?? "—";
  }

  // 3-7) Parallelize independent count queries (all org-scoped, can run concurrently)
  let agentsTotal = 0;
  let callsTotal = 0;
  let callsLast7d = 0;
  let leadsCount = 0;
  let appointmentsCount = 0;
  let ticketsCount = 0;

  if (q) {
    const [
      { count: agentsCount },
      { count: callsTotalCount },
      { count: callsLast7dCount },
      { count: leadsCountResult },
      { count: appointmentsCountResult },
      { count: ticketsCountResult },
    ] = await Promise.all([
      q.agentsCount,
      q.callsCount,
      q.callsLast7dCount,
      q.leadsCount,
      q.appointmentsCount,
      q.ticketsCount,
    ]);

    agentsTotal = typeof agentsCount === "number" ? agentsCount : 0;
    callsTotal = typeof callsTotalCount === "number" ? callsTotalCount : 0;
    callsLast7d = typeof callsLast7dCount === "number" ? callsLast7dCount : 0;
    leadsCount = typeof leadsCountResult === "number" ? leadsCountResult : 0;
    appointmentsCount = typeof appointmentsCountResult === "number" ? appointmentsCountResult : 0;
    ticketsCount = typeof ticketsCountResult === "number" ? ticketsCountResult : 0;
  }

  // 8) Feed (derive from latest calls, leads, and agents)
  // Keep it simple and safe: if tables empty or queries fail, feed remains []
  let feed: Array<{ id: string; message: string; time: string }> = [];

  if (q) {
    const [
      { data: calls },
      { data: leads },
      { data: agents },
    ] = await Promise.all([q.feedCalls, q.feedLeads, q.feedAgents]);

    // Build agent name lookup map from fetched agents
    const agentNameById: Record<string, string> = {};
    if (Array.isArray(agents)) {
      for (const agent of agents) {
        if (agent.id && agent.name) {
          agentNameById[agent.id] = agent.name;
        }
      }
    }
    const callsFeed =
      Array.isArray(calls)
        ? calls.map((c) => {
            const agentName = c.agent_id ? agentNameById[c.agent_id] : null;
            return {
              id: `call:${c.id}`,
              message: agentName
                ? `${agentName} handled a call`
                : "AI agent handled a call",
              time: timeAgoLabel(c.started_at),
            };
          })
        : [];

    const leadsFeed =
      Array.isArray(leads)
        ? leads.map((l) => {
            const agentName = l.agent_id ? agentNameById[l.agent_id] : null;
            return {
              id: `lead:${l.id}`,
              message: agentName
                ? `Lead captured by ${agentName}`
                : "Lead captured from AI conversation",
              time: timeAgoLabel(l.created_at),
            };
          })
        : [];

    const agentFeed =
      Array.isArray(agents)
        ? agents.map((a) => ({
            id: `agent:${a.id}`,
            message: `Agent created: ${a.name ?? "New agent"}`,
            time: timeAgoLabel(a.created_at),
          }))
        : [];

    // Merge and limit to 6 most recent items
    feed = [...callsFeed, ...leadsFeed, ...agentFeed]
      .sort((a, b) => {
        // Simple sort by time label (not perfect but good enough for feed)
        return 0;
      })
      .slice(0, 6);
  }

  // 9) System status (simple heuristic)
  const systemStatus: "Healthy" | "Attention Needed" = agentsTotal > 0 ? "Healthy" : "Attention Needed";

  // 10) Readiness computation (real data queries)
  let profileComplete = false;
  let phoneProvisioned = false;
  let firstCallCompleted = false;

  if (q && profile) {
    // Profile completed: full_name and email are non-null
    profileComplete = !!(profile.full_name && profile.email);

    // Phone number provisioned: at least one agent has vapi_phone_number_id
    const { data: agentsWithPhone } = await q.agentsWithPhone;

    phoneProvisioned = (agentsWithPhone?.length ?? 0) > 0;

    // First call completed: at least one call exists
    firstCallCompleted = callsTotal > 0;
  }

  const readinessSteps = [
    { label: "Create at least 1 agent", done: agentsTotal > 0 },
    { label: "Complete profile information", done: profileComplete },
    { label: "Phone number provisioned", done: phoneProvisioned },
    { label: "First call completed", done: firstCallCompleted },
  ];

  const checkedCount = readinessSteps.filter((s) => s.done).length;
  const readinessScore = Math.round((checkedCount / readinessSteps.length) * 100);

  // `now`, `monthStart`/`monthEnd` and the last-month pair are computed with the other windows
  // at the top of this function, where the queries that use them are started.

  // Monthly metrics (all use same time window: this month)
  let totalCallsMonth = 0;
  let handledCallsMonth = 0;
  let answerRate = 0;
  let ticketsCreatedMonth = 0;
  let appointmentsCreatedMonth = 0;
  let estimatedSavingsUsd = 0;
  let totalCallsThisMonth = 0;
  let totalCallsLastMonth = 0;
  let totalCallsSeries: Array<{ monthLabel: string; value: number }> = [];
  let handledCallsSeries: Array<{ monthLabel: string; value: number }> = [];
  let weeklyOutcomes: Array<{ label: string; handledCalls: number; supportTickets: number }> = [];
  let totalCallsToday = 0;
  let totalCallsYesterday = 0;
  let hourlyCallsSeries: Array<{ label: string; value: number }> = [];
  let agentPerformance: Array<{
    name: [string, boolean];
    progress: string;
    quantity: number;
    total_calls: number;
    date: string;
  }> = [];

  if (q) {
    const [
      { data: callsMonthData },
      { count: lastMonthTotalCount },
      { count: ticketsMonthCount },
      { count: appointmentsMonthCount },
    ] = await Promise.all([q.callsMonth, q.lastMonthTotal, q.ticketsMonth, q.appointmentsMonth]);

    totalCallsLastMonth = typeof lastMonthTotalCount === "number" ? lastMonthTotalCount : 0;
    ticketsCreatedMonth = typeof ticketsMonthCount === "number" ? ticketsMonthCount : 0;
    appointmentsCreatedMonth = typeof appointmentsMonthCount === "number" ? appointmentsMonthCount : 0;

    // Compute metrics from callsMonthData in JS
    if (callsMonthData) {
      totalCallsMonth = callsMonthData.length;
      totalCallsThisMonth = totalCallsMonth;

      // Handled calls: ended_at IS NOT NULL AND duration_seconds >= 5
      handledCallsMonth = callsMonthData.filter(
        (c) => c.ended_at !== null && (c.duration_seconds ?? 0) >= 5
      ).length;

      // Estimated savings: SUM(duration_seconds of handled calls) / 3600 * 25
      const totalSeconds = callsMonthData
        .filter((c) => c.ended_at !== null && (c.duration_seconds ?? 0) >= 5)
        .reduce((sum, c) => sum + (c.duration_seconds || 0), 0);
      estimatedSavingsUsd = (totalSeconds / 3600) * 25;
    } else {
      totalCallsMonth = 0;
      totalCallsThisMonth = 0;
      handledCallsMonth = 0;
      estimatedSavingsUsd = 0;
    }

    // Answer rate
    answerRate = totalCallsMonth > 0 ? (handledCallsMonth / totalCallsMonth) * 100 : 0;

    // The 6-month series buckets `monthRanges`, built with the other windows at the top.
    const { data: callsData } = await q.sixMonthCalls;

    if (callsData) {
      // Initialize buckets
      const totalCallsBuckets = new Array(6).fill(0);
      const handledCallsBuckets = new Array(6).fill(0);

      for (const call of callsData) {
        if (!call.started_at) continue;
        const callDate = new Date(call.started_at);
        
        for (let idx = 0; idx < monthRanges.length; idx++) {
          const range = monthRanges[idx];
          if (callDate >= range.start && callDate <= range.end) {
            totalCallsBuckets[idx]++;
            if (call.ended_at !== null && call.duration_seconds !== null && call.duration_seconds >= 5) {
              handledCallsBuckets[idx]++;
            }
            break;
          }
        }
      }

      totalCallsSeries = monthLabels.map((label, idx) => ({
        monthLabel: label,
        value: totalCallsBuckets[idx],
      }));

      handledCallsSeries = monthLabels.map((label, idx) => ({
        monthLabel: label,
        value: handledCallsBuckets[idx],
      }));
    }

    // The weekly outcomes chart buckets `weekRanges`, built with the other windows at the top.
    const [{ data: weeklyCallsData }, { data: weeklyTicketsData }] = await Promise.all([
      q.weeklyCalls,
      q.weeklyTickets,
    ]);

    const handledCallsWeekly = new Array(8).fill(0);
    const supportTicketsWeekly = new Array(8).fill(0);
    if (weeklyCallsData) {
      for (const call of weeklyCallsData) {
        if (!call.started_at) continue;
        const callDate = new Date(call.started_at);
        
        for (let idx = 0; idx < weekRanges.length; idx++) {
          const range = weekRanges[idx];
          if (callDate >= range.start && callDate <= range.end) {
            if (call.ended_at !== null && call.duration_seconds !== null && call.duration_seconds >= 5) {
              handledCallsWeekly[idx]++;
            }
            break;
          }
        }
      }
    }

    if (weeklyTicketsData) {
      for (const ticket of weeklyTicketsData) {
        if (!ticket.created_at) continue;
        const ticketDate = new Date(ticket.created_at);
        
        for (let idx = 0; idx < weekRanges.length; idx++) {
          const range = weekRanges[idx];
          if (ticketDate >= range.start && ticketDate <= range.end) {
            supportTicketsWeekly[idx]++;
            break;
          }
        }
      }
    }

    weeklyOutcomes = weekLabels.map((label, idx) => ({
      label,
      handledCalls: handledCallsWeekly[idx],
      supportTickets: supportTicketsWeekly[idx],
    }));

    // One 48-hour window; today, yesterday and the hourly buckets are all computed from it in
    // JS below, against the same LOCAL-timezone boundaries the query was built with at the top.
    const { data: calls48hData } = await q.calls48h;

    // Use Map to track counts by local hour (only hours with data)
    const hourlyCountsMap = new Map<number, number>();
    if (calls48hData) {
      let todayCount = 0;
      let yesterdayCount = 0;

      for (const call of calls48hData) {
        if (!call.started_at) continue;
        const callDate = new Date(call.started_at);
        
        // Determine if call is today or yesterday using LOCAL timezone
        const callDateLocal = new Date(
          callDate.getFullYear(),
          callDate.getMonth(),
          callDate.getDate()
        );
        const todayLocal = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );
        const yesterdayLocal = new Date(startOfYesterday);
        yesterdayLocal.setHours(0, 0, 0, 0);

        if (callDateLocal.getTime() === todayLocal.getTime()) {
          todayCount++;
          // Extract LOCAL hour (0-23) for hourly aggregation
          const hour = callDate.getHours();
          hourlyCountsMap.set(hour, (hourlyCountsMap.get(hour) || 0) + 1);
        } else if (callDateLocal.getTime() === yesterdayLocal.getTime()) {
          yesterdayCount++;
        }
      }

      totalCallsToday = todayCount;
      totalCallsYesterday = yesterdayCount;
    } else {
      totalCallsToday = 0;
      totalCallsYesterday = 0;
    }

    // Convert hourly map to array format, sorted ascending, only hours that exist
    hourlyCallsSeries = Array.from(hourlyCountsMap.entries())
      .sort((a, b) => a[0] - b[0]) // Sort by hour ascending
      .map(([hour, count]) => ({
        label: String(hour).padStart(2, '0'),
        value: count,
      }));

    // Agent performance for this month. The roster was started with everything else; the call
    // scan is the one query on this page that genuinely has to wait, because it is keyed on the
    // ids the roster returns.
    const { data: agentsData } = await q.roster;

    if (agentsData && agentsData.length > 0) {
      const agentIds = agentsData.map((a) => a.id);
      const { data: callsData } = await supabase
        .from("calls")
        .select("agent_id, started_at, ended_at, duration_seconds")
        .eq("org_id", orgId)
        .in("agent_id", agentIds)
        .gte("started_at", monthStart.toISOString())
        .lte("started_at", monthEnd.toISOString());

      type AgentMetrics = {
        agentId: string;
        agentName: string;
        totalCalls: number;
        handledCalls: number;
        lastActive: Date | null;
      };

      const agentMetricsMap = new Map<string, AgentMetrics>();

      // Initialize map
      for (const agent of agentsData) {
        agentMetricsMap.set(agent.id, {
          agentId: agent.id,
          agentName: agent.name || "Unnamed Agent",
          totalCalls: 0,
          handledCalls: 0,
          lastActive: null,
        });
      }

      // Aggregate calls
      if (callsData) {
        for (const call of callsData) {
          if (!call.agent_id) continue;
          const metrics = agentMetricsMap.get(call.agent_id);
          if (!metrics) continue;

          metrics.totalCalls++;
          if (
            call.ended_at !== null &&
            call.duration_seconds !== null &&
            call.duration_seconds >= 5
          ) {
            metrics.handledCalls++;
          }

          if (call.started_at) {
            const callDate = new Date(call.started_at);
            if (!metrics.lastActive || callDate > metrics.lastActive) {
              metrics.lastActive = callDate;
            }
          }
        }
      }

      // Convert to array and format
      const agentPerfArray = Array.from(agentMetricsMap.values())
        .filter((m) => m.totalCalls > 0)
        .sort((a, b) => {
          if (b.handledCalls !== a.handledCalls) {
            return b.handledCalls - a.handledCalls;
          }
          if (a.lastActive && b.lastActive) {
            return b.lastActive.getTime() - a.lastActive.getTime();
          }
          if (b.lastActive) return 1;
          if (a.lastActive) return -1;
          return 0;
        })
        .slice(0, 5)
        .map((m) => {
          const answerRate =
            m.totalCalls > 0
              ? ((m.handledCalls / m.totalCalls) * 100).toFixed(1)
              : "0.0";
          const dateStr = m.lastActive
            ? (() => {
                const day = m.lastActive.getDate();
                const month = m.lastActive.toLocaleDateString("en-US", { month: "short" });
                const year = m.lastActive.getFullYear();
                return `${day} ${month} ${year}`;
              })()
            : "—";

          return {
            name: [m.agentName, true] as [string, boolean],
            progress: `${answerRate}%`,
            quantity: m.handledCalls,
            total_calls: m.totalCalls,
            date: dateStr,
          };
        });

      agentPerformance = agentPerfArray;
    }
  }

  // 11) Compute estimated savings (legacy, 30-day range for compatibility)
  // Optimized: Only fetch duration_seconds and cost_usd (computeSummary only needs these fields)
  let estimatedSavings = 0;
  if (q) {
    try {
      // Only the two fields `computeSummary` reads, over the 30-day window built at the top.
      const { data: callsData } = await q.savingsCalls;

      // Transform to minimal CallRow shape expected by computeSummary
      const calls = (callsData || []).map((c) => ({
        id: "", // Not used by computeSummary
        agent_id: null,
        raw_payload: null,
        started_at: "",
        duration_seconds: c.duration_seconds,
        cost_usd: c.cost_usd,
        outcome: null,
        direction: null,
      }));

      const summary = computeSummary(calls, 0, 0, 0);
      estimatedSavings = summary.estimatedSavings;
    } catch (err) {
      console.error("[DASHBOARD] Failed to compute estimated savings:", err);
      estimatedSavings = 0;
    }
  }
  return {
    user: { name: userName, org: orgName },
    metrics: {
      agents_total: agentsTotal,
      agents_active: agentsTotal,
      calls_total: callsTotal,
      calls_last_7d: callsLast7d,
      leads_count: leadsCount,
      appointments_count: appointmentsCount,
      tickets_count: ticketsCount,
      estimated_savings: estimatedSavings,
      total_calls_month: totalCallsMonth,
      handled_calls_month: handledCallsMonth,
      answer_rate: answerRate,
      tickets_created_month: ticketsCreatedMonth,
      appointments_created_month: appointmentsCreatedMonth,
      estimated_savings_usd: estimatedSavingsUsd,
      total_calls_this_month: totalCallsThisMonth,
      total_calls_last_month: totalCallsLastMonth,
      total_calls_series: totalCallsSeries,
      handled_calls_series: handledCallsSeries,
      weekly_outcomes: weeklyOutcomes,
      total_calls_today: totalCallsToday,
      total_calls_yesterday: totalCallsYesterday,
      hourly_calls_series: hourlyCallsSeries,
      agent_performance: agentPerformance,
    },
    system_status: systemStatus,
    feed,
    readiness: {
      score: readinessScore,
      steps: readinessSteps,
    },
  };
}
