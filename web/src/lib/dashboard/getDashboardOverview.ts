import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchCalls, computeSummary } from "@/lib/analytics/queries";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  // 2) Org name
  let orgName = "—";
  if (orgId) {
    const { data: org } = await supabase
      .from("orgs")
      .select("id, name")
      .eq("id", orgId)
      .single<Org>();

    orgName = org?.name ?? "—";
  }

  // 3) Agents total (org scoped)
  let agentsTotal = 0;
  if (orgId) {
    const { count } = await supabase
      .from("agents")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId);

    agentsTotal = typeof count === "number" ? count : 0;
  }

  // 4) Calls count (total and last 7 days)
  let callsTotal = 0;
  let callsLast7d = 0;
  if (orgId) {
    // Total calls
    const { count: totalCount } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId);

    callsTotal = typeof totalCount === "number" ? totalCount : 0;

    // Last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
    sevenDaysAgo.setUTCHours(0, 0, 0, 0);
    const now = new Date();
    now.setUTCHours(23, 59, 59, 999);

    const { count: last7dCount } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("started_at", sevenDaysAgo.toISOString())
      .lte("started_at", now.toISOString());

    callsLast7d = typeof last7dCount === "number" ? last7dCount : 0;
  }

  // 5) Leads count (org scoped)
  let leadsCount = 0;
  if (orgId) {
    const { count } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId);

    leadsCount = typeof count === "number" ? count : 0;
  }

  // 6) Appointments count (org scoped)
  let appointmentsCount = 0;
  if (orgId) {
    const { count } = await supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId);

    appointmentsCount = typeof count === "number" ? count : 0;
  }

  // 7) Tickets count (org scoped)
  let ticketsCount = 0;
  if (orgId) {
    const { count } = await supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId);

    ticketsCount = typeof count === "number" ? count : 0;
  }

  // 8) Feed (derive from latest calls, leads, and agents)
  // Keep it simple and safe: if tables empty or queries fail, feed remains []
  let feed: Array<{ id: string; message: string; time: string }> = [];

  if (orgId) {
    // Fetch recent calls with agent_id
    const { data: calls } = await supabase
      .from("calls")
      .select("id, started_at, agent_id")
      .eq("org_id", orgId)
      .order("started_at", { ascending: false })
      .limit(3);

    // Fetch recent leads (check if they have agent_id directly)
    const { data: leads } = await supabase
      .from("leads")
      .select("id, created_at, agent_id")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(3);

    // Fetch recent agents (for agent creation feed and name lookup)
    const { data: agents } = await supabase
      .from("agents")
      .select("id, name, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10) // Increase limit to build better agent name lookup map
      .returns<AgentRow[]>();

    // Build agent name lookup map
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

  if (orgId && profile) {
    // Profile completed: full_name and email are non-null
    profileComplete = !!(profile.full_name && profile.email);

    // Phone number provisioned: at least one agent has vapi_phone_number_id
    const { data: agentsWithPhone } = await supabase
      .from("agents")
      .select("id")
      .eq("org_id", orgId)
      .not("vapi_phone_number_id", "is", null)
      .limit(1);

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

  // Date range for this month
  const now = new Date();
  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthEnd = new Date(now);
  monthEnd.setUTCHours(23, 59, 59, 999);

  // Last month range
  const lastMonthStart = new Date(monthStart);
  lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1);
  const lastMonthEnd = new Date(monthStart);
  lastMonthEnd.setUTCMilliseconds(-1);

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
    date: string;
  }> = [];

  if (orgId) {
    // Total calls this month
    const { count: monthTotalCount } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("started_at", monthStart.toISOString())
      .lte("started_at", monthEnd.toISOString());

    totalCallsMonth = typeof monthTotalCount === "number" ? monthTotalCount : 0;
    totalCallsThisMonth = totalCallsMonth;

    // Total calls last month
    const { count: lastMonthTotalCount } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("started_at", lastMonthStart.toISOString())
      .lte("started_at", lastMonthEnd.toISOString());

    totalCallsLastMonth = typeof lastMonthTotalCount === "number" ? lastMonthTotalCount : 0;

    // Handled calls this month (duration_seconds >= 5 AND ended_at IS NOT NULL)
    const { count: handledCount } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("started_at", monthStart.toISOString())
      .lte("started_at", monthEnd.toISOString())
      .not("ended_at", "is", null)
      .gte("duration_seconds", 5);

    handledCallsMonth = typeof handledCount === "number" ? handledCount : 0;

    // Answer rate
    answerRate = totalCallsMonth > 0 ? (handledCallsMonth / totalCallsMonth) * 100 : 0;

    // Tickets created this month
    const { count: ticketsMonthCount } = await supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", monthStart.toISOString())
      .lte("created_at", monthEnd.toISOString());

    ticketsCreatedMonth = typeof ticketsMonthCount === "number" ? ticketsMonthCount : 0;

    // Appointments created this month
    const { count: appointmentsMonthCount } = await supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", monthStart.toISOString())
      .lte("created_at", monthEnd.toISOString());

    appointmentsCreatedMonth = typeof appointmentsMonthCount === "number" ? appointmentsMonthCount : 0;

    // Estimated savings USD: (SUM(duration_seconds of handled calls in month) / 3600) * 25
    const { data: handledCallsData } = await supabase
      .from("calls")
      .select("duration_seconds")
      .eq("org_id", orgId)
      .gte("started_at", monthStart.toISOString())
      .lte("started_at", monthEnd.toISOString())
      .not("ended_at", "is", null)
      .gte("duration_seconds", 5);

    if (handledCallsData) {
      const totalSeconds = handledCallsData.reduce(
        (sum, c) => sum + (c.duration_seconds || 0),
        0
      );
      estimatedSavingsUsd = (totalSeconds / 3600) * 25;
    }

    // Generate 6-month series (last 6 months including current)
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

    // Aggregate calls by month (single query for efficiency)
    const sixMonthsAgoStart = monthRanges[0].start;
    const { data: callsData } = await supabase
      .from("calls")
      .select("started_at, ended_at, duration_seconds")
      .eq("org_id", orgId)
      .gte("started_at", sixMonthsAgoStart.toISOString())
      .lte("started_at", monthEnd.toISOString());

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

    // Generate 8-week series (last 8 weeks including current)
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
      weekLabels.push(`W${String(weekNum).padStart(2, '0')}`);
    }

    // Fetch calls and tickets for 8-week window
    const eightWeeksAgoStart = weekRanges[0].start;
    const { data: weeklyCallsData } = await supabase
      .from("calls")
      .select("started_at, ended_at, duration_seconds")
      .eq("org_id", orgId)
      .gte("started_at", eightWeeksAgoStart.toISOString())
      .lte("started_at", monthEnd.toISOString());

    const { data: weeklyTicketsData } = await supabase
      .from("tickets")
      .select("created_at")
      .eq("org_id", orgId)
      .gte("created_at", eightWeeksAgoStart.toISOString())
      .lte("created_at", monthEnd.toISOString());

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

    // Today range (LOCAL timezone)
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0, 0, 0, 0
    );
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23, 59, 59, 999
    );

    // Yesterday range (LOCAL timezone)
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const endOfYesterday = new Date(startOfToday);
    endOfYesterday.setMilliseconds(-1);

    // Total calls today
    const { count: todayCount } = await supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("started_at", startOfToday.toISOString())
      .lte("started_at", endOfToday.toISOString());

    totalCallsToday = typeof todayCount === "number" ? todayCount : 0;

    // Total calls yesterday
    const { count: yesterdayCount } = await supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("started_at", startOfYesterday.toISOString())
      .lte("started_at", endOfYesterday.toISOString());

    totalCallsYesterday = typeof yesterdayCount === "number" ? yesterdayCount : 0;

    // Hourly aggregation for today: use LOCAL timezone, sparse buckets (only hours with data)
    const { data: todayCallsData } = await supabase
      .from("calls")
      .select("started_at")
      .eq("org_id", orgId)
      .gte("started_at", startOfToday.toISOString())
      .lte("started_at", endOfToday.toISOString());

    // Use Map to track counts by local hour (only hours with data)
    const hourlyCountsMap = new Map<number, number>();

    if (todayCallsData) {
      for (const call of todayCallsData) {
        if (!call.started_at) continue;
        const callDate = new Date(call.started_at);
        // Extract LOCAL hour (0-23)
        const hour = callDate.getHours();
        hourlyCountsMap.set(hour, (hourlyCountsMap.get(hour) || 0) + 1);
      }
    }

    // Convert to array format, sorted ascending, only hours that exist
    hourlyCallsSeries = Array.from(hourlyCountsMap.entries())
      .sort((a, b) => a[0] - b[0]) // Sort by hour ascending
      .map(([hour, count]) => ({
        label: String(hour).padStart(2, '0'),
        value: count,
      }));

    // Agent performance for this month
    const { data: agentsData } = await supabase
      .from("agents")
      .select("id, name")
      .eq("org_id", orgId);

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
            date: dateStr,
          };
        });

      agentPerformance = agentPerfArray;
    }
  }

  // 11) Compute estimated savings (legacy, 30-day range for compatibility)
  let estimatedSavings = 0;
  if (orgId) {
    try {
      const to = new Date(now);
      to.setUTCHours(23, 59, 59, 999);
      const from = new Date(to);
      from.setUTCDate(from.getUTCDate() - 29); // 30 days inclusive
      from.setUTCHours(0, 0, 0, 0);

      const calls = await fetchCalls({
        orgId,
        from,
        to,
      });

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
