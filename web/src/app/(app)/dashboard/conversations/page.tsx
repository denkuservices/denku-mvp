import Link from "next/link";
import { notFound } from "next/navigation";
import { MessagesSquare, Search } from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { listConversationPage } from "@/lib/platform/readModel/conversations";
import { isKnownChannel, selectableChannels, channelMeta, type Channel } from "@/lib/platform/channels";
import PageHeader from "../_platform/PageHeader";
import ChannelBadge from "../_platform/ChannelBadge";
import { formatWhen, titleCase } from "../_platform/format";
import { Surface, ListContainer, ListHeader, ListRow, EmptyState, Pill } from "../_platform/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

/** Intents worth filtering by; kept small and honest (these are what the classifier emits). */
const INTENTS = [
  { value: "appointment", label: "Appointment" },
  { value: "support", label: "Support" },
];

function one(v: string | string[] | undefined): string {
  if (!v) return "";
  return (Array.isArray(v) ? v[0] : v).trim();
}

/**
 * Conversations — the unified, channel-agnostic inbox.
 *
 * Sprint 8.5 (audit Y-001/Y-003/Y-004/Y-005): this page previously had a single channel filter and
 * reported a fabricated total. It now matches — and exceeds — the legacy Calls page it replaces:
 * search, date range, intent filter, pagination, and a **truthful** count.
 */
export default async function ConversationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!platformUxEnabled()) notFound();

  const sp = searchParams ? await searchParams : undefined;
  const chParam = one(sp?.channel);
  const channel: Channel | undefined = chParam && isKnownChannel(chParam) ? chParam : undefined;
  const search = one(sp?.q);
  const from = one(sp?.from);
  const to = one(sp?.to);
  const intent = one(sp?.intent);
  const page = Math.max(1, Number(one(sp?.page)) || 1);

  const orgId = await resolveActiveOrgId();
  const result = orgId
    ? await listConversationPage(orgId, {
        channel,
        search,
        from,
        to,
        intent,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
    : { items: [], total: 0, bounded: false };

  const hasFilters = Boolean(search || from || to || intent || channel);
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const showingFrom = result.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(page * PAGE_SIZE, result.total);

  /** Preserve current filters when changing one facet. */
  const hrefWith = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { channel: chParam, q: search, from, to, intent, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return `/dashboard/conversations${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Conversations"
        subtitle="Every customer conversation across all channels, handled by your AI Employees."
      />

      {/* Channel facets — derived from the registry (R-099), so new channels appear automatically. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[{ label: "All", value: undefined as Channel | undefined }, ...selectableChannels().map((c) => ({ label: channelMeta(c).label, value: c }))].map(
          (f) => {
            const active = channel === f.value;
            return (
              <Link
                key={f.label}
                href={hrefWith({ channel: f.value, page: undefined })}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-brand-500 text-white"
                    : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-navy-800 dark:text-gray-200"
                }`}
              >
                {f.label}
              </Link>
            );
          }
        )}
      </div>

      {/* Search + date range + intent. GET form → shareable, bookmarkable URLs. */}
      <form method="get" className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto_auto_auto]">
        {chParam ? <input type="hidden" name="channel" value={chParam} /> : null}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search name, number, or summary…"
            aria-label="Search conversations"
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 dark:border-white/10 dark:bg-navy-800 dark:text-white"
          />
        </div>
        <input
          type="date"
          name="from"
          defaultValue={from}
          aria-label="From date"
          className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
        />
        <input
          type="date"
          name="to"
          defaultValue={to}
          aria-label="To date"
          className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
        />
        <select
          name="intent"
          defaultValue={intent}
          aria-label="Outcome"
          className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
        >
          <option value="">Any outcome</option>
          {INTENTS.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            type="submit"
            className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            Filter
          </button>
          {hasFilters ? (
            <Link
              href="/dashboard/conversations"
              className="inline-flex h-10 items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <Surface padded={false}>
        <ListHeader>
          <p className="text-sm font-medium text-navy-700 dark:text-white">
            {result.total === 0
              ? "No matching conversations"
              : /* Truthful count — never a fabricated exact total (R-018). */
                `Showing ${showingFrom}–${showingTo} of ${result.bounded ? `${result.total}+` : result.total}`}
          </p>
          {result.bounded ? (
            <Pill tone="neutral">Most recent {result.total}+ — narrow with filters</Pill>
          ) : null}
        </ListHeader>

        {result.items.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={Search}
              title="No conversations match these filters"
              description="Try widening the date range, clearing the outcome filter, or searching for a different name or number."
              action={{ label: "Clear filters", href: "/dashboard/conversations" }}
            />
          ) : (
            <EmptyState
              icon={MessagesSquare}
              title="No conversations yet"
              description="When your AI Employees answer a call or a message, every conversation appears here — with the transcript and what it produced."
              action={{ label: "Check your channels", href: "/dashboard/channels" }}
            />
          )
        ) : (
          <ListContainer>
            {result.items.map((c) => (
              <ListRow key={`${c.source}:${c.id}`} href={`/dashboard/conversations/${c.id}`}>
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
                  <Pill tone="info" className="hidden md:inline-flex">
                    {titleCase(c.intent)}
                  </Pill>
                ) : null}
                <span className="shrink-0 text-xs text-gray-400">{formatWhen(c.lastActivityAt)}</span>
              </ListRow>
            ))}
          </ListContainer>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-3 dark:border-white/10">
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  href={hrefWith({ page: String(page - 1) })}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200"
                >
                  Previous
                </Link>
              ) : null}
              {page < totalPages ? (
                <Link
                  href={hrefWith({ page: String(page + 1) })}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </Surface>
    </div>
  );
}
