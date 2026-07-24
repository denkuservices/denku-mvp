import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { listChannelViews } from "@/lib/platform/readModel/channels";
import type { ConnectionHealth } from "@/lib/platform/connectionHealth";
import PageHeader from "../_platform/PageHeader";
import ChannelCard from "../_platform/channels/ChannelCard";

export const dynamic = "force-dynamic";

/**
 * Channels — the org's channel inventory (Sprint 5; made registry-driven + health-aware in
 * Sprint 7). Every channel in the registry renders here automatically via one generic card:
 * connected ones with real lifecycle health (expiring credentials, provider errors — R-101),
 * unbuilt ones as truthful disabled "coming soon". Adding a channel needs NO edit to this file.
 */
export default async function ChannelsPage() {
  if (!platformUxEnabled()) notFound();

  const orgId = await resolveActiveOrgId();
  const channels = orgId ? await listChannelViews(orgId) : [];

  const healthOf = (v: (typeof channels)[number]) => v.meta?.health as ConnectionHealth | undefined;
  const comingSoon = channels.filter((c) => healthOf(c)?.state === "coming_soon");
  const available = channels.filter((c) => healthOf(c)?.state !== "coming_soon");
  const needsAttention = available.filter((c) => healthOf(c)?.actionRequired);

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Channels"
        subtitle="The ways customers reach your AI Employees. Connect a channel to put an employee to work on it."
      />

      {needsAttention.length > 0 ? (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {needsAttention.length} channel{needsAttention.length === 1 ? "" : "s"} need
            {needsAttention.length === 1 ? "s" : ""} attention — check the cards below.
          </span>
        </div>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Your channels</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {available.map((c) => (
            <ChannelCard key={`${c.channel}:${c.connectionId ?? "none"}`} view={c} />
          ))}
        </div>
      </section>

      {comingSoon.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Coming soon</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {comingSoon.map((c) => (
              <ChannelCard key={c.channel} view={c} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
