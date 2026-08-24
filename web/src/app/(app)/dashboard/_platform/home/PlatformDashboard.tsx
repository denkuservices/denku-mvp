import Link from "next/link";
import { ArrowRight, AlertTriangle, CheckCircle2, Ticket, Calendar, Radio } from "lucide-react";
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
import { formatWhen, titleCase } from "../format";
import { Surface, SectionHeader, StatCard, EmptyState, Pill, ListContainer, ListRow } from "../ui";

/**
 * Platform Dashboard — **action-first** (Sprint 8.5 / R-121, audit Y-“does anything need me?”).
 *
 * Previously this led with vanity totals, answering "what happened?". A daily operator opens the app
 * asking "**does anything need me?**" — so the page is now ordered:
 *   1. **Needs attention** — only rendered when something is actually wrong (channels unhealthy,
 *      tickets open, no employee live). Silence here is a feature: an all-clear means all-clear.
 *   2. **Today** — the work the AI did, and recent conversations.
 *   3. **Trends** — the numbers, demoted to where they belong.
 *
 * R-018 honesty throughout: bounded windows are labelled "recent N", never a fabricated total.
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
        { tickets: 0, appointments: 0, openTickets: 0, upcomingAppointments: 0 },
        [],
        [],
        [],
      ];

  // --- 1. What needs attention -------------------------------------------------
  const unhealthy = connectedChannels.filter(
    (c) => (c.meta?.health as ConnectionHealth | undefined)?.actionRequired
  );
  const activeEmployees = employees.filter((e) => e.status === "active");

  type Attention = { key: string; tone: "warn" | "critical"; icon: React.ComponentType<{ className?: string }>; label: string; href: string };
  const attention: Attention[] = [];

  for (const c of unhealthy) {
    const h = c.meta?.health as ConnectionHealth;
    attention.push({
      key: `ch:${c.channel}:${c.connectionId ?? ""}`,
      tone: h.severity === "critical" ? "critical" : "warn",
      icon: Radio,
      label: `${c.label}: ${h.label}${h.detail ? ` — ${h.detail}` : ""}`,
      href: "/dashboard/channels",
    });
  }
  if (employees.length > 0 && activeEmployees.length === 0) {
    attention.push({
      key: "emp:none-active",
      tone: "critical",
      icon: AlertTriangle,
      label: "No AI Employee is connected to a channel — customers reaching you aren't being answered.",
      href: "/dashboard/channels",
    });
  }
  if (artifacts.openTickets > 0) {
    attention.push({
      key: "tickets:open",
      tone: "warn",
      icon: Ticket,
      label: `${artifacts.openTickets} open request${artifacts.openTickets === 1 ? "" : "s"} waiting on you`,
      href: "/dashboard/tickets",
    });
  }

  // --- 3. Trends ---------------------------------------------------------------
  const channelItems: BarItem[] = Object.entries(agg.byChannel)
    .sort((a, b) => b[1] - a[1])
    .map(([ch, n]) => ({ key: ch, value: n, label: isKnownChannel(ch) ? <ChannelBadge channel={ch} /> : ch }));

  const isNewWorkspace = employees.length === 0 && agg.total === 0;

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

      {isNewWorkspace ? (
        <Surface padded={false} className="mb-6">
          <EmptyState
            icon={Radio}
            title="Your workspace is ready"
            description="Connect a channel to put an AI Employee to work. Every call and message it handles will show up here, turned into requests and appointments."
            action={{ label: "Connect a channel", href: "/dashboard/channels" }}
          />
        </Surface>
      ) : null}

      {/* 1. NEEDS ATTENTION — silence here is meaningful, so we render nothing when all is well. */}
      {attention.length > 0 ? (
        <section className="mb-6">
          <SectionHeader title="Needs attention" />
          <div className="flex flex-col gap-2">
            {attention.map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.key}
                  href={a.href}
                  className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm transition ${
                    a.tone === "critical"
                      ? "border-red-200 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
                      : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                  }`}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">{a.label}</span>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                </Link>
              );
            })}
          </div>
        </section>
      ) : !isNewWorkspace ? (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>All channels healthy — nothing needs your attention.</span>
        </div>
      ) : null}

      {/* 2. TODAY — what the AI actually did, and what's coming up. */}
      <section className="mb-6">
        <SectionHeader
          title="Today"
          action={
            <Link href="/dashboard/inbox" className="text-xs text-brand-600 hover:underline">
              All conversations
            </Link>
          }
        />
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Conversations"
            value={agg.total}
            note={agg.limited ? `recent ${agg.total}` : `last ${agg.windowDays} days`}
            href="/dashboard/inbox"
          />
          <StatCard label="Open requests" value={artifacts.openTickets} note="waiting on you" href="/dashboard/tickets" />
          <StatCard
            label="Upcoming"
            value={artifacts.upcomingAppointments}
            note="scheduled appointments"
            href="/dashboard/appointments"
          />
          <StatCard
            label="AI Employees"
            value={employees.length}
            note={`${activeEmployees.length} active`}
            href="/dashboard/team"
          />
        </div>

        <Surface padded={false}>
          {recent.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No conversations yet"
              description="When your AI Employees answer a call or message, it appears here."
            />
          ) : (
            <ListContainer>
              {recent.map((c) => (
                <ListRow key={`${c.source}:${c.id}`} href={`/dashboard/inbox/${c.id}`}>
                  <ChannelBadge channel={c.channel} />
                  <span className="min-w-0 flex-1 truncate text-sm text-navy-700 dark:text-white">
                    {c.contact.displayName || c.contact.handle || "Unknown"}
                  </span>
                  {c.intent ? (
                    <Pill tone="info" className="hidden md:inline-flex">
                      {titleCase(c.intent)}
                    </Pill>
                  ) : null}
                  <span className="shrink-0 text-xs text-gray-400">{formatWhen(c.lastActivityAt)}</span>
                </ListRow>
              ))}
            </ListContainer>
          )}
        </Surface>
      </section>

      {/* 3. TRENDS — demoted below the work. */}
      <section>
        <SectionHeader
          title={`Trends · last ${agg.windowDays} days`}
          action={
            <Link href="/dashboard/channels" className="text-xs text-brand-600 hover:underline">
              Channels
            </Link>
          }
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Surface>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">By channel</p>
            <BarList items={channelItems} emptyLabel="No conversations yet" />
          </Surface>
          <Surface>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">AI Employees</p>
            {employees.length === 0 ? (
              <p className="text-sm text-gray-500">No AI Employees yet.</p>
            ) : (
              <ul className="space-y-2">
                {employees.slice(0, 5).map((e) => (
                  <li key={e.id}>
                    <Link href={`/dashboard/team/${e.id}`} className="flex items-center justify-between gap-2 transition hover:opacity-80">
                      <span className="min-w-0 truncate text-sm font-medium text-navy-700 dark:text-white">{e.name}</span>
                      <Pill tone={e.status === "active" ? "ok" : "neutral"}>{titleCase(e.status)}</Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </div>
      </section>
    </div>
  );
}
