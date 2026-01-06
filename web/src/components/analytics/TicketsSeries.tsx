import type { TicketsAnalyticsSeries } from "@/lib/analytics/tickets.types";

interface TicketsSeriesProps {
  series: TicketsAnalyticsSeries;
  range: "24h" | "7d" | "30d" | "90d";
}

export function TicketsSeries({ series, range }: TicketsSeriesProps) {
  const formatNumber = (n: number) => n.toLocaleString();
  const isHourly = range === "24h";

  // Format date for display
  const formatDate = (ts: string) => {
    if (isHourly) {
      const d = new Date(ts);
      return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" });
    }
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const maxCount = Math.max(...series.createdOverTime.map((d) => d.count), 1);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Created Over Time */}
      <div className="rounded-xl border bg-white p-6">
        <p className="text-sm font-medium mb-4">Tickets Created Over Time</p>
        <div className="space-y-2">
          {series.createdOverTime.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data</p>
          ) : (
            series.createdOverTime.map((item) => (
              <div key={item.ts} className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground w-24 flex-shrink-0">
                  {formatDate(item.ts)}
                </p>
                <div className="flex-1 h-6 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-zinc-900 rounded-full"
                    style={{ width: `${(item.count / maxCount) * 100}%` }}
                  />
                </div>
                <p className="text-xs font-medium w-12 text-right">{formatNumber(item.count)}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Priority Breakdown */}
      <div className="rounded-xl border bg-white p-6">
        <p className="text-sm font-medium mb-4">Priority Breakdown</p>
        <div className="space-y-3">
          {series.priorityBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data</p>
          ) : (
            series.priorityBreakdown.map((item) => {
              const priorityLabel =
                item.priority === "unassigned"
                  ? "Unassigned"
                  : item.priority.charAt(0).toUpperCase() + item.priority.slice(1);
              const maxPriorityCount = Math.max(...series.priorityBreakdown.map((p) => p.count), 1);
              return (
                <div key={item.priority}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">{priorityLabel}</p>
                    <p className="text-sm text-muted-foreground">{formatNumber(item.count)}</p>
                  </div>
                  <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-zinc-900 rounded-full"
                      style={{ width: `${(item.count / maxPriorityCount) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

