import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle, CheckCircle2, History as HistoryIcon } from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { getEmployeeView } from "@/lib/platform/readModel/employees";
import { getEmployeeConfig } from "@/lib/platform/readModel/employeeProfile";
import { listConversationViews } from "@/lib/platform/readModel/conversations";
import {
  getTeamActivity,
  employeeAttention,
  ACTIVITY_WINDOW_DAYS,
} from "@/lib/platform/readModel/employeeActivity";
import { listRevisions, revisionsAvailable } from "@/lib/platform/manifest/revisions";
import { employeeChannelCapability, type EmployeeAction } from "@/lib/platform/employeeCapabilities";
import { evaluateConnectionHealth } from "@/lib/platform/connectionHealth";
import { getWorkspaceStatus } from "@/lib/workspace-status";
import PageHeader from "../../_platform/PageHeader";
import ChannelBadge from "../../_platform/ChannelBadge";
import { formatWhen, statusPillClass, titleCase, languageLabel } from "../../_platform/format";
import { Pill } from "../../_platform/ui";
import EmployeeTabs from "../../_platform/team/EmployeeTabs";
import SetupForm from "../../_platform/team/SetupForm";
import KnowledgeForm from "../../_platform/team/KnowledgeForm";
import { EMPLOYEE_TAB_META, resolveEmployeeTab } from "../../_platform/team/tabs";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<EmployeeAction, string> = {
  receive: "answer",
  reply: "reply",
  create_artifacts: "book & log",
  escalate: "escalate",
};

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-navy-800">
      {title ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      ) : null}
      {children}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums text-navy-700 dark:text-white">{value}</p>
      <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}

/**
 * AI Employee detail (Phase 5) — the control plane for one employee.
 *
 * Six tabs: Overview · Setup · Knowledge · Channels · Activity · History. Tabs are query params
 * on one route because every tab reads the same employee; separate routes would refetch it six
 * ways for no benefit.
 *
 * **Setup and Knowledge are read-only and link to the existing settings forms.** Those own
 * validation, the Vapi sync and manifest minting — a second way to change how a live assistant
 * behaves is exactly the kind of duplication this codebase has been paying down (R-094 folds
 * them in properly, with tests).
 */
