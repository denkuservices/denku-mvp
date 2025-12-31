import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAvgResponseTime } from "@/lib/dashboard/getAvgResponseTime";

export type DashboardOverview = {
  user: { name: string; org: string };
  metrics: {
    agents_total: number;
    agents_active: number;
    total_conversations: number;
    avg_response_time: string;
    uptime: string;
  };
  workload: {
    current_load: "Low" | "Medium" | "High";
    requests_per_min: number;
    status: string;
  };
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

type ConversationRow = {
  id: string;
  created_at: string | null;
};

function loadFromAgentsTotal(n: number): "Low" | "Medium" | "High" {
  if (n <= 1) return "Low";
  if (n <= 4) return "Medium";
  return "High";
}

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

  // 4) Conversations total (org scoped)
  let conversationsTotal = 0;
  if (orgId) {
    const { count } = await supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId);

    conversationsTotal = typeof count === "number" ? count : 0;
  }

  // 5) Avg response time (org scoped)
  const avgResponseTime = orgId ? await getAvgResponseTime(orgId) : "—";

  // 6) Feed (derive from latest agents + latest conversations)
  // Keep it simple and safe: if tables empty or queries fail, feed remains []
  let feed: Array<{ id: string; message: string; time: string }> = [];

  if (orgId) {
    const { data: agents } = await supabase
      .from("agents")
      .select("id, name, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(3)
      .returns<AgentRow[]>();

    const { data: conversations } = await supabase
      .from("conversations")
      .select("id, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(3)
      .returns<ConversationRow[]>();

    const agentFeed =
      Array.isArray(agents)
        ? agents.map((a) => ({
            id: `agent:${a.id}`,
            message: `Agent created: ${a.name ?? a.id}`,
            time: timeAgoLabel(a.created_at),
          }))
        : [];

    const convFeed =
      Array.isArray(conversations)
        ? conversations.map((c) => ({
            id: `conv:${c.id}`,
            message: `Conversation started: ${c.id}`,
            time: timeAgoLabel(c.created_at),
          }))
        : [];

    // merge + sort by "time" label not possible reliably; just interleave newest-first by created_at already limited
    // simple merge: conversations first (usually most frequent) then agents
    feed = [...convFeed, ...agentFeed].slice(0, 6);
  }

  // 7) Workload heuristic
  const currentLoad = loadFromAgentsTotal(agentsTotal);

  // 8) Readiness heuristic
  const readinessScore = agentsTotal > 0 ? 75 : 20;

  return {
    user: { name: userName, org: orgName },
    metrics: {
      agents_total: agentsTotal,
      agents_active: agentsTotal, // placeholder until you add status field
      total_conversations: conversationsTotal,
      avg_response_time: avgResponseTime,
      uptime: "—",
    },
    workload: {
      current_load: currentLoad,
      requests_per_min: Math.max(0, agentsTotal * 10),
      status: "Healthy",
    },
    feed,
    readiness: {
      score: readinessScore,
      steps: [
        { label: "Create Agent", done: agentsTotal > 0 },
        { label: "Connect Channel", done: false },
        { label: "Billing Setup", done: false },
      ],
    },
  };
}
