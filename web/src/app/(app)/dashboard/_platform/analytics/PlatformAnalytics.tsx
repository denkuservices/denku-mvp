import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { getConversationAggregates, getArtifactCounts } from "@/lib/platform/readModel/aggregate";
import { isKnownChannel, channelMeta } from "@/lib/platform/channels";
import PageHeader from "../PageHeader";
import BarList, { type BarItem } from "../BarList";
import ChannelBadge from "../ChannelBadge";
import { titleCase } from "../format";

/**
 * Platform Analytics (Sprint 5.5) — cross-channel, over the Q0 aggregation read model.
 * Rendered by the analytics route only when PLATFORM_UX_ENABLED (legacy analytics otherwise).
 * R-018 honesty: when the aggregation window is bounded, it says "recent N", never implying a
 * counted all-time total.
 */
export default async function PlatformAnalytics() {
  const orgId = await resolveActiveOrgId();
  const agg = orgId
    ? await getConversationAggregates(orgId, { windowDays: 14, limit: 500 })
    : { total: 0, byChannel: {}, byEmployee: [], byDay: [], byIntent: {}, limited: false, windowDays: 14 };
  const artifacts = orgId ? await getArtifactCounts(orgId) : { tickets: 0, appointments: 0 };

  const channelItems: BarItem[] = Object.entries(agg.byChannel)
    .sort((a, b) => b[1] - a[1])
    .map(([ch, n]) => ({
      key: ch,
      value: n,
      label: isKnownChannel(ch) ? <ChannelBadge channel={ch} /> : ch,
    }));

  const employeeItems: BarItem[] = agg.byEmployee.slice(0, 8).map((e) => ({
    key: e.employeeId,
    value: e.count,
    label: e.name,
  }));

  const intentItems: BarItem[] = Object.entries(agg.byIntent)
    .sort((a, b) => b[1] - a[1])
    .map(([intent, n]) => ({ key: intent, value: n, label: titleCase(intent) }));

  const trendMax = Math.max(1, ...agg.byDay.map((d) => d.count));
  const activeChannels = Object.keys(agg.byChannel).length;

  const tiles = [
    { label: "Conversations", value: agg.total, note: agg.limited ? `recent ${agg.total}` : "all time" },
    { label: "Tickets", value: artifacts.tickets, note: "all time" },
    { label: "Appointments", value: artifacts.appointments, note: "all time" },
    { label: "Active channels", value: activeChannels, note: "with activity" },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Analytics"
        subtitle="Cross-channel performance across your AI Employees."
      />

      {agg.limited ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          Showing your most recent {agg.total} conversations — not an all-time total.
        </p>
      ) : null}

      {/* KPI tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-800">
            <p className="text-sm text-gray-500">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold text-navy-700 dark:text-white">{t.value}</p>
            <p className="mt-1 text-xs text-gray-400">{t.note}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-navy-800">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Conversations by channel</p>
          <BarList items={channelItems} />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-navy-800">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">By AI Employee</p>
          <BarList items={employeeItems} />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-navy-800">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">By intent</p>
          <BarList items={intentItems} />
        </div>

        {/* Trend — last N days, dependency-free bars */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-navy-800">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Last {agg.windowDays} days
          </p>
          <div className="flex h-28 items-end gap-1">
            {agg.byDay.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${d.count}`}>
                <div
                  className="w-full rounded-t bg-brand-500/80"
                  style={{ height: `${Math.round((d.count / trendMax) * 100)}%`, minHeight: d.count > 0 ? "4px" : "0" }}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">{agg.byDay.reduce((s, d) => s + d.count, 0)} in window</p>
        </div>
      </div>
    </div>
  );
}
