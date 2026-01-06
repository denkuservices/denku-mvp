import { redirect } from "next/navigation";
import Link from "next/link";
import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceStatus } from "@/lib/workspace-status";
import { AgentConfigurePage } from "./_components/AgentConfigurePage";

type Agent = {
  id: string;
  org_id: string;
  name: string;
  language: string | null;
  voice: string | null;
  timezone: string | null;
  behavior_preset: string | null;
  agent_type: string | null;
  first_message: string | null;
  emphasis_points: string[] | null;
  system_prompt_override: string | null;
  effective_system_prompt: string | null;
  vapi_assistant_id: string | null;
  vapi_sync_status: string | null;
  vapi_synced_at: string | null;
  created_at: string;
  updated_at: string | null;
};

/**
 * Validate UUID format
 */
function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Fetch agent by id and org_id (enforce org ownership)
 */
async function getAgent(agentId: string, orgId: string): Promise<Agent | null> {
  const supabase = await createSupabaseServerClient();

  const { data: agent, error } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .eq("org_id", orgId)
    .single<Agent>();

  if (error) {
    // Debug logging (safe for server-side)
    if (process.env.NODE_ENV !== "production") {
      console.log("[AgentDetailPage] Agent query error:", {
        agentId,
        orgId,
        errorMessage: error.message,
        errorCode: error.code,
        errorDetails: error.details,
      });
    }
    return null;
  }

  if (!agent) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[AgentDetailPage] Agent not found:", { agentId, orgId });
    }
    return null;
  }

  return agent;
}

export default async function AgentDetailPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;

  // Debug logging (safe for server-side)
  if (process.env.NODE_ENV !== "production") {
    console.log("[AgentDetailPage] Starting guard checks:", { agentId });
  }

  // 1) Validate agentId
  if (!agentId || agentId === "undefined" || !isValidUUID(agentId)) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[AgentDetailPage] Invalid UUID, redirecting:", { agentId });
    }
    redirect("/dashboard/settings/agents");
  }

  const supabase = await createSupabaseServerClient();

  // 2) Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[AgentDetailPage] No user, redirecting to login:", { authError: authError?.message });
    }
    redirect("/login");
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[AgentDetailPage] User authenticated:", { userId: user.id });
  }

  // 3) Get profile with org_id
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("id", user.id)
    .single<{ id: string; org_id: string | null }>();

  if (profErr) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[AgentDetailPage] Profile query error:", {
        userId: user.id,
        errorMessage: profErr.message,
        errorCode: profErr.code,
        errorDetails: profErr.details,
      });
    }
    redirect("/dashboard/settings/agents");
  }

  if (!profile || !profile.org_id) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[AgentDetailPage] No profile or org_id, redirecting:", {
        hasProfile: !!profile,
        orgId: profile?.org_id,
      });
    }
    redirect("/dashboard/settings/agents");
  }

  const orgId = profile.org_id;

  if (process.env.NODE_ENV !== "production") {
    console.log("[AgentDetailPage] Profile resolved:", { userId: user.id, orgId });
  }

  // 4) Fetch agent (enforce org ownership)
  const agent = await getAgent(agentId, orgId);

  if (!agent) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[AgentDetailPage] Agent not found or unauthorized, redirecting:", { agentId, orgId });
    }
    redirect("/dashboard/settings/agents");
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[AgentDetailPage] Agent found, rendering page:", { agentId, agentName: agent.name });
  }

  // 5) Get workspace status
  const workspaceStatus = await getWorkspaceStatus(orgId);

  // 6) Render page with agent context
  return (
    <SettingsShell
      title={agent.name}
      subtitle="Configure this agent's behavior and default experience."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Agents", href: "/dashboard/settings/agents" },
        { label: agent.name },
      ]}
      workspaceStatus={workspaceStatus}
    >
      <AgentConfigurePage agent={agent} workspaceStatus={workspaceStatus} />
    </SettingsShell>
  );
}
