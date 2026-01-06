import { formatUSD, formatDuration } from "@/lib/analytics/format";
import type { AnalyticsSummary } from "@/lib/analytics/types";

type KpiGridProps = {
  summary: AnalyticsSummary;
};

export function KpiGrid({ summary }: KpiGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
      <div className="rounded-xl border bg-white p-4 lg:col-span-2">
        <p className="text-sm text-muted-foreground">Total calls</p>
        <p className="mt-1 text-2xl font-semibold">{summary.totalCalls}</p>
        <p className="mt-1 text-xs text-muted-foreground">In selected range</p>
      </div>

      <div className="rounded-xl border bg-white p-4 lg:col-span-2">
        <p className="text-sm text-muted-foreground">Total cost</p>
        <p className="mt-1 text-2xl font-semibold">{formatUSD(summary.totalCost)}</p>
        <p className="mt-1 text-xs text-muted-foreground">Estimated (calls.cost_usd)</p>
      </div>

      <div className="rounded-xl border bg-white p-4 lg:col-span-2">
        <p className="text-sm text-muted-foreground">Avg duration</p>
        <p className="mt-1 text-2xl font-semibold">{formatDuration(summary.avgDuration)}</p>
        <p className="mt-1 text-xs text-muted-foreground">Across calls</p>
      </div>

      <div className="rounded-xl border bg-white p-4 lg:col-span-2">
        <p className="text-sm text-muted-foreground">Appointments created</p>
        <p className="mt-1 text-2xl font-semibold">{summary.appointmentsCount}</p>
        <p className="mt-1 text-xs text-muted-foreground">In selected range</p>
      </div>

      <div className="rounded-xl border bg-white p-4 lg:col-span-2">
        <p className="text-sm text-muted-foreground">Leads created</p>
        <p className="mt-1 text-2xl font-semibold">{summary.leadsCount}</p>
        <p className="mt-1 text-xs text-muted-foreground">In selected range</p>
      </div>

      <div className="rounded-xl border bg-white p-4 lg:col-span-2">
        <p className="text-sm text-muted-foreground">Tickets created</p>
        <p className="mt-1 text-2xl font-semibold">{summary.ticketsCount}</p>
        <p className="mt-1 text-xs text-muted-foreground">In selected range</p>
      </div>

      <div className="rounded-xl border bg-white p-4 lg:col-span-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Estimated Savings</p>
            <p className="mt-1 text-2xl font-semibold text-green-600">
              +{formatUSD(summary.estimatedSavings)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">vs human agents</p>
          </div>
          <div
            className="group relative ml-2 cursor-help"
            title="Estimated based on $25/hour average human agent cost."
          >
            <svg
              className="h-4 w-4 text-muted-foreground"
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
        </div>
      </div>
    </div>
  );
}

