import Link from "next/link";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { getConversationAggregates, getArtifactCounts } from "@/lib/platform/readModel/aggregate";
import { listEmployeeViews } from "@/lib/platform/readModel/employees";
import { listConversationViews } from "@/lib/platform/readModel/conversations";
import { listConnectedChannelViews } from "@/lib/platform/readModel/channels";
import type { ConnectionHealth } from "@/lib/platform/connectionHealth";
import { isKnownChannel } from "@/lib/platform/channels";
import PageHeader from "../PageHeader";
import BarList, { type BarItem } from "../BarList";
import ChannelBadge from "../ChannelBadge";
import { formatWhen, statusPillClass, titleCase } from "../format";

/**
 * Platform Dashboard (Sprint 5.5) — the channel- and employee-aware home. The cross-surface
 * hub: it reads the Q0 aggregation read model and links to the real Conversations / Employees
 * / Contacts / Analytics surfaces. Rendered by the dashboard route only when
 * PLATFORM_UX_ENABLED (legacy call-metric home otherwise). R-018 honesty throughout.
 */
export default async function PlatformDashboard() {
  const orgId = await resolveActiveOrgId();
  const [agg, artifacts, employees, recent, connectedChannels] = orgId
    ? await Promise.all([
        getConversationAggregates(orgId, { windowDays: 7, limit: 500 }),
        getArtifactCounts(orgId),
        listEmployeeViews(orgId),
        listConversationViews(orgId, { limit: 6 }),
        listConnectedChannelViews(orgId),
      ])
    : [
        { total: 0, byChannel: {}, byEmployee: [], byDay: [], byIntent: {}, limited: false, windowDays: 7 },
        { tickets: 0, appointments: 0 },
        [],
        [],
        [],
      ];

  // Health monitoring (R-101): surface channels needing attention (expiring credentials,
  // provider errors) on the home surface — channel-agnostic, so future channels are covered.
  const unhealthy = connectedChannels.filter((c) => (c.meta?.health as ConnectionHealth | undefined)?.actionRequired);

  const channelItems: BarItem[] = Object.entries(agg.byChannel)
    .sort((a, b) => b[1] - a[1])
    .map(([ch, n]) => ({ key: ch, value: n, label: isKnownChannel(ch) ? <ChannelBadge channel={ch} /> : ch }));

  const tiles = [
    { label: "Conversations", value: agg.total, note: agg.limited ? `recent ${agg.total}` : "all time" },
    { label: "Tickets", value: artifacts.tickets, note: "all time" },
    { label: "Appointments", value: artifacts.appointments, note: "all time" },
    { label: "AI Employees", value: employees.length, note: `${employees.filter((e) => e.status === "active").length} active` },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Overview"
        subtitle="Your AI workforce at a glance — across every channel."
        action={
          <Link
            href="/dashboard/analytics"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
          >
            View analytics <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      {unhealthy.length > 0 ? (
        <Link
          href="/dashboard/channels"
          className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {unhealthy.length} channel{unhealthy.length === 1 ? "" : "s"} need
            {unhealthy.length === 1 ? "s" : ""} attention —{" "}
            {(unhealthy[0].meta?.health as ConnectionHealth).label.toLowerCase()}. Review channels →
          </span>
        </Link>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Channel breakdown */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-navy-800">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">By channel</p>
            <Link href="/dashboard/channels" className="text-xs text-brand-600 hover:underline">Channels</Link>
          </div>
          <BarList items={channelItems} emptyLabel="No conversations yet" />
        </div>

        {/* Employee roster strip */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-navy-800">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">AI Employees</p>
            <Link href="/dashboard/employees" className="text-xs text-brand-600 hover:underline">All</Link>
          </div>
          {employees.length === 0 ? (
            <p className="text-sm text-gray-500">No AI Employees yet.</p>
          ) : (
            <ul className="space-y-2">
              {employees.slice(0, 5).map((e) => (
                <li key={e.id}>
                  <Link href={`/dashboard/employees/${e.id}`} className="flex items-center justify-between gap-2 transition hover:opacity-80">
                    <span className="min-w-0 truncate text-sm font-medium text-navy-700 dark:text-white">{e.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusPillClass(e.status)}`}>
                      {titleCase(e.status)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent conversations */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-navy-800">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Recent</p>
            <Link href="/dashboard/conversations" className="text-xs text-brand-600 hover:underline">Inbox</Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-500">No conversations yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {recent.map((c) => (
                <li key={`${c.source}:${c.id}`}>
                  <Link href={`/dashboard/conversations/${c.id}`} className="flex items-center gap-2 transition hover:opacity-80">
                    <ChannelBadge channel={c.channel} />
                    <span className="min-w-0 flex-1 truncate text-sm text-navy-700 dark:text-white">
                      {c.contact.displayName || c.contact.handle || "Unknown"}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">{formatWhen(c.lastActivityAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
