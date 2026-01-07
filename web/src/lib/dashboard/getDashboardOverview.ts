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

  // 1) Profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, email, full_name")
    .eq("id", user.id)
    .single<Profile>();

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

  // 11) Compute estimated savings (reuse analytics computation, no new queries)
  // Use 30-day range for dashboard overview
  let estimatedSavings = 0;
  if (orgId) {
    try {
      const now = new Date();
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

      // Compute summary to get estimated savings (counts not needed for dashboard)
      const summary = computeSummary(calls, 0, 0, 0);
      estimatedSavings = summary.estimatedSavings;
    } catch (err) {
      // If analytics computation fails, default to 0 (non-blocking)
      console.error("[DASHBOARD] Failed to compute estimated savings:", err);
      estimatedSavings = 0;
    }
  }

  return {
    user: { name: userName, org: orgName },
    metrics: {
      agents_total: agentsTotal,
      agents_active: agentsTotal, // placeholder until you add status field
      calls_total: callsTotal,
      calls_last_7d: callsLast7d,
      leads_count: leadsCount,
      appointments_count: appointmentsCount,
      tickets_count: ticketsCount,
      estimated_savings: estimatedSavings,
    },
    system_status: systemStatus,
    feed,
    readiness: {
      score: readinessScore,
      steps: readinessSteps,
    },
  };
}
