import Link from "next/link";
import { notFound } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { listConversationViews } from "@/lib/platform/readModel/conversations";
import { isKnownChannel, selectableChannels, channelMeta, type Channel } from "@/lib/platform/channels";
import PageHeader from "../_platform/PageHeader";
import ChannelBadge from "../_platform/ChannelBadge";
import { formatWhen, statusPillClass, titleCase } from "../_platform/format";

export const dynamic = "force-dynamic";

/**
 * Conversations — the unified, channel-agnostic inbox (Sprint 5). Reads the Platform Read
 * Model (voice ← calls, chat ← conversations), so it shows real data independent of the
 * dual-write flag. Only reachable under PLATFORM_UX_ENABLED (else 404 → the surface is dark).
 */
export default async function ConversationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!platformUxEnabled()) notFound();

  const sp = searchParams ? await searchParams : undefined;
  const chParam = Array.isArray(sp?.channel) ? sp?.channel[0] : sp?.channel;
  const channel: Channel | undefined = chParam && isKnownChannel(chParam) ? chParam : undefined;

  const orgId = await resolveActiveOrgId();
  const conversations = orgId ? await listConversationViews(orgId, { channel, limit: 100 }) : [];

  // Registry-driven (R-099): filters are derived from the channels that actually have an adapter,
  // so a new channel appears here with no edit to this file.
  const filters: Array<{ label: string; value?: Channel }> = [
    { label: "All" },
    ...selectableChannels().map((c) => ({ label: channelMeta(c).label, value: c })),
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Conversations"
        subtitle="Every customer conversation across all channels, handled by your AI Employees."
      />

      {/* Channel filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = (channel ?? undefined) === f.value;
          const href = f.value ? `/dashboard/conversations?channel=${f.value}` : "/dashboard/conversations";
          return (
            <Link
              key={f.label}
              href={href}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-brand-500 text-white"
                  : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-navy-800 dark:text-gray-200"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-navy-800">
        <div className="border-b border-gray-100 p-4 dark:border-white/10">
          <p className="text-sm font-medium text-navy-700 dark:text-white">
            {conversations.length} conversation{conversations.length === 1 ? "" : "s"}
          </p>
        </div>

        {conversations.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-navy-700 dark:text-white">No conversations yet</p>
            <p className="mt-1 text-sm text-gray-500">
              When your AI Employees handle calls or messages, they appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-white/10">
            {conversations.map((c) => (
              <li key={`${c.source}:${c.id}`}>
                <Link
                  href={`/dashboard/conversations/${c.id}`}
                  className="flex items-center gap-4 px-4 py-3 transition hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <ChannelBadge channel={c.channel} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-navy-700 dark:text-white">
                      {c.contact.displayName || c.contact.handle || "Unknown contact"}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {c.summary || (c.employeeName ? `Handled by ${c.employeeName}` : "—")}
                    </p>
                  </div>
                  {c.intent ? (
                    <span className="hidden shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600 md:inline dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                      {titleCase(c.intent)}
                    </span>
                  ) : null}
                  {c.status ? (
                    <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium md:inline ${statusPillClass(c.status)}`}>
                      {titleCase(c.status)}
                    </span>
                  ) : null}
                  <span className="shrink-0 text-xs text-gray-400">{formatWhen(c.lastActivityAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
