import { redirect } from "next/navigation";
import Link from "next/link";
import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AgentsListClient } from "./_components/AgentsListClient";

type AgentRow = {
  id: string;
  name: string | null;
  created_at: string;
};

export default async function AgentsListPage() {
  const supabase = await createSupabaseServerClient();

  // 1) Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2) Get profile with org_id
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("id", user.id)
    .single<{ id: string; org_id: string | null }>();

  if (profErr || !profile || !profile.org_id) {
    // No org found - show empty state
    return (
      <SettingsShell
        title="Agents"
        subtitle="Manage your agents — behavior, language, and advanced overrides."
        crumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Agents" },
        ]}
      >
        <div className="px-6 py-12">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-8 text-center">
            <p className="text-base font-semibold text-zinc-900">No organization found</p>
            <p className="mt-2 text-sm text-zinc-600">Please contact support to set up your organization.</p>
          </div>
        </div>
      </SettingsShell>
    );
  }

  const orgId = profile.org_id;

  // 3) Fetch agents for this org
  const { data: agents, error: agentsErr } = await supabase
    .from("agents")
    .select("id, name, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const agentList: AgentRow[] = agents || [];

  return (
    <SettingsShell
      title="Agents"
      subtitle="Manage your agents — behavior, language, and advanced overrides."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Agents" },
      ]}
    >
      <AgentsListClient agents={agentList} />
    </SettingsShell>
  );
}
