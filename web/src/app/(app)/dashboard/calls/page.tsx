import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

// =================================================================================
// Data Fetching & Auth Helpers
// =================================================================================

function toBasicAuthHeader() {
  const user = process.env.ADMIN_USER ?? "";
  const pass = process.env.ADMIN_PASS ?? "";
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return `Basic ${token}`;
}

function getBaseUrl() {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site && site.includes("localhost")) return site;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

async function adminGetJSON<T>(path: string): Promise<T | null> {
  try {
    const base = getBaseUrl();
    const res = await fetch(`${base}${path}`, {
      method: "GET",
      headers: {
        Authorization: toBasicAuthHeader(),
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    return null;
  }
}

// =================================================================================
// Formatting Helpers
// =================================================================================

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(sec?: number | null) {
  if (sec === null || sec === undefined) return "—";
  if (!Number.isFinite(sec)) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

function money(v?: number | string | null) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(4)}`;
}

function outcomeBadgeClass(outcome?: string | null) {
  const lower = (outcome ?? "").toLowerCase();
  if (lower.includes("completed") || lower.includes("end-of-call-report")) {
    return "bg-green-100 text-green-800";
  }
  if (lower.includes("ended")) {
    return "bg-gray-100 text-gray-800";
  }
  if (
    lower.includes("failed") ||
    lower.includes("error") ||
    lower.includes("no-answer")
  ) {
    return "bg-red-100 text-red-800";
  }
  return "bg-blue-100 text-blue-800";
}

// =================================================================================
// Types
// =================================================================================

type CallRow = {
  id: string;
  created_at: string;
  outcome: string | null;
  duration_seconds: number | null;
  cost_usd: number | string | null;
  agent_id: string | null;
};

// =================================================================================
// Page Component
// =================================================================================

export default async function CallsPage() {
  console.log("[CallsPage] ADMIN_USER is set:", !!process.env.ADMIN_USER);
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("calls")
    .select("id, created_at, outcome, duration_seconds, cost_usd, agent_id")
    .order("created_at", { ascending: false })
    .limit(100);

  const callRows: CallRow[] = Array.isArray(data) ? (data as CallRow[]) : [];

  // Batch resolve agent names using the new endpoint
  let resolverError: { status: number } | null = null;
  const agentNameMap = new Map<string, string>();
  const agentIdsToFetch = [
    ...new Set(
      callRows
        .slice(0, 50) // only resolve for first 50
        .map((c) => c.agent_id)
        .filter((id): id is string => !!id)
    ),
  ];

  if (agentIdsToFetch.length > 0) {
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/admin/agents/by-ids`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: agentIdsToFetch }),
      });

      console.log(`[CallsPage] Agent resolver response status: ${res.status}`);

      if (res.ok) {
        const body = (await res.json()) as { agents: { id: string; name: string }[] };
        const receivedCount = body.agents?.length ?? 0;
        console.log(`[CallsPage] Requested ${agentIdsToFetch.length} agent IDs, got ${receivedCount} names.`);

        for (const agent of body.agents) {
          if (agent.id && agent.name) {
            agentNameMap.set(agent.id, agent.name);
          }
        }
      } else {
        resolverError = { status: res.status };
        console.warn(`[CallsPage] Agent resolver failed with status ${res.status}`);
      }
    } catch (e: any) {
      resolverError = { status: 500 };
      console.error("[CallsPage] Agent resolver fetch threw an error:", e.message);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Calls
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Browse recent calls from all agents.
          </p>
        </div>
      </div>

      {resolverError && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-amber-800">
                Agent names may be missing
              </h3>
              <div className="mt-2 text-sm text-amber-700">
                <p>
                  The agent name resolver failed with status code{' '}
                  <b>{resolverError.status}</b>. This might be due to a
                  misconfigured environment variable on the server.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Failed to load calls: {error.message}
        </div>
      ) : callRows.length === 0 ? (
        <div className="rounded-md border bg-white p-6 text-center text-sm text-gray-700">
          No calls found yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Outcome</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">
                  Started
                </th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">
                  Duration
                </th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">
                  Cost
                </th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>

            <tbody>
              {callRows.map((call) => {
                const href = `/dashboard/calls/${call.id}`;
                const agentName = call.agent_id ? agentNameMap.get(call.agent_id) ?? "—" : "—";

                return (
                  <tr key={call.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3 align-top">
                      <Link href={href} className="block group">
                        <div className="font-medium text-gray-900 group-hover:underline">
                          {agentName}
                        </div>
                        <div className="mt-1 text-xs text-gray-500 md:hidden">
                          {formatDate(call.created_at)}
                        </div>
                      </Link>
                    </td>

                    <td className="px-4 py-3 align-top">
                      <Link href={href} className="block" tabIndex={-1}>
                        <span
                          className={`inline-block max-w-[140px] truncate rounded-full px-2 py-0.5 text-xs font-medium sm:max-w-[200px] ${outcomeBadgeClass(
                            call.outcome
                          )}`}
                          title={call.outcome ?? ""}
                        >
                          {call.outcome || "—"}
                        </span>
                      </Link>
                    </td>

                    <td className="hidden px-4 py-3 align-top md:table-cell">
                      <Link href={href} className="block" tabIndex={-1}>
                        {formatDate(call.created_at)}
                      </Link>
                    </td>

                    <td className="hidden px-4 py-3 align-top sm:table-cell">
                      <Link href={href} className="block" tabIndex={-1}>
                        {formatDuration(call.duration_seconds)}
                      </Link>
                    </td>

                    <td className="hidden px-4 py-3 align-top lg:table-cell">
                      <Link href={href} className="block" tabIndex={-1}>
                        {money(call.cost_usd)}
                      </Link>
                    </td>

                    <td className="px-4 py-3 text-right align-top">
                      <Link
                        href={href}
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

