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

type CallsResponse = {
  ok: boolean;
  data: Array<{
    id: string;
    started_at: string | null;
    duration_seconds: number | null;
    cost_usd: number | null;
    outcome: string | null;
  }>;
};

function getBaseUrl() {
  // Prod: NEXT_PUBLIC_SITE_URL = https://denku-mvp.vercel.app
  // Fallback: Vercel provides VERCEL_URL without protocol
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

function getAdminAuthHeader() {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;
  if (!user || !pass) throw new Error("Missing ADMIN_USER / ADMIN_PASS env.");
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  return { Authorization: `Basic ${auth}` };
}

function formatOutcome(outcome?: string | null) {
  if (!outcome) return "—";
  if (outcome === "end-of-call-report") return "Completed";
  if (outcome === "ended") return "Ended";
  return outcome;
}

function outcomeClass(outcome?: string | null) {
  if (outcome === "end-of-call-report") return "bg-green-100 text-green-800";
  if (outcome === "ended") return "bg-gray-100 text-gray-800";
  return "bg-yellow-100 text-yellow-800";
}

async function getAgentKPI(agentId: string): Promise<KPIResponse> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/admin/agents/${agentId}/kpi?days=7`, {
    headers: { ...getAdminAuthHeader() },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load KPI (${res.status})`);
  return res.json();
}

async function getLastCalls(agentId: string) {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/admin/agents/${agentId}/calls?limit=10`, {
    headers: { ...getAdminAuthHeader() },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load calls (${res.status})`);
  const json = (await res.json()) as CallsResponse;
  return json.data ?? [];
}

export default async function Page({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;

  const [kpiRes, calls] = await Promise.all([getAgentKPI(agentId), getLastCalls(agentId)]);
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
          <div className="text-2xl font-bold">{`${kpi.total_minutes.toFixed(2)} min`}</div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Avg Duration (sec)</div>
          <div className="text-2xl font-bold">{Math.round(kpi.avg_duration_seconds)}</div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Cost (USD)</div>
          <div className="text-2xl font-bold">${kpi.total_cost_usd.toFixed(4)}</div>
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
                {calls.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2">
                      {c.started_at ? new Date(c.started_at).toLocaleString() : "—"}
                    </td>
                    <td className="p-2">{c.duration_seconds ?? "—"}</td>
                    <td className="p-2">
                      {c.cost_usd != null ? `$${Number(c.cost_usd).toFixed(4)}` : "—"}
                    </td>
                    <td className="p-2">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${outcomeClass(c.outcome)}`}>
                        {formatOutcome(c.outcome)}
                      </span>
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
