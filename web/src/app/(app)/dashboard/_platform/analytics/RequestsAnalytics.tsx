import { Activity, AlertTriangle, CheckCircle2, CircleDot, Inbox, Timer } from "lucide-react";
import type { TicketsAnalyticsResult, TicketsAnalyticsRange } from "@/lib/analytics/tickets.types";
import { formatDuration } from "@/lib/analytics/tickets.utils";
import TrendChart from "../charts/TrendChart";
import { Pill, Surface } from "../ui";

const RANGE_LABELS: Record<TicketsAnalyticsRange, string> = {
  "24h": "last 24 hours",
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
};

export default function RequestsAnalytics({
  data,
  range,
}: {
  data: TicketsAnalyticsResult;
  range: TicketsAnalyticsRange;
}) {
  const rangeLabel = RANGE_LABELS[range];
  const responseAvailable = Object.values(data.responseTimes).some((value) => value !== null);
  const maxPriority = Math.max(...data.series.priorityBreakdown.map((item) => item.count), 1);
  const closedRate = data.funnel.created > 0 ? data.funnel.closed / data.funnel.created : 0;

  const metrics = [
    {
      label: "Created",
      value: data.kpis.createdCount,
      note: rangeLabel,
      icon: Inbox,
      tone: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300",
    },
    {
      label: "Closed",
      value: data.kpis.closedCount,
      note: `${Math.round(closedRate * 100)}% of created`,
      icon: CheckCircle2,
      tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
    },
    {
      label: "Open now",
      value: data.kpis.openNowCount,
      note: "current workload",
      icon: CircleDot,
      tone: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300",
    },
    {
      label: "SLA breaches",
      value: data.kpis.slaBreachedCount,
      note: `${Math.round(data.kpis.slaBreachedRate * 100)}% of created`,
      icon: AlertTriangle,
      tone: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Surface key={metric.label} className="min-h-32 transition hover:-translate-y-0.5 hover:shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-500">{metric.label}</p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums text-navy-700 dark:text-white">
                    {metric.value.toLocaleString()}
                  </p>
                </div>
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${metric.tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-2 text-xs text-gray-400">{metric.note}</p>
            </Surface>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <Surface>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-navy-700 dark:text-white">Request flow</p>
              <p className="mt-1 text-xs text-gray-400">How created requests move toward resolution</p>
            </div>
            <Pill tone={closedRate >= 0.5 ? "ok" : "neutral"}>{Math.round(closedRate * 100)}% resolved</Pill>
          </div>
          <div className="space-y-5">
            <FlowStep label="Created" value={data.funnel.created} percent={100} color="bg-brand-500" />
            <FlowStep
              label="Reached in progress"
              value={data.funnel.inProgress}
              percent={data.funnel.createdToInProgressRate * 100}
              color="bg-sky-500"
            />
            <FlowStep label="Closed" value={data.funnel.closed} percent={closedRate * 100} color="bg-emerald-500" />
          </div>
        </Surface>

        <Surface>
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
              <Timer className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-semibold text-navy-700 dark:text-white">Resolution health</p>
              <p className="mt-1 text-xs text-gray-400">Median and slower-tail service times</p>
            </div>
          </div>
          {responseAvailable ? (
            <div className="grid grid-cols-2 gap-3">
              <TimingMetric label="First response · median" value={data.responseTimes.firstResponseMedianSec} />
              <TimingMetric label="First response · P90" value={data.responseTimes.firstResponseP90Sec} />
              <TimingMetric label="Time to close · median" value={data.responseTimes.timeToCloseMedianSec} />
              <TimingMetric label="Time to close · P90" value={data.responseTimes.timeToCloseP90Sec} />
            </div>
          ) : (
            <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl bg-gray-50 px-5 text-center dark:bg-white/5">
              <Activity className="h-6 w-6 text-gray-300" />
              <p className="mt-2 text-sm font-medium text-navy-700 dark:text-white">Not enough activity yet</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-gray-400">
                Response benchmarks appear once requests receive staff activity and reach resolution.
              </p>
            </div>
          )}
        </Surface>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.65fr_.85fr]">
        <Surface>
          <div className="mb-1 flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-navy-700 dark:text-white">Requests created</p>
              <p className="mt-1 text-xs text-gray-400">
                {range === "90d" ? "Grouped by week for a readable 90-day view" : `Volume across the ${rangeLabel}`}
              </p>
            </div>
          </div>
          <TrendChart
            labels={data.series.createdOverTime.map((item) => formatSeriesLabel(item.ts, range))}
            values={data.series.createdOverTime.map((item) => item.count)}
            label="Requests"
            height={260}
          />
        </Surface>

        <Surface>
          <p className="text-base font-semibold text-navy-700 dark:text-white">Priority mix</p>
          <p className="mt-1 text-xs text-gray-400">Created during the selected period</p>
          <div className="mt-6 space-y-5">
            {data.series.priorityBreakdown.length > 0 ? (
              data.series.priorityBreakdown.map((item) => (
                <div key={item.priority}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium capitalize text-navy-700 dark:text-white">{item.priority}</span>
                    <span className="tabular-nums text-gray-500">{item.count.toLocaleString()}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                    <div
                      className={`h-full rounded-full ${priorityColor(item.priority)}`}
                      style={{ width: `${Math.max((item.count / maxPriority) * 100, 4)}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-400 dark:bg-white/5">
                No priority data in this period.
              </p>
            )}
          </div>
        </Surface>
      </div>
    </div>
  );
}

function FlowStep({ label, value, percent, color }: { label: string; value: number; percent: number; color: string }) {
  const width = value > 0 ? Math.max(Math.min(percent, 100), 4) : 0;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-navy-700 dark:text-white">{label}</span>
        <span className="text-sm tabular-nums text-gray-500">
          {value.toLocaleString()} <span className="text-xs text-gray-400">· {Math.round(percent)}%</span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function TimingMetric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-2xl border border-gray-100 p-3 dark:border-white/10">
      <p className="text-[11px] leading-4 text-gray-400">{label}</p>
      <p className="mt-2 text-lg font-semibold tabular-nums text-navy-700 dark:text-white">{formatDuration(value)}</p>
    </div>
  );
}

function formatSeriesLabel(ts: string, range: TicketsAnalyticsRange): string {
  const date = new Date(ts.length === 10 ? `${ts}T00:00:00Z` : ts);
  return range === "24h"
    ? date.toLocaleTimeString("en-US", { hour: "numeric", timeZone: "UTC" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function priorityColor(priority: string): string {
  if (priority === "urgent") return "bg-red-500";
  if (priority === "high") return "bg-amber-500";
  if (priority === "medium" || priority === "normal") return "bg-sky-500";
  if (priority === "low") return "bg-emerald-500";
  return "bg-gray-400";
}
