export const runtime = "nodejs";

type KPIResponse = {
  ok: boolean;
  kpi: {
    total_calls: number;
    total_minutes: number;
    total_cost_usd: number;
    avg_duration_seconds: number;
  };
};

type CallRow = {
  id: string;
  started_at: string | null;
  duration_seconds: number | null;
  cost_usd: number | null;
  outcome: string | null;
};

function formatRelative(iso: string | null) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";

  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - t) / 1000));

  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function outcomeMeta(outcome: string | null) {
  const o = (outcome || "").toLowerCase();

  if (o === "end-of-call-report") {
    return { label: "Completed", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  }
  if (o === "ended") {
    return { label: "Ended", cls: "bg-zinc-100 text-zinc-800 border-zinc-200" };
  }
  if (!o) {
    return { label: "—", cls: "bg-zinc-100 text-zinc-600 border-zinc-200" };
  }

  return { label: "Event", cls: "bg-blue-100 text-blue-800 border-blue-200" };
}

async function getAgentKPI(agentId: string): Promise<KPIResponse> {
  const user = process.env.ADMIN_USER!;
  const pass = process.env.ADMIN_PASS!;
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL}/api/admin/agents/${agentId}/kpi?days=7`,
    {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    }
  );

  if (!res.ok) throw new Error("Failed to load KPI");
  return res.json();
}

async function getLastCalls(agentId: string): Promise<CallRow[]> {
  const user = process.env.ADMIN_USER!;
  const pass = process.env.ADMIN_PASS!;
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL}/api/admin/agents/${agentId}/calls?limit=10`,
    {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    }
  );

  if (!res.ok) throw new Error("Failed to load calls");

  const json = await res.json();
  return json.data ?? [];
}

export default async function Page({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;

  const kpiRes = await getAgentKPI(agentId);
  const calls = await getLastCalls(agentId);
  const kpi = kpiRes.kpi;

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Agent Detail</h1>

      {/* KPI GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Total Calls</div>
          <div className="text-2xl font-bold">{kpi.total_calls}</div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Total Minutes</div>
          <div className="text-2xl font-bold">{kpi.total_minutes}</div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Avg Duration (sec)</div>
          <div className="text-2xl font-bold">
            {Math.round(kpi.avg_duration_seconds)}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Cost (USD)</div>
          <div className="text-2xl font-bold">
            ${kpi.total_cost_usd.toFixed(4)}
          </div>
        </div>
      </div>

      {/* CALL LIST */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Calls</h2>

        {calls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No calls yet.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">Started</th>
                  <th className="p-2 text-left">Duration (sec)</th>
                  <th className="p-2 text-left">Cost ($)</th>
                  <th className="p-2 text-left">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => {
                  const meta = outcomeMeta(c.outcome);
                  return (
                    <tr key={c.id} className="border-t">
                      <td className="p-2">
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {formatRelative(c.started_at)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {c.started_at ? new Date(c.started_at).toLocaleString() : "—"}
                          </span>
                        </div>
                      </td>

                      <td className="p-2">{c.duration_seconds ?? "—"}</td>

                      <td className="p-2">
                        {c.cost_usd != null ? `$${Number(c.cost_usd).toFixed(4)}` : "—"}
                      </td>

                      <td className="p-2">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-md border text-xs font-medium ${meta.cls}`}
                          title={c.outcome ?? ""}
                        >
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
