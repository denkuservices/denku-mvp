import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { listEmployeeViews } from "@/lib/platform/readModel/employees";
import PageHeader from "../_platform/PageHeader";
import ChannelBadge from "../_platform/ChannelBadge";
import { titleCase } from "../_platform/format";
import { Surface, EmptyState, Pill } from "../_platform/ui";

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
          {employees.map((e) => (
            <Link
              key={e.id}
              href={`/dashboard/employees/${e.id}`}
              className="block"
            >
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
              </div>
              </Surface>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
