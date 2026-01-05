import { redirect } from "next/navigation";
import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AgentAdvancedContent } from "./_components/AgentAdvancedPage";

type Agent = {
  id: string;
  org_id: string;
  name: string;
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
    .select("id, org_id, name")
    .eq("id", agentId)
    .eq("org_id", orgId)
    .single<Agent>();

  if (error || !agent) {
    return null;
  }

  return agent;
}

export default async function AgentAdvancedPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;

  // 1) Validate agentId
  if (!agentId || agentId === "undefined" || !isValidUUID(agentId)) {
    redirect("/dashboard/settings/agents");
  }

  const supabase = await createSupabaseServerClient();

  // 2) Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 3) Get profile with org_id
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("id", user.id)
    .single<{ id: string; org_id: string | null }>();

  if (profErr || !profile || !profile.org_id) {
    redirect("/dashboard/settings/agents");
  }

  const orgId = profile.org_id;

  // 4) Fetch agent (enforce org ownership)
  const agent = await getAgent(agentId, orgId);

  if (!agent) {
    redirect("/dashboard/settings/agents");
  }

  // 5) Render page with agent context
  return (
    <SettingsShell
      title={`Advanced settings for ${agent.name}`}
      subtitle="Power-user overrides for this agent."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Agents", href: "/dashboard/settings/agents" },
        { label: agent.name, href: `/dashboard/settings/agents/${agent.id}` },
        { label: "Advanced" },
      ]}
    >
      <AgentAdvancedContent agent={agent} />
    </SettingsShell>
  );
}
