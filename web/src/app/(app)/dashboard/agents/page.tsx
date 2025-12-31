export const runtime = "nodejs";

import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type AgentRow = {
  id: string;
  name: string;
  vapi_assistant_id: string | null;
  vapi_phone_number_id: string | null;
  created_at?: string | null;
};

export default async function Page() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) redirect("/login");

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single<{ org_id: string | null }>();

  if (profErr) throw new Error(profErr.message);
  if (!profile?.org_id) throw new Error("No org found for this user.");

  const { data: agents, error: agentsErr } = await supabaseAdmin
    .from("agents")
    .select("id,name,vapi_assistant_id,vapi_phone_number_id,created_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false })
    .returns<AgentRow[]>();

  if (agentsErr) throw new Error(agentsErr.message);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Agents</h1>
          <p className="text-sm text-muted-foreground">
            Manage your deployed voice agents and view performance.
          </p>
        </div>

        <Link
          href="/dashboard/agents/new"
          className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Create agent
        </Link>
      </div>

      {(!agents || agents.length === 0) ? (
        <div className="border rounded-lg p-6 text-sm text-muted-foreground">
          No agents yet. Create your first agent to start receiving calls.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left hidden md:table-cell">Vapi Assistant</th>
                <th className="p-3 text-left hidden md:table-cell">Phone Number</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-3 font-medium">{a.name}</td>

                  <td className="p-3 hidden md:table-cell">
                    <span className="text-xs text-muted-foreground">
                      {a.vapi_assistant_id ?? "—"}
                    </span>
                  </td>

                  <td className="p-3 hidden md:table-cell">
                    <span className="text-xs text-muted-foreground">
                      {a.vapi_phone_number_id ?? "—"}
                    </span>
                  </td>

                  <td className="p-3 text-right">
                    <Link
                      href={`/dashboard/agents/${a.id}`}
                      className="text-sm underline underline-offset-4"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
