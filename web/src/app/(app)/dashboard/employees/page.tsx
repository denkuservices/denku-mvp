import Link from "next/link";
import { notFound } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { listEmployeeViews } from "@/lib/platform/readModel/employees";
import PageHeader from "../_platform/PageHeader";
import ChannelBadge from "../_platform/ChannelBadge";
import { statusPillClass, titleCase } from "../_platform/format";

export const dynamic = "force-dynamic";

/**
 * AI Employees — the roster. Employee-centric: each Employee OWNS the channels it works
 * (design invariant #1). Reads the Platform Read Model. Reachable only under PLATFORM_UX_ENABLED.
 */
export default async function EmployeesPage() {
  if (!platformUxEnabled()) notFound();

  const orgId = await resolveActiveOrgId();
  const employees = orgId ? await listEmployeeViews(orgId) : [];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="AI Employees"
        subtitle="Your AI workforce. Each employee works across the channels it's connected to."
      />

      {employees.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center dark:border-white/10 dark:bg-navy-800">
          <p className="text-sm font-medium text-navy-700 dark:text-white">No AI Employees yet</p>
          <p className="mt-1 text-sm text-gray-500">Complete setup to hire your first AI Employee.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {employees.map((e) => (
            <Link
              key={e.id}
              href={`/dashboard/employees/${e.id}`}
              className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-brand-400 hover:shadow-sm dark:border-white/10 dark:bg-navy-800"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-navy-700 dark:text-white">{e.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {(e.language || "en").toUpperCase()}
                    {e.voice ? ` · ${e.voice}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusPillClass(e.status)}`}>
                  {titleCase(e.status)}
                </span>
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
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
