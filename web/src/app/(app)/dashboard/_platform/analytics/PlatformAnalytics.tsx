import Link from "next/link";
import { CalendarDays, Download, Inbox, MessageSquareText, PiggyBank } from "lucide-react";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { getRangedAggregates, ANALYTICS_RANGES, type AnalyticsRange } from "@/lib/platform/readModel/aggregate";
import { getOutcomeCounts } from "@/lib/platform/readModel/outcomes";
import { getEstimatedSavings } from "@/lib/platform/readModel/savings";
import { getTicketsAnalytics } from "@/lib/analytics/tickets.queries";
import { isAdminOrOwner } from "@/lib/analytics/params";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isKnownChannel } from "@/lib/platform/channels";
import PageHeader from "../PageHeader";
import BarList, { type BarItem } from "../BarList";
import ChannelBadge from "../ChannelBadge";
import TrendChart from "../charts/TrendChart";
import HourlyChart from "../charts/HourlyChart";
import OutcomeDonut, { type OutcomeSlice } from "../charts/OutcomeDonut";
import { titleCase } from "../format";
import { Surface, SectionHeader, Pill } from "../ui";
import RequestsAnalytics from "./RequestsAnalytics";

/**
 * Analytics (rebuilt in Sprint 12 to legacy parity).
 *
 * The platform variant that replaced the legacy analytics was a functional regression: a fixed
 * 14-day window, four tiles and three bar lists, against a page that had ranges, period
 * comparison, per-agent tables, an hourly rhythm, request funnel and response-time analytics,
 * and CSV export for owners. Everything on that list is answerable here again, cross-channel.
 *
 * Honesty rules carried through unchanged: a bounded scan says so, and the period-over-period
 * delta is **suppressed** rather than estimated when the scan is bounded — a truncated scan
 * loses the oldest rows first, which is exactly the baseline a delta would divide by.
 */
