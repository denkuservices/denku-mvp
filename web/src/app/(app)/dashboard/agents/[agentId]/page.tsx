// web/src/app/(app)/dashboard/agents/[agentId]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";

type AgentRow = {
  id: string;
  org_id: string | null;
  name: string | null;
  created_at: string | null;
  vapi_assistant_id: string | null;
  vapi_phone_number_id: string | null;
};


type CallRow = {
  id: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  cost_usd: number | string | null;
  outcome: string | null;
  status: string | null;
  created_at: string | null;
};

type AdminAgentDetailResponse = {
  ok: boolean;
  agent?: AgentRow | null;
  calls?: CallRow[];
  error?: string;
  details?: string;
  calls_error?: string;
};

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

async function adminGetJSON<T>(path: string): Promise<T> {
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
    const text = await res.text().catch(() => "");
    throw new Error(`Admin API failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

function fmt(input?: string | null) {
  if (!input) return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleString();
}

function money(v?: number | string | null) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(4)}`;
}

function formatDuration(sec?: number | null) {
  if (sec === null || sec === undefined) return "—";
  if (!Number.isFinite(sec)) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function pct(rate?: number | null) {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}

function statusLabel(status?: string | null) {
  const s = (status ?? "active").toLowerCase();
  if (s === "disabled") return "Disabled";
  if (s === "draft") return "Draft";
  return "Active";
}

function statusBadgeClass(status?: string | null) {
  const s = (status ?? "active").toLowerCase();
  if (s === "disabled") return "bg-gray-100 text-gray-800 border-gray-200";
  if (s === "draft") return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-emerald-50 text-emerald-900 border-emerald-200";
}

function outcomeBadgeClass(outcome?: string | null) {
  const lower = (outcome ?? "").toLowerCase();
  if (lower.includes("completed") || lower.includes("end-of-call-report")) return "bg-green-100 text-green-800";
  if (lower.includes("failed") || lower.includes("error") || lower.includes("no-answer")) return "bg-red-100 text-red-800";
  if (lower.includes("ended")) return "bg-gray-100 text-gray-800";
  return "bg-blue-100 text-blue-800";
}

function calcAvgDurationSeconds(calls: CallRow[]) {
  const xs = calls
    .map((c) => c.duration_seconds)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!xs.length) return null;
  const sum = xs.reduce((a, b) => a + b, 0);
  return Math.round(sum / xs.length);
}

function calcSuccessRate(calls: CallRow[]) {
  if (!calls.length) return null;
  const ok = calls.filter((c) => {
    const outcome = (c.outcome ?? "").toLowerCase();
    return outcome.includes("completed") || outcome.includes("end-of-call-report");
  }).length;
  return ok / calls.length;
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;

  let payload: AdminAgentDetailResponse;
  try {
    payload = await adminGetJSON<AdminAgentDetailResponse>(`/api/admin/agents/${agentId}`);
  } catch (e: any) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Failed to load agent</h1>
        <p className="mt-2 text-sm text-gray-600">{e?.message ?? "Unknown error"}</p>
        <div className="mt-4">
          <Link href="/dashboard/agents" className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50">
            Back to Agents
          </Link>
        </div>
      </div>
    );
  }

  const agent = payload.agent ?? null;
  const calls = payload.calls ?? [];
  const recent = calls.slice(0, 10);

  if (!agent) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Agent not found</h1>
        <div className="mt-4">
          <Link href="/dashboard/agents" className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50">
            Back to Agents
          </Link>
        </div>
      </div>
    );
  }

  const callsTotal = calls.length;
  const totalCost = calls.reduce((sum, c) => sum + (Number(c.cost_usd) || 0), 0);
  const avgDuration = calcAvgDurationSeconds(calls);
  const successRate = calcSuccessRate(calls);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="text-sm text-gray-500">
        <Link href="/dashboard" className="hover:underline">Dashboard</Link> /{" "}
        <Link href="/dashboard/agents" className="hover:underline">Agents</Link> /{" "}
        <span className="text-gray-700">{agent.name ?? "Agent"}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{agent.name ?? "Agent"}</h1>
            <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-900 border-emerald-200">
  Active
</span>

          </div>
          <p className="mt-1 text-sm text-gray-600">KPI snapshot + recent calls (last 7 days).</p>
        </div>

        <Link href="/dashboard/agents" className="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
          Back to Agents
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500">Calls (7d)</div>
          <div className="mt-1 text-sm font-medium text-gray-900">{callsTotal}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500">Cost (7d)</div>
          <div className="mt-1 text-sm font-medium text-gray-900">{money(totalCost)}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500">Avg Duration (7d)</div>
          <div className="mt-1 text-sm font-medium text-gray-900">{formatDuration(avgDuration)}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500">Success Rate (7d)</div>
          <div className="mt-1 text-sm font-medium text-gray-900">{pct(successRate)}</div>
        </div>
      </div>

      {payload.calls_error ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Calls warning: {payload.calls_error}
        </div>
      ) : null}

      <div className="rounded-lg border bg-white">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <div className="text-sm font-semibold">Recent Calls</div>
            <div className="text-xs text-gray-500">Last 10 calls.</div>
          </div>
          <Link href="/dashboard/calls" className="text-sm font-medium hover:underline">View all calls</Link>
        </div>

        {recent.length === 0 ? (
          <div className="p-6 text-sm text-gray-700">No calls found for this agent.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                  <th className="px-4 py-3 font-medium">Outcome</th>
                  <th className="px-4 py-3 font-medium text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recent.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{fmt(c.started_at ?? c.created_at)}</td>
                    <td className="px-4 py-3">{formatDuration(c.duration_seconds)}</td>
                    <td className="px-4 py-3">{money(c.cost_usd)}</td>
                    <td className="px-4 py-3 max-w-[140px] truncate sm:max-w-[220px] md:max-w-[360px]" title={c.outcome ?? ""}>
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${outcomeBadgeClass(c.outcome)}`}>
                        {c.outcome || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link className="hover:underline" href={`/dashboard/calls/${c.id}`}>View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
