import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/currentUser";
import { getAgentsList } from "@/lib/agents/queries";
import AgentsClient from "./AgentsClient";
import { HorizonLinkButton } from "@/components/ui-horizon/button";
import { Notice } from "@/components/ui-horizon/notice";
import PageHeader from "@/components/ui-horizon/page-header";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const supabase = await createSupabaseServerClient();

  const user = await getCachedUser();

  if (!user) redirect("/login");

  // Get org_id from profile
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("auth_user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1);

  const profile = profiles && profiles.length > 0 ? profiles[0] : null;
  const orgId = profile?.org_id ?? null;

  if (!orgId) {
    return (
      <div className="space-y-6 pb-8">
        <PageHeader title="AI profiles" subtitle="Manage the AI that answers your voice calls." />
        <Notice tone="danger">No workspace was found. Please contact support.</Notice>
      </div>
    );
  }

  // Fetch agents with computed metrics
  const agents = await getAgentsList(orgId);

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="AI profiles"
        subtitle="Monitor availability, call capacity, and recent activity."
        action={<HorizonLinkButton href="/dashboard/agents/new" variant="primary">Create AI</HorizonLinkButton>}
      />
      <AgentsClient agents={agents} title="AI directory" />
    </div>
  );
}
