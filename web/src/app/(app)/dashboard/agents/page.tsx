import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAgentsList } from "@/lib/agents/queries";
import AgentsClient from "./AgentsClient";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Agents</h1>
            <p className="mt-1 text-sm text-gray-600">
              View agents and drill into KPI and recent calls.
            </p>
          </div>
        </div>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          No organization found. Please contact support.
        </div>
      </div>
    );
  }

  // Fetch agents with computed metrics
  const agents = await getAgentsList(orgId);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Agents</h1>
          <p className="mt-1 text-sm text-gray-600">
            View agents and drill into KPI and recent calls.
          </p>
        </div>

        <Link
          href="/dashboard/agents/new"
          className="linear flex cursor-pointer items-center justify-center rounded-xl bg-brand-500 px-4 py-[11px] font-bold text-white transition duration-200 hover:bg-brand-600 hover:text-white active:bg-brand-700 dark:bg-brand-400 dark:hover:bg-brand-300 dark:active:bg-brand-200"
        >
          Create Agent
        </Link>
      </div>

      <AgentsClient agents={agents} />
    </div>
  );
}
