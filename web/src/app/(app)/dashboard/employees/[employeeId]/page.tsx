import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Settings2 } from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { getEmployeeView } from "@/lib/platform/readModel/employees";
import { listConversationViews } from "@/lib/platform/readModel/conversations";
import PageHeader from "../../_platform/PageHeader";
import ChannelBadge from "../../_platform/ChannelBadge";
import { formatWhen, statusPillClass, titleCase } from "../../_platform/format";

export const dynamic = "force-dynamic";

/**
 * AI Employee detail (Sprint 5, P3). Employee-centric: shows the channels this employee
 * OWNS and the recent conversations it handled. "Configure" links through to the existing
 * agent settings surface (no duplicated config logic). Reachable only under PLATFORM_UX_ENABLED.
 */
export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  if (!platformUxEnabled()) notFound();

  const { employeeId } = await params;
  const orgId = await resolveActiveOrgId();
  const employee = orgId ? await getEmployeeView(orgId, employeeId) : null;
  if (!employee) notFound();

  const recent = orgId
    ? (await listConversationViews(orgId, { limit: 100 })).filter((c) => c.employeeId === employee.id).slice(0, 10)
    : [];

  return (
    <div className="p-4 md:p-6">
      <Link
        href="/dashboard/employees"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-brand-500"
      >
        <ArrowLeft className="h-4 w-4" /> AI Employees
      </Link>

      <PageHeader
        title={employee.name}
        subtitle={`${(employee.language || "en").toUpperCase()}${employee.voice ? ` · ${employee.voice}` : ""}`}
        action={
          <Link
            href={`/dashboard/settings/agents/${employee.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            <Settings2 className="h-4 w-4" /> Configure
          </Link>
        }
      />

      <div className="mb-6">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusPillClass(employee.status)}`}>
          {titleCase(employee.status)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Channels owned */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-navy-800">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Channels</p>
          {employee.channels.length === 0 ? (
            <p className="text-sm text-gray-500">
              No channels connected.{" "}
              <Link href="/dashboard/channels" className="text-brand-600 hover:underline">
                Connect one
              </Link>
              .
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {employee.channels.map((c) => (
                <div key={c.connectionId ?? c.channel} className="flex items-center justify-between">
                  <ChannelBadge channel={c.channel} />
                  <span className="text-xs text-gray-500">{c.identifier || titleCase(c.status)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent conversations */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 lg:col-span-2 dark:border-white/10 dark:bg-navy-800">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent conversations</p>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-500">No conversations yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-white/10">
              {recent.map((c) => (
                <li key={`${c.source}:${c.id}`}>
                  <Link
                    href={`/dashboard/conversations/${c.id}`}
                    className="flex items-center gap-3 py-2.5 transition hover:opacity-80"
                  >
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
        </div>
      </div>
    </div>
  );
}
