import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface DashboardOverviewData {
  user: {
    name: string;
    org: string;
  };
  metrics: {
    agents_total: number;
    agents_active: number;
    total_conversations: number;
    avg_response_time: string;
    uptime: string;
  };
  workload: {
    current_load: string;
    requests_per_min: number;
    status: string;
  };
  feed: Array<{
    id: string;
    message: string;
    time: string;
  }>;
  readiness: {
    score: number;
    steps: Array<{
      label: string;
      done: boolean;
    }>;
  };
}

export async function getDashboardOverview(): Promise<DashboardOverviewData> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch profile - use auth_user_id and handle duplicates
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, org_id, email, full_name")
    .eq("auth_user_id", user.id)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  
  const profile = profiles && profiles.length > 0 ? profiles[0] : null;

  let orgName = "—";
  let agentsTotal = 0;
  let feedItems: Array<{ id: string; message: string; time: string }> = [];

  if (profile?.org_id) {
    // Fetch Org
    const { data: org } = await supabase
      .from("orgs")
      .select("id, name")
      .eq("id", profile.org_id)
      .single();

    if (org) {
      orgName = org.name;
    }

    // Fetch Agents Count
    const { count } = await supabase
      .from("agents")
      .select("*", { count: "exact", head: true })
      .eq("org_id", profile.org_id);

    agentsTotal = count || 0;

    // Fetch Feed (Recent Agents)
    const { data: recentAgents } = await supabase
      .from("agents")
      .select("id, name, created_at")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (recentAgents) {
      feedItems = recentAgents.map((agent) => ({
        id: String(agent.id),
        message: `Agent created: ${agent.name ?? agent.id}`,
        time: "recent",
      }));
    }
  }

  // Workload Logic
  let currentLoad = "Low";
  if (agentsTotal >= 5) currentLoad = "High";
  else if (agentsTotal >= 2) currentLoad = "Medium";

  // Readiness Logic
  const hasAgents = agentsTotal > 0;
  const readinessScore = hasAgents ? 75 : 20;

  const userName = profile?.full_name || user.email || "User";

  return {
    user: {
      name: userName,
      org: orgName,
    },
    metrics: {
      agents_total: agentsTotal,
      agents_active: agentsTotal, // placeholder
      total_conversations: 0,
      avg_response_time: "—",
      uptime: "—",
    },
    workload: {
      current_load: currentLoad,
      requests_per_min: agentsTotal * 10,
      status: "Healthy",
    },
    feed: feedItems,
    readiness: {
      score: readinessScore,
      steps: [
        { label: "Create Agent", done: hasAgents },
        { label: "Connect Channel", done: false },
        { label: "Billing Setup", done: false },
      ],
    },
  };
}