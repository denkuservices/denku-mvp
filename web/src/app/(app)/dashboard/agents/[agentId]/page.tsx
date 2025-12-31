import Link from "next/link";

export const dynamic = "error";

type KPIResponse = {
  days: number;
  total_calls?: number;
  total_cost_usd?: number;
  avg_duration_sec?: number;
  success_rate?: number;
};

type CallRow = {
  id?: string;
  vapi_call_id?: string;
  started_at?: string | null;
  duration_sec?: number | null;
  cost_usd?: number | null;
  outcome?: string | null;
  status?: string | null;
};

function toBasicAuthHeader() {
  const user = process.env.ADMIN_USER ?? "";
  const pass = process.env.ADMIN_PASS ?? "";
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return `Basic ${token}`;
}

async function adminGetJSON<T>(path: string): Promise<T> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
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

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatMoney(n?: number | null) {
  if (n === null || n === undefined) return "—";
  return `$${n.toFixed(4)}`;
}

export default async function AgentDetailPage({
  params,
}: {
  params: { agentId: string };
}) {
  const { agentId } = params;

let kpi: KPIResponse = {
  days: 7,
  total_calls: 0,
  total_cost_usd: 0,
  avg_duration_sec: 0,
  success_rate: 0,
};

let calls: CallRow[] = [];

try {
  calls = await adminGetJSON<CallRow[]>(
    `/api/admin/agents/${agentId}/calls?limit=10`
  );
} catch (e) {
  console.error("calls fetch failed", e);
}

try {
  kpi = await adminGetJSON<KPIResponse>(
    `/api/admin/agents/${agentId}/kpi?days=7`
  );
} catch (e) {
  console.error("kpi fetch failed, fallback to empty KPI", e);
}


  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Link href="/dashboard" className="hover:underline">
              Dashboard
            </Link>
            <span>/</span>
            <Link href="/dashboard/agents" className="hover:underline">
              Agents
            </Link>
            <span>/</span>
            <span className="text-gray-900">{agentId}</span>
          </div>

          <h1 className="mt-2 text-xl font-semibold">Agent Detail</h1>
          <p className="mt-1 text-sm text-gray-600">
            KPI snapshot and recent calls for this agent.
          </p>
        </div>

        <Link
          href="/dashboard/agents"
          className="rounded-md border bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          Back to Agents
        </Link>
      </div>

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border bg-white p-4">
          <div className="text-xs text-gray-600">Calls (last {kpi.days}d)</div>
          <div className="mt-1 text-lg font-semibold">{kpi.total_calls ?? 0}</div>
        </div>

        <div className="rounded-md border bg-white p-4">
          <div className="text-xs text-gray-600">Total Cost</div>
          <div className="mt-1 text-lg font-semibold">
            {kpi.total_cost_usd !== undefined ? `$${kpi.total_cost_usd.toFixed(4)}` : "—"}
          </div>
        </div>

        <div className="rounded-md border bg-white p-4">
          <div className="text-xs text-gray-600">Avg Duration</div>
          <div className="mt-1 text-lg font-semibold">
            {kpi.avg_duration_sec !== undefined ? `${Math.round(kpi.avg_duration_sec)}s` : "—"}
          </div>
        </div>

        <div className="rounded-md border bg-white p-4">
          <div className="text-xs text-gray-600">Success Rate</div>
          <div className="mt-1 text-lg font-semibold">
            {kpi.success_rate !== undefined ? `${Math.round(kpi.success_rate * 100)}%` : "—"}
          </div>
        </div>
      </div>

      {/* Recent Calls */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent Calls</h2>
          <span className="text-xs text-gray-500">Click a row to open call detail</span>
        </div>

        <div className="overflow-hidden rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Cost</th>
                {/* Mobil fix: Outcome sütunu mobilde gizli */}
                <th className="hidden px-4 py-3 sm:table-cell">Outcome</th>
                <th className="px-4 py-3 text-right">Open</th>
              </tr>
            </thead>

            <tbody>
              {calls.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-4 text-sm text-gray-700" colSpan={5}>
                    No recent calls.
                  </td>
                </tr>
              ) : (
                calls.map((c, idx) => {
                  const callId = c.id; // dashboard route uuid bekliyor varsayımı
                  const href = callId ? `/dashboard/calls/${callId}` : undefined;

                  const RowInner = (
                    <>
                      <td className="px-4 py-3 text-gray-800">{formatDate(c.started_at)}</td>
                      <td className="px-4 py-3 text-gray-800">
                        {c.duration_sec !== null && c.duration_sec !== undefined
                          ? `${c.duration_sec}s`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-800">{formatMoney(c.cost_usd)}</td>

                      {/* Mobil fix: sütun gizli + içerik truncate */}
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <span className="inline-flex max-w-[180px] items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                          <span className="truncate">
                            {c.outcome ?? c.status ?? "—"}
                          </span>
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        {href ? (
                          <span className="rounded-md px-2 py-1 text-sm text-gray-700 hover:bg-gray-100">
                            View
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </>
                  );

                  return href ? (
                    <tr key={callId ?? idx} className="border-t hover:bg-gray-50">
                      <td colSpan={5} className="p-0">
                        <Link
                          href={href}
                          className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center"
                        >
                          <div className="contents">{RowInner}</div>
                        </Link>
                      </td>
                    </tr>
                  ) : (
                    <tr key={c.vapi_call_id ?? idx} className="border-t">
                      {RowInner}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobilde Outcome gizli olduğu için küçük bir hint */}
        <div className="mt-2 text-xs text-gray-500 sm:hidden">
          Outcome column is hidden on mobile to avoid overflow.
        </div>
      </div>
    </div>
  );
}
