type Outcome = "completed" | "no_answer" | "failed" | "voicemail";

type DayPoint = {
  day: string; // e.g. "Mon"
  calls: number;
  cost_usd: number;
};

function formatUSD(value: number) {
  return `$${value.toFixed(4)}`;
}

function pct(n: number, d: number) {
  if (d <= 0) return 0;
  return Math.round((n / d) * 100);
}

function getMockAnalytics() {
  // 7-day window mock
  const series: DayPoint[] = [
    { day: "Mon", calls: 12, cost_usd: 0.1842 },
    { day: "Tue", calls: 18, cost_usd: 0.2635 },
    { day: "Wed", calls: 9, cost_usd: 0.1219 },
    { day: "Thu", calls: 21, cost_usd: 0.3128 },
    { day: "Fri", calls: 16, cost_usd: 0.2411 },
    { day: "Sat", calls: 7, cost_usd: 0.0893 },
    { day: "Sun", calls: 11, cost_usd: 0.1557 },
  ];

  const outcomes: Record<Outcome, number> = {
    completed: 68,
    no_answer: 19,
    failed: 6,
    voicemail: 7,
  };

  const totalCalls = series.reduce((sum, d) => sum + d.calls, 0);
  const totalCost = series.reduce((sum, d) => sum + d.cost_usd, 0);

  // Simple derived metrics
  const completed = outcomes.completed;
  const completionRate = pct(completed, completed + outcomes.no_answer + outcomes.failed + outcomes.voicemail);
  const avgCostPerCall = totalCalls === 0 ? 0 : totalCost / totalCalls;

  return { series, outcomes, totalCalls, totalCost, completionRate, avgCostPerCall };
}

function outcomeLabel(o: Outcome) {
  switch (o) {
    case "completed":
      return "Completed";
    case "no_answer":
      return "No answer";
    case "failed":
      return "Failed";
    case "voicemail":
      return "Voicemail";
  }
}

export default function Page() {
  const data = getMockAnalytics();

  const maxCalls = Math.max(...data.series.map((d) => d.calls), 1);
  const totalOutcomes = Object.values(data.outcomes).reduce((a, b) => a + b, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          High-level performance metrics across calls, cost, and outcomes.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Calls (7d)</p>
          <p className="mt-1 text-2xl font-semibold">{data.totalCalls}</p>
          <p className="mt-1 text-xs text-muted-foreground">All agents</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Cost (7d)</p>
          <p className="mt-1 text-2xl font-semibold">{formatUSD(data.totalCost)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Estimated</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Completion rate</p>
          <p className="mt-1 text-2xl font-semibold">{data.completionRate}%</p>
          <p className="mt-1 text-xs text-muted-foreground">Completed / total outcomes</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Avg cost / call</p>
          <p className="mt-1 text-2xl font-semibold">{formatUSD(data.avgCostPerCall)}</p>
          <p className="mt-1 text-xs text-muted-foreground">7-day window</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Calls over time (simple bars) */}
        <div className="rounded-xl border bg-white lg:col-span-2">
          <div className="border-b p-4">
            <p className="text-sm font-medium">Calls over time</p>
            <p className="text-xs text-muted-foreground">Last 7 days</p>
          </div>

          <div className="p-4 space-y-3">
            {data.series.map((d) => {
              const w = Math.round((d.calls / maxCalls) * 100);
              return (
                <div key={d.day} className="grid grid-cols-12 items-center gap-3">
                  <div className="col-span-2 text-xs text-muted-foreground">{d.day}</div>
                  <div className="col-span-8">
                    <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                      <div className="h-2 bg-zinc-900" style={{ width: `${w}%` }} />
                    </div>
                  </div>
                  <div className="col-span-2 text-right text-xs text-muted-foreground">
                    {d.calls} calls
                  </div>
                </div>
              );
            })}
            <div className="pt-2 text-xs text-muted-foreground">
              Note: Bar chart is a lightweight UI stub. Replace with a real chart library later if needed.
            </div>
          </div>
        </div>

        {/* Outcome distribution */}
        <div className="rounded-xl border bg-white">
          <div className="border-b p-4">
            <p className="text-sm font-medium">Outcome distribution</p>
            <p className="text-xs text-muted-foreground">Share of outcomes</p>
          </div>

          <div className="p-4 space-y-3">
            {(Object.keys(data.outcomes) as Outcome[]).map((k) => {
              const n = data.outcomes[k];
              const w = Math.round((n / Math.max(totalOutcomes, 1)) * 100);
              return (
                <div key={k} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm">{outcomeLabel(k)}</p>
                    <p className="text-xs text-muted-foreground">
                      {n} ({w}%)
                    </p>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                    <div className="h-2 bg-zinc-900" style={{ width: `${w}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cost table */}
      <div className="rounded-xl border bg-white">
        <div className="border-b p-4">
          <p className="text-sm font-medium">Cost detail</p>
          <p className="text-xs text-muted-foreground">Daily cost breakdown</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-3 font-medium">Day</th>
                <th className="px-4 py-3 font-medium">Calls</th>
                <th className="px-4 py-3 font-medium">Cost</th>
                <th className="px-4 py-3 font-medium">Avg cost/call</th>
              </tr>
            </thead>
            <tbody>
              {data.series.map((d) => (
                <tr key={d.day} className="border-b last:border-b-0">
                  <td className="px-4 py-3">{d.day}</td>
                  <td className="px-4 py-3 text-muted-foreground">{d.calls}</td>
                  <td className="px-4 py-3">{formatUSD(d.cost_usd)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatUSD(d.calls === 0 ? 0 : d.cost_usd / d.calls)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 text-xs text-muted-foreground">
          Note: This page is using mock data. Next step: back this with Supabase aggregates (7d) and optional agent filter.
        </div>
      </div>
    </div>
  );
}
