import Link from "next/link";
import { ArrowRight, AlertTriangle, CheckCircle2, Ticket, Calendar, Radio, UserCheck } from "lucide-react";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { getConversationAggregates, getArtifactCounts } from "@/lib/platform/readModel/aggregate";
import { getEstimatedSavings } from "@/lib/platform/readModel/savings";
import { getOutcomeCounts } from "@/lib/platform/readModel/outcomes";
import { listEmployeeViews } from "@/lib/platform/readModel/employees";
import { getTeamActivity, employeeAttention } from "@/lib/platform/readModel/employeeActivity";
import { listConversationViews } from "@/lib/platform/readModel/conversations";
import { listConnectedChannelViews } from "@/lib/platform/readModel/channels";
import { countNeedsHuman } from "@/lib/platform/handling";
import type { ConnectionHealth } from "@/lib/platform/connectionHealth";
import { isKnownChannel } from "@/lib/platform/channels";
import PageHeader from "../PageHeader";
import BarList, { type BarItem } from "../BarList";
import TrendChart from "../charts/TrendChart";
import ChannelBadge from "../ChannelBadge";
import { formatWhen, titleCase } from "../format";
import { Surface, SectionHeader, StatCard, EmptyState, Pill, ListContainer, ListRow } from "../ui";

const WINDOW_DAYS = 7;

/**
 * Home — **the outcome layer** (Phase 6, extending the action-first structure of Sprint 8.5).
 *
 * The page answers, in order:
 *   1. **Does anything need me?** — channels unhealthy, conversations waiting on a person, open
 *      requests, no employee live. Silence is a feature: an all-clear means all-clear.
 *   2. **What did my AI team accomplish?** — outcomes over a window, not vanity totals.
 *   3. **Who did it** — per-employee outcomes and attention.
 *   4. **Trends** — demoted below the work.
 *
 * Two honesty rules run through it: bounded windows are labelled ("recent N", "7d"), never a
 * fabricated total (R-018); and an unknown count renders as “—”, never as a confident zero.
 */
