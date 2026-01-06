import type { Insight } from "@/lib/analytics/types";

type InsightsPanelProps = {
  insights: Insight[];
  totalCalls: number;
  uniqueAgentCount: number;
  hasPreviousPeriodData: boolean;
};

function severityBadgeClass(severity: Insight["severity"]): string {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-800 border-red-200";
    case "warning":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "info":
      return "bg-blue-100 text-blue-800 border-blue-200";
  }
}

export function InsightsPanel({
  insights,
  totalCalls,
  uniqueAgentCount,
  hasPreviousPeriodData,
}: InsightsPanelProps) {
  if (insights.length === 0) {
    // Check if insufficient data conditions are met
    const hasInsufficientData =
      totalCalls < 50 || uniqueAgentCount < 2 || !hasPreviousPeriodData;

    return (
      <div className="rounded-xl border bg-white">
        <div className="border-b p-4">
          <p className="text-sm font-medium">Insights</p>
          <p className="text-xs text-muted-foreground">Automated analysis and recommendations</p>
        </div>
        <div className="p-10 text-center">
          {hasInsufficientData ? (
            <>
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                <svg
                  className="h-5 w-5 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium">Not enough data for insights yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Insights are generated once there is sufficient historical data or multiple agents
                to compare. Keep using your agents to unlock deeper insights.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">No insights</p>
              <p className="mt-1 text-sm text-muted-foreground">All metrics are within normal ranges.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b p-4">
        <p className="text-sm font-medium">Insights</p>
        <p className="text-xs text-muted-foreground">Automated analysis and recommendations</p>
      </div>

      <div className="divide-y divide-zinc-200">
        {insights.map((insight, idx) => (
          <div key={idx} className="p-4">
            <div className="flex items-start gap-3">
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${severityBadgeClass(
                  insight.severity
                )}`}
              >
                {insight.severity}
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">{insight.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{insight.description}</p>
                {insight.metric && insight.delta !== undefined && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {insight.metric}: {insight.delta > 0 ? "+" : ""}
                    {insight.delta.toFixed(1)}%
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

