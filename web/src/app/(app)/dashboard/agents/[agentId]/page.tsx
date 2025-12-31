export const runtime = "nodejs";
import { headers } from "next/headers";

type KPIResponse = {
  ok: boolean;
  kpi: {
    total_calls: number;
    total_minutes: number;
    total_cost_usd: number;
    avg_duration_seconds: number;
  };
};

async function getAgentKPI(agentId: string) {
  const user = process.env.ADMIN_USER!;
  const pass = process.env.ADMIN_PASS!;
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");

    const res = await fetch(
      `/api/admin/agents/${agentId}/kpi?days=7`,

    {
      headers: {
        Authorization: `Basic ${auth}`,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error("Failed to load KPI");
  }

  return (await res.json()) as KPIResponse;
}

export default async function Page({
  params,
}: {
  params: { agentId: string };
}) {
  const data = await getAgentKPI(params.agentId);
  const kpi = data.kpi;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Agent KPI</h1>

      <div className="grid grid-cols-2 gap-4">
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
            {kpi.avg_duration_seconds}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Cost (USD)</div>
          <div className="text-2xl font-bold">${kpi.total_cost_usd}</div>
        </div>
      </div>
    </div>
  );
}
