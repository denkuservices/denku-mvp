import Link from "next/link";
import { Download } from "lucide-react";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { getRangedAggregates, getArtifactCounts, ANALYTICS_RANGES, type AnalyticsRange } from "@/lib/platform/readModel/aggregate";
import { getEstimatedSavings } from "@/lib/platform/readModel/savings";
import { getTicketsAnalytics } from "@/lib/analytics/tickets.queries";
import { isAdminOrOwner } from "@/lib/analytics/params";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TicketsAnalytics } from "@/components/analytics/TicketsAnalytics";
import { isKnownChannel } from "@/lib/platform/channels";
import PageHeader from "../PageHeader";
import BarList, { type BarItem } from "../BarList";
import ChannelBadge from "../ChannelBadge";
import TrendChart from "../charts/TrendChart";
import HourlyChart from "../charts/HourlyChart";
import { titleCase } from "../format";
import { Surface, SectionHeader, StatCard, Pill } from "../ui";

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
export default async function PlatformAnalytics({ range = 7 }: { range?: AnalyticsRange }) {
  const orgId = await resolveActiveOrgId();

  const [agg, artifacts, savings, ticketAnalytics, canExport] = orgId
    ? await Promise.all([
        getRangedAggregates(orgId, { range }),
        getArtifactCounts(orgId),
        getEstimatedSavings(orgId, range),
        getTicketsAnalytics(orgId, { range: rangeToLegacy(range) }).catch(() => null),
        currentUserCanExport(orgId),
      ])
    : [
        await getRangedAggregates("", { range }),
        { tickets: 0, appointments: 0, openTickets: 0, upcomingAppointments: 0 },
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

  const intentItems: BarItem[] = Object.entries(agg.byIntent)
    .sort((a, b) => b[1] - a[1])
    .map(([intent, n]) => ({ key: intent, value: n, label: titleCase(intent) }));

  const delta = periodDelta(agg.total, agg.previousTotal, agg.comparisonBounded);
  const activeChannels = Object.keys(agg.byChannel).length;

  return (
    <div className="p-4 md:p-6">
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

      {/* Range — the whole page reads from this one control, and it lives in the URL so a view
          can be shared or bookmarked. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {ANALYTICS_RANGES.map((r) => (
          <Link
            key={r}
            href={`/dashboard/analytics?range=${r}`}
            aria-current={r === range ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              r === range
                ? "bg-brand-500 text-white"
                : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-navy-800 dark:text-gray-200"
            }`}
          >
            Last {r} days
          </Link>
        ))}
        {agg.limited ? (
          <Pill tone="neutral">
            Most recent {agg.total}+ — older conversations are outside this scan
          </Pill>
        ) : null}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Conversations"
          value={agg.limited ? `${agg.total}+` : agg.total}
          note={delta ?? `last ${range} days`}
        />
        <StatCard label="Requests created" value={artifacts.tickets} note="all time" />
        <StatCard label="Appointments" value={artifacts.appointments} note="all time" />
        <StatCard
          label="Est. savings"
          value={savings ? formatUsd(savings.usd) : "—"}
          note={savings ? `estimate · ${Math.round(savings.minutes)} min handled` : "no call data"}
        />
      </div>

      <section className="mb-6">
        <SectionHeader title={`Conversations · last ${range} days`} />
        <Surface>
          <TrendChart labels={agg.byDay.map((d) => d.date.slice(5))} values={agg.byDay.map((d) => d.count)} />
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
          <BarList items={intentItems} emptyLabel="No outcomes recorded" />
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

      {/* Request funnel + response times — the legacy ticket analytics, reused as-is. */}
      {ticketAnalytics ? (
        <section>
          <SectionHeader title="Requests" />
          <TicketsAnalytics data={ticketAnalytics} range={rangeToLegacy(range)} />
        </section>
      ) : null}
    </div>
  );
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
