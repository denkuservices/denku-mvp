import Link from "next/link";
import { notFound } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { listChannelViews } from "@/lib/platform/readModel/channels";
import PageHeader from "../_platform/PageHeader";
import ChannelBadge from "../_platform/ChannelBadge";
import { statusPillClass, titleCase } from "../_platform/format";

export const dynamic = "force-dynamic";

/**
 * Channels — the org's channel inventory (Sprint 5). Collapses the old Phone Lines +
 * Instagram surfaces into one channel-agnostic view, and shows not-yet-built channels
 * (WhatsApp/Email/SMS) as disabled "coming soon" affordances so the platform's
 * extensibility is visible. Reachable only under PLATFORM_UX_ENABLED.
 */
export default async function ChannelsPage() {
  if (!platformUxEnabled()) notFound();

  const orgId = await resolveActiveOrgId();
  const channels = orgId ? await listChannelViews(orgId) : [];

  const connected = channels.filter((c) => c.status !== "coming_soon");
  const comingSoon = channels.filter((c) => c.status === "coming_soon");

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Channels"
        subtitle="The ways customers reach your AI Employees. Connect a channel to put an employee to work on it."
      />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Connected</h2>
        {connected.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-white/10 dark:bg-navy-800">
            <p className="text-sm text-gray-500">No channels connected yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {connected.map((c) => (
              <div
                key={`${c.channel}:${c.connectionId ?? "x"}`}
                className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-navy-800"
              >
                <div className="flex items-center justify-between">
                  <ChannelBadge channel={c.channel} />
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusPillClass(c.status)}`}>
                    {titleCase(c.status)}
                  </span>
                </div>
                <p className="truncate text-sm font-medium text-navy-700 dark:text-white">
                  {c.identifier || c.label}
                </p>
                {!c.productionReady ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">Experimental</p>
                ) : null}
                {/* Manage links through to the existing channel-native management page —
                    capability preserved, not rebuilt. */}
                <Link
                  href={
                    c.channel === "voice"
                      ? c.connectionId
                        ? `/dashboard/phone-lines/${c.connectionId}`
                        : "/dashboard/phone-lines"
                      : "/dashboard/instagram"
                  }
                  className="mt-1 inline-flex w-fit items-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
                >
                  Manage
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {comingSoon.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Coming soon</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {comingSoon.map((c) => (
              <div
                key={c.channel}
                className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-5 dark:border-white/10 dark:bg-white/[0.02]"
              >
                <ChannelBadge channel={c.channel} />
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-400 dark:border-white/10 dark:bg-navy-800"
                  title="This channel is coming soon"
                >
                  Coming soon
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
