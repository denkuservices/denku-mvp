export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabase/admin";


async function getAgentKPI(agentId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const { data, error } = await supabaseAdmin
    .from("calls")
    .select("duration_seconds, cost_usd")
    .eq("agent_id", agentId)
    .gte("created_at", since.toISOString());

  if (error) throw error;

  const total_calls = data.length;
  const total_minutes =
    data.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / 60;
  const total_cost_usd =
    data.reduce((s, c) => s + Number(c.cost_usd ?? 0), 0);
  const avg_duration_seconds =
    total_calls > 0
      ? Math.round(
          data.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) /
            total_calls
        )
      : 0;

  return {
    total_calls,
    total_minutes: Number(total_minutes.toFixed(2)),
    total_cost_usd: Number(total_cost_usd.toFixed(4)),
    avg_duration_seconds,
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;   // ✅
  const kpi = await getAgentKPI(agentId);


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
          <div className="text-sm text-muted-foreground">
            Avg Duration (sec)
          </div>
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
