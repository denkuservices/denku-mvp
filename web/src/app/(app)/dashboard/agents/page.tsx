// src/app/(app)/dashboard/agents/page.tsx
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AgentRow = {
  id: string;
  name: string | null;
  created_at: string | null;
  vapi_assistant_id: string | null;
  vapi_phone_number_id: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("agents")
    .select("id,name,created_at,vapi_assistant_id,vapi_phone_number_id")
    .order("created_at", { ascending: false })
    .limit(50);

  const agents = (data ?? []) as AgentRow[];

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
          className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Create Agent
        </Link>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Failed to load agents: {error.message}
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-md border bg-white p-6 text-sm text-gray-700">
          No agents found yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="hidden px-4 py-3 sm:table-cell">Status</th>
                <th className="hidden px-4 py-3 md:table-cell">Created</th>
                <th className="px-4 py-3 text-right">Open</th>
              </tr>
            </thead>

            <tbody>
              {agents.map((a) => {
                // UI-only status (no DB column)
                const statusLabel = a.vapi_assistant_id ? "Active" : "Draft";
                const statusClass = a.vapi_assistant_id
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800";

                return (
                  <tr
                    key={a.id}
                    className="border-t hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 align-top">
                      <Link href={`/dashboard/agents/${a.id}`} className="block group">
                        <div className="font-medium text-gray-900 group-hover:underline">
                          {a.name ?? "Untitled Agent"}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {a.vapi_assistant_id
                            ? "Vapi: connected"
                            : "Vapi: not connected"}
                        </div>

                        {/* mobile details */}
                        <div className="mt-2 space-y-1 text-xs text-gray-600 sm:hidden">
                          <div>
                            <span className="text-gray-500">Status:</span>{" "}
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${statusClass}`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Created:</span>{" "}
                            {formatDate(a.created_at)}
                          </div>
                        </div>
                      </Link>
                    </td>

                    <td className="hidden px-4 py-3 align-top sm:table-cell">
                      <Link href={`/dashboard/agents/${a.id}`} className="block" tabIndex={-1}>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
                        >
                          {statusLabel}
                        </span>
                      </Link>
                    </td>

                    <td className="hidden px-4 py-3 align-top md:table-cell text-gray-700">
                      <Link href={`/dashboard/agents/${a.id}`} className="block" tabIndex={-1}>
                        {formatDate(a.created_at)}
                      </Link>
                    </td>

                    <td className="px-4 py-3 text-right align-top">
                      <Link
                        href={`/dashboard/agents/${a.id}`}
                        className="rounded-md border bg-white px-2.5 py-1 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
