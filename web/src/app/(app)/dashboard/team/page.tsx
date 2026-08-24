import Link from "next/link";
import { notFound } from "next/navigation";
import { Users, AlertTriangle, CheckCircle2 } from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { listEmployeeViews } from "@/lib/platform/readModel/employees";
import { getTeamActivity, employeeAttention } from "@/lib/platform/readModel/employeeActivity";
import { comingSoonChannelViews } from "@/lib/platform/readModel/channels";
import PageHeader from "../_platform/PageHeader";
import ChannelBadge from "../_platform/ChannelBadge";
import { formatWhen, titleCase } from "../_platform/format";
import { Surface, EmptyState, Pill } from "../_platform/ui";

export const dynamic = "force-dynamic";

/**
 * AI Team — the roster (Phase 5).
 *
 * Answers "who works for me, and how are they doing?" — so it leads with **outcomes and
 * attention**, not configuration. Each employee OWNS the channels it works (design invariant #1).
 *
 * Counts are observed over a bounded recent window and labelled as such; there is no all-time
 * total, because the read model scans a window and inventing a total from it is exactly the
 * fabricated-number problem Sprint 8.5 caught.
 */
export default async function TeamPage() {
  if (!platformUxEnabled()) notFound();

  const orgId = await resolveActiveOrgId();
  const employees = orgId ? await listEmployeeViews(orgId) : [];
  const activity = orgId && employees.length > 0 ? await getTeamActivity(orgId, employees) : new Map();

  // Roles arriving later, derived from the channel registry so nothing is hand-listed and
  // nothing can claim to be available before its channel actually works.
  const upcoming = comingSoonChannelViews();

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="AI Team"
        subtitle="Your AI workforce. Each employee works the channels it's connected to."
      />

      {employees.length === 0 ? (
        <Surface padded={false}>
          <EmptyState
            icon={Users}
            title="No AI Employees yet"
            description="An AI Employee answers your customers on the channels you connect it to — around the clock. Finish setup to hire your first one."
            action={{ label: "Go to channels", href: "/dashboard/channels" }}
          />
        </Surface>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {employees.map((e) => {
            const stats = activity.get(e.id);
            const attention = employeeAttention(e);
            return (
              <Link key={e.id} href={`/dashboard/team/${e.id}`} className="block">
                <Surface className="h-full transition hover:shadow-xl">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-navy-700 dark:text-white">{e.name}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {(e.language || "en").toUpperCase()}
                          {e.voice ? ` · ${e.voice}` : ""}
                        </p>
                      </div>
                      <Pill tone={e.status === "active" ? "ok" : "neutral"}>{titleCase(e.status)}</Pill>
                    </div>

                    {/* What it accomplished — the reason to visit this page. */}
                    <div className="flex items-baseline gap-4 border-y border-gray-100 py-3 dark:border-white/10">
                      <div>
                        <p className="text-xl font-semibold tabular-nums text-navy-700 dark:text-white">
                          {stats?.conversationsHandled ?? 0}
                          {stats?.bounded ? "+" : ""}
                        </p>
                        <p className="text-xs text-gray-500">
                          conversations · {stats?.windowDays ?? 7}d
                        </p>
                      </div>
                      <div>
                        <p className="text-xl font-semibold tabular-nums text-navy-700 dark:text-white">
                          {stats?.requestsProduced ?? 0}
                          {stats?.bounded ? "+" : ""}
                        </p>
                        <p className="text-xs text-gray-500">requests produced</p>
                      </div>
                    </div>

                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Channels</p>
                      {e.channels.length === 0 ? (
                        <p className="text-xs text-gray-400">No channels connected</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {e.channels.map((c) => (
                            <ChannelBadge key={c.connectionId ?? c.channel} channel={c.channel} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Attention renders only when something is genuinely wrong; otherwise the
                        card says so, rather than leaving the customer to guess. */}
                    {attention ? (
                      <p
                        className={`flex items-start gap-1.5 text-xs ${
                          attention.severity === "critical"
                            ? "text-red-600 dark:text-red-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {attention.message}
                      </p>
                    ) : (
                      <p className="flex items-center gap-1.5 text-xs text-gray-500">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        Working · last active {formatWhen(stats?.lastActiveAt ?? null)}
                      </p>
                    )}
                  </div>
                </Surface>
              </Link>
            );
          })}
        </div>
      )}

      {upcoming.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-1 text-sm font-semibold text-navy-700 dark:text-white">Arriving later</h2>
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
            Employees for these channels aren&apos;t available yet. They appear here automatically
            when they are — nothing to sign up for.
          </p>
          <div className="flex flex-wrap gap-2">
            {upcoming.map((c) => (
              <span
                key={c.channel}
                className="inline-flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 dark:border-white/15 dark:text-gray-400"
              >
                <ChannelBadge channel={c.channel} />
                {c.label}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