export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!platformUxEnabled()) notFound();

  const { employeeId } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const rawTab = Array.isArray(sp?.tab) ? sp?.tab[0] : sp?.tab;
  const tab = resolveEmployeeTab(rawTab);

  const orgId = await resolveActiveOrgId();
  const employee = orgId ? await getEmployeeView(orgId, employeeId) : null;
  if (!employee || !orgId) notFound();

  const attention = employeeAttention(employee);
  const meta = EMPLOYEE_TAB_META[tab];

  // Fetch only what the active tab needs — six tabs on one route must not mean six queries.
  const activity =
    tab === "overview" ? (await getTeamActivity(orgId, [employee])).get(employee.id) ?? null : null;
  const isEditorTab = tab === "setup" || tab === "knowledge";
  const [config, workspaceStatus] = isEditorTab
    ? await Promise.all([getEmployeeConfig(orgId, employee.id), getWorkspaceStatus(orgId)])
    : [null, "active" as const];


  /*
   * What the business's own website said, read in the background during onboarding.
   *
   * Shown as PLACEHOLDER text, never written in: a real page can be years out of date, and the
   * owner confirming it is the whole safeguard. Falls back to the regional examples when there is
   * no site or nothing was found.
   */
  let websiteFacts: Record<string, string> | null = null;
  if (orgId) {
    const { data: ws } = await supabaseAdmin
      .from("organization_settings")
      .select("website_facts")
      .eq("org_id", orgId)
      .maybeSingle<{ website_facts: Record<string, string> | null }>();
    websiteFacts = ws?.website_facts ?? null;
  }  const conversations =
    tab === "activity" || tab === "overview"
      ? (await listConversationViews(orgId, { limit: 200 }))
          .filter((c) => c.employeeId === employee.id)
          .slice(0, tab === "activity" ? 50 : 5)
      : [];
  const [revisions, historyAvailable] =
    tab === "history"
      ? await Promise.all([listRevisions(orgId, employee.id), revisionsAvailable(orgId)])
      : [[], false];

  return (
    <div className="p-4 md:p-6">
      <Link
        href="/dashboard/team"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-brand-500"
      >
        <ArrowLeft className="h-4 w-4" /> AI Team
      </Link>

      <PageHeader
        title={employee.name}
        // Same rule as the roster: the language in words, never the raw voice id ("EN · alloy").
        subtitle={languageLabel(employee.language)}
        action={
          // Configuration is a tab on this page now (Sprint 10), not a page in Settings — so the
          // header carries status, not an escape hatch out of the surface you are already on.
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusPillClass(employee.status)}`}>
            {titleCase(employee.status)}
          </span>
        }
      />

      {attention ? (
        <div
          className={`mb-6 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
            attention.severity === "critical"
              ? "border-red-200 bg-red-50 text-red-900 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300"
              : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
          }`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{attention.message}</span>
        </div>
      ) : null}

      <EmployeeTabs employeeId={employee.id} active={tab} />

      <p className="mb-5 mt-4 text-sm text-gray-600 dark:text-gray-400">{meta.description}</p>

      {tab === "overview" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <div className="grid grid-cols-2 gap-4">
              <Stat
                label="Conversations handled"
                value={`${activity?.conversationsHandled ?? 0}${activity?.bounded ? "+" : ""}`}
                hint={`Last ${activity?.windowDays ?? ACTIVITY_WINDOW_DAYS} days`}
              />
              <Stat
                label="Requests produced"
                value={`${activity?.requestsProduced ?? 0}${activity?.bounded ? "+" : ""}`}
                hint="Tickets & appointments"
              />
            </div>
            <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-white/10">
              Last active {formatWhen(activity?.lastActiveAt ?? null)}
            </p>
          </Card>

          <Card title="Channels">
            {employee.channels.length === 0 ? (
              <p className="text-sm text-gray-500">
                No channels connected.{" "}
                <Link href="/dashboard/channels" className="text-brand-600 hover:underline">
                  Connect one
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {employee.channels.map((c) => (
                  <ChannelBadge key={c.connectionId ?? c.channel} channel={c.channel} />
                ))}
              </div>
            )}
          </Card>

          <Card title="Recent conversations">
            {conversations.length === 0 ? (
              <p className="text-sm text-gray-500">No conversations yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-white/10">
                {conversations.map((c) => (
                  <li key={`${c.source}:${c.id}`}>
                    <Link href={`/dashboard/inbox/${c.id}`} className="flex items-center gap-2 py-2 transition hover:opacity-80">
                      <ChannelBadge channel={c.channel} />
                      <span className="min-w-0 flex-1 truncate text-sm text-navy-700 dark:text-white">
                        {c.contact.displayName || c.contact.handle || "Unknown contact"}
                      </span>
                      <span className="shrink-0 text-xs text-gray-400">{formatWhen(c.lastActivityAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "setup" ? (
        config ? (
          <SetupForm employee={config} workspaceStatus={workspaceStatus} />
        ) : (
          <Card>
            <p className="text-sm text-gray-500">Couldn&apos;t load this employee&apos;s setup.</p>
          </Card>
        )
      ) : null}

      {tab === "knowledge" ? (
        config ? (
          <KnowledgeForm
            employee={config}
            workspaceStatus={workspaceStatus}
            websiteFacts={websiteFacts}
          />
        ) : (
          <Card>
            <p className="text-sm text-gray-500">Couldn&apos;t load this employee&apos;s knowledge.</p>
          </Card>
        )
      ) : null}

      {tab === "channels" ? (
        <Card>
          {employee.channels.length === 0 ? (
            <p className="text-sm text-gray-500">
              No channels connected.{" "}
              <Link href="/dashboard/channels" className="text-brand-600 hover:underline">
                Connect one
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-white/10">
              {employee.channels.map((c) => {
                // Capabilities and health are both DERIVED (R-101/R-104), so a future channel
                // shows correct "what this employee can do here" with no code change.
                const cap = employeeChannelCapability(c.channel);
                const health = evaluateConnectionHealth({
                  status: c.status,
                  adopted: c.status === "coming_soon" ? false : undefined,
                  expiresAt: (c.meta?.tokenExpiresAt as string | undefined) ?? null,
                  lastError: (c.meta?.lastError as string | undefined) ?? null,
                });
                return (
                  <li key={c.connectionId ?? c.channel} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ChannelBadge channel={c.channel} />
                      <span className="text-sm text-gray-600 dark:text-gray-300">{c.identifier || "—"}</span>
                      <Pill
                        tone={
                          health.severity === "ok"
                            ? "ok"
                            : health.severity === "critical"
                              ? "critical"
                              : health.severity === "warn"
                                ? "warn"
                                : "neutral"
                        }
                        className="ml-auto"
                      >
                        {health.label}
                      </Pill>
                    </div>
                    <p className="text-xs text-gray-500">
                      Can {cap.actions.map((a) => ACTION_LABEL[a]).join(" · ")}
                    </p>
                    {/* Stated limitations, not omitted ones — "receives but can't reply yet". */}
                    {cap.limitations.map((l) => (
                      <p key={l} className="text-xs text-amber-600 dark:text-amber-400">
                        {l}
                      </p>
                    ))}
                    {health.detail ? <p className="text-xs text-gray-500">{health.detail}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "activity" ? (
        <Card>
          {conversations.length === 0 ? (
            <p className="text-sm text-gray-500">This employee hasn&apos;t handled any conversations yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-white/10">
              {conversations.map((c) => (
                <li key={`${c.source}:${c.id}`}>
                  <Link href={`/dashboard/inbox/${c.id}`} className="flex items-center gap-3 py-2.5 transition hover:opacity-80">
                    <ChannelBadge channel={c.channel} />
                    <span className="min-w-0 flex-1 truncate text-sm text-navy-700 dark:text-white">
                      {c.contact.displayName || c.contact.handle || "Unknown contact"}
                    </span>
                    {c.intent ? <Pill tone="info" className="hidden md:inline-flex">{titleCase(c.intent)}</Pill> : null}
                    <span className="shrink-0 text-xs text-gray-400">{formatWhen(c.lastActivityAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "history" ? (
        <Card>
          {!historyAvailable ? (
            <p className="text-sm text-gray-500">
              Configuration history isn&apos;t available on this environment yet — the employee
              manifest migration hasn&apos;t been applied.
            </p>
          ) : revisions.length === 0 ? (
            <p className="text-sm text-gray-500">
              No changes recorded yet. Every future change to this employee&apos;s configuration is
              saved here, so you can always see what it was running at any point in time.
            </p>
          ) : (
            <ol className="divide-y divide-gray-100 dark:divide-white/10">
              {revisions.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 dark:border-white/10 dark:bg-navy-900 dark:text-gray-400">
                    <HistoryIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-navy-700 dark:text-white">
                        Revision {r.revision}
                      </span>
                      {r.revision === revisions[0].revision ? <Pill tone="ok">Current</Pill> : null}
                    </div>
                    <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
                      {r.reason || "Configuration updated."}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">{formatWhen(r.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 flex items-start gap-1.5 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-white/10">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Revisions are immutable — a saved change never rewrites an earlier one, so this history
            is a permanent record of what answered your customers.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