export default async function PlatformAnalytics({
  range = 7,
  bare = false,
}: {
  range?: AnalyticsRange;
  /**
   * Body only — the Home shell owns the heading and the Today/Analytics tabs. The export action
   * still renders, because it is the one control on this view that is not a filter.
   */
  bare?: boolean;
}) {
  const orgId = await resolveActiveOrgId();

  const [agg, outcomes, savings, ticketAnalytics, canExport] = orgId
    ? await Promise.all([
        getRangedAggregates(orgId, { range }),
        getOutcomeCounts(orgId, range),
        getEstimatedSavings(orgId, range),
        getTicketsAnalytics(orgId, { range: rangeToLegacy(range) }).catch(() => null),
        currentUserCanExport(orgId),
      ])
    : [
        await getRangedAggregates("", { range }),
        { newContacts: null, requestsCreated: null, requestsResolved: null, appointmentsBooked: null, windowDays: range },
        null,
        null,
        false,
      ];

  const channelItems: BarItem[] = Object.entries(agg.byChannel)
    .sort((a, b) => b[1] - a[1])
    .map(([ch, n]) => ({ key: ch, value: n, label: isKnownChannel(ch) ? <ChannelBadge channel={ch} /> : ch }));

  const employeeItems: BarItem[] = agg.byEmployee.slice(0, 8).map((e) => ({
    key: e.employeeId,
    value: e.count,
    label: e.name,
  }));

  const intentItems: OutcomeSlice[] = Object.entries(agg.byIntent)
    .sort((a, b) => b[1] - a[1])
    .map(([intent, n]) => ({ key: intent, value: n, label: titleCase(intent) }));

  const delta = periodDelta(agg.total, agg.previousTotal, agg.comparisonBounded);
  const activeChannels = Object.keys(agg.byChannel).length;

  return (
    <div className={bare ? "" : "p-4 md:p-6"}>
      {bare ? null : (
        <PageHeader
          title="Analytics"
          subtitle="Cross-channel performance across your AI Employees."
          action={
            canExport ? (
              <a
                href={`/api/admin/analytics/export?range=${rangeToLegacy(range)}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
              >
                <Download className="h-4 w-4" /> Export CSV
              </a>
            ) : undefined
          }
        />
      )}

      {/* Range — the whole page reads from this one control, and it lives in the URL so a view
          can be shared or bookmarked. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-navy-800">
        <div className="flex flex-wrap items-center gap-1" aria-label="Analytics date range">
          {ANALYTICS_RANGES.map((r) => (
            <Link
              key={r}
              href={`/dashboard?tab=analytics&range=${r}`}
              aria-current={r === range ? "page" : undefined}
              className={`rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                r === range
                  ? "bg-navy-700 text-white shadow-sm dark:bg-white dark:text-navy-800"
                  : "text-gray-500 hover:bg-gray-50 hover:text-navy-700 dark:hover:bg-white/5 dark:hover:text-white"
              }`}
            >
              Last {r} days
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {agg.limited ? <Pill tone="neutral">Most recent {agg.total}+</Pill> : null}
          {canExport ? (
            <a
              href={`/api/admin/analytics/export?range=${rangeToLegacy(range)}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
            >
              <Download className="h-4 w-4" /> Export CSV
            </a>
          ) : null}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <AnalyticsMetric icon={MessageSquareText} label="Conversations" value={agg.limited ? `${agg.total}+` : agg.total} note={delta ?? `last ${range} days`} tone="brand" />
        <AnalyticsMetric icon={Inbox} label="Requests created" value={showOutcome(outcomes.requestsCreated)} note={`last ${range} days`} tone="sky" />
        <AnalyticsMetric icon={CalendarDays} label="Appointments" value={showOutcome(outcomes.appointmentsBooked)} note={`booked in last ${range} days`} tone="violet" />
        <AnalyticsMetric icon={PiggyBank} label="Est. savings" value={savings ? formatUsd(savings.usd) : "—"} note={savings ? `${Math.round(savings.minutes)} min handled` : "no call data"} tone="emerald" />
      </div>

      <section className="mb-6">
        <Surface>
          <div className="mb-1 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-navy-700 dark:text-white">Conversation volume</h2>
              <p className="mt-1 text-xs text-gray-400">Daily activity across the last {range} days</p>
            </div>
            {delta ? <Pill tone={delta.startsWith("-") ? "warn" : "ok"}>{delta}</Pill> : null}
          </div>
          <TrendChart labels={agg.byDay.map((d) => d.date.slice(5))} values={agg.byDay.map((d) => d.count)} height={300} />
        </Surface>
      </section>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Surface>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">By channel</p>
          <BarList items={channelItems} emptyLabel="No conversations in this range" />
        </Surface>
        <Surface>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">By employee</p>
          <BarList items={employeeItems} emptyLabel="No conversations in this range" />
        </Surface>
        <Surface>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">By outcome</p>
          {/* Shares of one whole, unlike the two rankings beside it — see OutcomeDonut. */}
          <OutcomeDonut items={intentItems} emptyLabel="No outcomes recorded" />
        </Surface>
      </div>

      <section className="mb-6">
        <SectionHeader title="Busiest hours" />
        <Surface>
          <HourlyChart values={agg.byHour} />
          <p className="mt-2 text-xs text-gray-400">
            Hour of day (UTC) across the last {range} days · {activeChannels} channel
            {activeChannels === 1 ? "" : "s"} active
          </p>
        </Surface>
      </section>

      {/* Request operations — purpose-built for this dashboard instead of the legacy 90-row list. */}
      {ticketAnalytics ? (
        <section>
          <SectionHeader title="Requests" />
          <RequestsAnalytics data={ticketAnalytics} range={rangeToLegacy(range)} />
        </section>
      ) : null}
    </div>
  );
}

function AnalyticsMetric({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  note: string;
  tone: "brand" | "sky" | "violet" | "emerald";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300",
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
  };
  return (
    <Surface className="min-h-36 transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-navy-700 dark:text-white">{value}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs text-gray-400">{note}</p>
    </Surface>
  );
}

function showOutcome(value: number | null): string {
  return value === null ? "—" : value.toLocaleString();
}

/** Our ranges are numbers; the legacy query layer and export route speak "7d" | "30d" | "90d". */
function rangeToLegacy(range: AnalyticsRange): "7d" | "30d" | "90d" {
  return `${range}d` as "7d" | "30d" | "90d";
}

/**
 * Period-over-period movement, or null when it cannot be stated honestly — a bounded scan
 * under-counts the previous period, and there is no baseline to compare a first period against.
 */
export function periodDelta(current: number, previous: number, bounded: boolean): string | null {
  if (bounded || previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "same as previous period";
  return `${pct > 0 ? "+" : ""}${pct}% vs previous period`;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Export is owner/admin only — same rule the legacy page applied. */
async function currentUserCanExport(orgId: string): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    const userId = data?.user?.id;
    return userId ? await isAdminOrOwner(orgId, userId) : false;
  } catch {
    return false;
  }
}