export default async function PlatformDashboard() {
  const orgId = await resolveActiveOrgId();

  const [agg, artifacts, outcomes, employees, recent, connectedChannels, needsHuman, savings] = orgId
    ? await Promise.all([
        getConversationAggregates(orgId, { windowDays: WINDOW_DAYS, limit: 500 }),
        getArtifactCounts(orgId),
        getOutcomeCounts(orgId, WINDOW_DAYS),
        listEmployeeViews(orgId),
        listConversationViews(orgId, { limit: 6 }),
        listConnectedChannelViews(orgId),
        countNeedsHuman(orgId),
        getEstimatedSavings(orgId, WINDOW_DAYS),
      ])
    : [
        { total: 0, byChannel: {}, byEmployee: [], byDay: [], byIntent: {}, limited: false, windowDays: WINDOW_DAYS },
        { tickets: 0, appointments: 0, openTickets: 0, upcomingAppointments: 0 },
        {
          newContacts: null,
          requestsCreated: null,
          requestsResolved: null,
          appointmentsBooked: null,
          windowDays: WINDOW_DAYS,
        },
        [],
        [],
        [],
        null,
        null,
      ];

  const teamActivity = orgId && employees.length > 0 ? await getTeamActivity(orgId, employees) : new Map();

  // --- 1. What needs attention -------------------------------------------------
  const unhealthy = connectedChannels.filter(
    (c) => (c.meta?.health as ConnectionHealth | undefined)?.actionRequired
  );
  const activeEmployees = employees.filter((e) => e.status === "active");

  type Attention = {
    key: string;
    tone: "warn" | "critical";
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    href: string;
  };
  const attention: Attention[] = [];

  // Conversations a person has taken over are the most time-sensitive signal on the page:
  // a customer is waiting on a human, not on the AI. Leads the list for that reason.
  if (needsHuman && needsHuman > 0) {
    attention.push({
      key: "conversations:needs-human",
      tone: "warn",
      icon: UserCheck,
      label: `${needsHuman} conversation${needsHuman === 1 ? "" : "s"} waiting on a person`,
      href: "/dashboard/inbox?handling=human",
    });
  }

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
      href: "/dashboard/crm/requests?type=ticket&status=open",
    });
  }

  // --- 4. Trends ---------------------------------------------------------------
  const channelItems: BarItem[] = Object.entries(agg.byChannel)
    .sort((a, b) => b[1] - a[1])
    .map(([ch, n]) => ({ key: ch, value: n, label: isKnownChannel(ch) ? <ChannelBadge channel={ch} /> : ch }));

  const isNewWorkspace = employees.length === 0 && agg.total === 0;

  /** An unknown count is not zero — say so rather than asserting a number we don't have. */
  const show = (n: number | null) => (n === null ? "—" : String(n));

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Home"
        subtitle="What your AI team accomplished, and anything that needs you."
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
          <span>Nothing needs your attention — your AI team has it covered.</span>
        </div>
      ) : null}

      {/* 2. ACCOMPLISHED — outcomes over the window, not all-time vanity totals. */}
      <section className="mb-6">
        <SectionHeader
          title={`Accomplished · last ${WINDOW_DAYS} days`}
          action={
            <Link href="/dashboard/inbox" className="text-xs text-brand-600 hover:underline">
              Open Inbox
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Conversations handled"
            value={agg.total}
            note={agg.limited ? `recent ${agg.total}` : `last ${WINDOW_DAYS} days`}
            href="/dashboard/inbox"
          />
          <StatCard
            label="New customers"
            value={show(outcomes.newContacts)}
            note="first heard from you"
            href="/dashboard/crm/contacts"
          />
          <StatCard
            label="Appointments booked"
            value={show(outcomes.appointmentsBooked)}
            note={`${artifacts.upcomingAppointments} still upcoming`}
            href="/dashboard/crm/requests?type=appointment"
          />
          <StatCard
            label="Requests resolved"
            value={show(outcomes.requestsResolved)}
            note={`${show(outcomes.requestsCreated)} created`}
            href="/dashboard/crm/requests?type=ticket"
          />
        </div>

        {/* The outcome translated into money. An estimate, and labelled as one — $25/hour is a
            stand-in for a human answering the phone, not a measured rate for this business. */}
        {savings && savings.minutes > 0 ? (
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            Roughly{" "}
            <span className="font-semibold tabular-nums text-navy-700 dark:text-white">
              ${Math.round(savings.usd).toLocaleString()}
            </span>{" "}
            of answering time your team didn&apos;t have to cover — an estimate based on{" "}
            {Math.round(savings.minutes)} minutes handled, valued at $25/hour.
          </p>
        ) : null}
      </section>

      {/* 3. WHO DID IT — the AI team, with real outcomes per employee. */}
      {employees.length > 0 ? (
        <section className="mb-6">
          <SectionHeader
            title="Your AI team"
            action={
              <Link href="/dashboard/team" className="text-xs text-brand-600 hover:underline">
                Manage team
              </Link>
            }
          />
          <Surface padded={false}>
            <ListContainer>
              {employees.slice(0, 5).map((e) => {
                const stats = teamActivity.get(e.id);
                const alert = employeeAttention(e);
                return (
                  <ListRow key={e.id} href={`/dashboard/team/${e.id}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-navy-700 dark:text-white">{e.name}</p>
                      <p className="truncate text-xs text-gray-500">
                        {alert ? (
                          <span className={alert.severity === "critical" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}>
                            {alert.message}
                          </span>
                        ) : (
                          `${stats?.conversationsHandled ?? 0}${stats?.bounded ? "+" : ""} conversations · ${
                            stats?.requestsProduced ?? 0
                          } requests`
                        )}
                      </p>
                    </div>
                    <div className="hidden shrink-0 gap-1.5 md:flex">
                      {e.channels.map((c) => (
                        <ChannelBadge key={c.connectionId ?? c.channel} channel={c.channel} />
                      ))}
                    </div>
                    <Pill tone={alert ? (alert.severity === "critical" ? "critical" : "warn") : "ok"}>
                      {alert ? "Needs you" : "Working"}
                    </Pill>
                  </ListRow>
                );
              })}
            </ListContainer>
          </Surface>
        </section>
      ) : null}

      {/* Recent activity — the raw feed, below the summary. */}
      <section className="mb-6">
        <SectionHeader
          title="Latest conversations"
          action={
            <Link href="/dashboard/inbox" className="text-xs text-brand-600 hover:underline">
              See all
            </Link>
          }
        />
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

      {/* 4. TRENDS — demoted below the work. */}
      <section>
        <SectionHeader
          title={`Trends · last ${agg.windowDays} days`}
          action={
            <Link href="/dashboard/channels" className="text-xs text-brand-600 hover:underline">
              Channels
            </Link>
          }
        />
        <Surface className="mb-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Conversations per day
          </p>
          <TrendChart
            labels={agg.byDay.map((d) => d.date.slice(5))}
            values={agg.byDay.map((d) => d.count)}
            height={200}
          />
        </Surface>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Surface>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">By channel</p>
            <BarList items={channelItems} emptyLabel="No conversations yet" />
          </Surface>
          <Surface>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">By outcome</p>
            <BarList
              items={Object.entries(agg.byIntent)
                .sort((a, b) => b[1] - a[1])
                .map(([intent, n]) => ({ key: intent, value: n, label: titleCase(intent) }))}
              emptyLabel="No outcomes recorded yet"
            />
          </Surface>
        </div>
      </section>
    </div>
  );
}
