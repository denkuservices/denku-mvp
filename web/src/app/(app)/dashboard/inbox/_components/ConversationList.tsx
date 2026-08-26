"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bot, MessagesSquare, SearchX, Star, UserCheck } from "lucide-react";
import { CHANNEL_ORDER, channelMeta, isKnownChannel, type Channel } from "@/lib/platform/channels";
import type { InboxFilter, InboxPage, InboxRow } from "@/lib/platform/readModel/inbox";
import { SearchField } from "../../_platform/ui";
import Avatar from "../../_platform/Avatar";
import ChannelBadge, { channelIcon, channelIconClass } from "../../_platform/ChannelBadge";
import { formatShortWhen } from "../../_platform/format";
import { fetchInboxPageAction } from "../_actions";
import { inbox } from "./theme";

/**
 * The Inbox list panel — the left half of the split view.
 *
 * **It is a client component on purpose.** It lives in the layout, so it stays mounted while you
 * move from one conversation to the next: your scroll position, the search you typed and the
 * filter you chose all survive selection. That persistence *is* the split view; a server-rendered
 * list would be rebuilt on every click and lose all three.
 *
 * The filters therefore live in component state rather than in the URL. Deep links still work —
 * `?channel=`, `?q=`, `?filter=` and Home's `?handling=human` are read once on mount — but typing
 * in the search box does not push a new URL, because that would re-render the conversation open
 * beside it on every keystroke.
 *
 * Channel chips are built from the channel registry (`CHANNEL_ORDER`), so a new channel appears
 * here with no edit to this file — the rule `test/channel-contract.test.ts` enforces.
 */

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 250;

type Facet = { key: string; label: string; channel?: Channel; filter?: InboxFilter };

export default function ConversationList({ initialPage }: { initialPage: InboxPage }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /** Which conversation is open beside us — the row that reads as selected. */
  const activeId = useMemo(() => {
    const m = /^\/dashboard\/inbox\/([^/?#]+)/.exec(pathname ?? "");
    return m ? decodeURIComponent(m[1]) : null;
  }, [pathname]);

  // Deep-link state, read ONCE. `handling=human` is kept because Home's "needs a person" alert
  // has been linking to it since Phase 3 and those links are already out in the world.
  const initial = useMemo(() => {
    const ch = searchParams?.get("channel") ?? "";
    const filterParam = searchParams?.get("filter") ?? "";
    const handling = searchParams?.get("handling") ?? "";
    const filter: InboxFilter =
      filterParam === "starred"
        ? "starred"
        : filterParam === "human" || handling === "human"
          ? "human"
          : "all";
    return {
      channel: isKnownChannel(ch) ? (ch as Channel) : undefined,
      search: searchParams?.get("q") ?? "",
      filter,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [channel, setChannel] = useState<Channel | undefined>(initial.channel);
  const [filter, setFilter] = useState<InboxFilter>(initial.filter);
  const [search, setSearch] = useState(initial.search);
  /** Debounced copy of `search` — what we actually query with. */
  const [query, setQuery] = useState(initial.search);

  const seeded = !initial.channel && !initial.search && initial.filter === "all";
  const [page, setPage] = useState<InboxPage>(initialPage);
  const [rows, setRows] = useState<InboxRow[]>(initialPage.rows);
  const [loading, setLoading] = useState(!seeded);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  /**
   * Every filter change refetches from the top.
   *
   * Keyed on the filters themselves rather than on a "first run" flag: the flag was flipped by
   * React's double-invoked effects in development, so the seeded first page was thrown away and
   * refetched on every load. Comparing the key the data was fetched with cannot be fooled that
   * way — a repeated effect for the same filters is a no-op.
   */
  const key = `${channel ?? ""}|${query}|${filter}`;
  const fetchedKey = useRef<string | null>(seeded ? key : null);
  useEffect(() => {
    if (fetchedKey.current === key) return;
    fetchedKey.current = key;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchInboxPageAction({ channel, search: query, filter, offset: 0, limit: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.page) {
          setPage(res.page);
          setRows(res.page.rows);
        } else {
          setFailed(true);
        }
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [key, channel, filter, query]);

  const loadMore = useCallback(() => {
    if (loadingMore || loading || !page.hasMore) return;
    setLoadingMore(true);
    fetchInboxPageAction({ channel, search: query, filter, offset: rows.length, limit: PAGE_SIZE })
      .then((res) => {
        const next = res.page;
        if (!res.ok || !next) return;
        // De-duplicate defensively: the window can shift under us while a call is in flight.
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...next.rows.filter((r) => !seen.has(r.id))];
        });
        setPage(next);
      })
      .finally(() => setLoadingMore(false));
  }, [channel, filter, query, rows.length, page.hasMore, loading, loadingMore]);

  /** Infinite scroll — the reference list has no pager, and neither does any messaging app. */
  const sentinel = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && loadMore(),
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  /**
   * Opening a conversation clears its badge here immediately; the conversation page records the
   * read on the server. Optimistic on purpose — waiting for a round-trip to un-bold a row you
   * are already looking at reads as a bug.
   */
  const clearUnread = (id: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, unread: 0 } : r)));

  /**
   * Every channel, not only the two that work.
   *
   * The chip row is how a customer reads what this inbox is *for*, and an inbox that shows only
   * Voice and Instagram reads as a voice product with a DM bolt-on. Showing the row in full says
   * what Denku is: one place for every channel a business is reachable on. Selecting a channel we
   * have not connected is answered honestly by the empty state below — never by a fabricated row.
   *
   * Registry-ordered, so a new channel appears here with no edit to this file.
   */
  const channelFacets: Facet[] = [
    { key: "all", label: "All" },
    ...CHANNEL_ORDER.map((c) => ({ key: c, label: channelMeta(c).label, channel: c })),
  ];

  /** The channel currently filtered on, when it is one we cannot receive on yet. */
  const unconnected = channel && !channelMeta(channel).adopted ? channelMeta(channel) : null;

  const hasFilters = Boolean(channel || query || filter !== "all");

  return (
    <div className={`flex h-full min-h-0 flex-col ${inbox.panel}`}>
      {/* Search + facets. Fixed head: only the rows below it scroll. */}
      <div className="shrink-0 px-3 pb-2 pt-3">
        <SearchField
          tone="filled"
          value={search}
          onChange={setSearch}
          placeholder="Search a person or a message…"
          label="Search conversations"
        />

        {/* Channel chips — registry-driven, horizontally scrollable like the reference. */}
        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1.5 [scrollbar-width:thin]">
          {channelFacets.map((f) => {
            const active = (f.channel ?? undefined) === channel;
            const Icon = f.channel ? channelIcon(f.channel) : MessagesSquare;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setChannel(f.channel)}
                aria-pressed={active}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active ? inbox.chipActive : inbox.chipIdle
                }`}
              >
                {/* The glyph keeps its brand colour whether or not the chip is on: that is how
                    the row is scannable at a glance, and it is what the reference does. */}
                <Icon className={`h-3.5 w-3.5 ${f.channel ? channelIconClass(f.channel) : ""}`} />
                {f.label}
              </button>
            );
          })}
        </div>

        {/* The two facets that are about the conversation rather than the channel. */}
        <div className="mt-1 flex gap-1.5">
          <button
            type="button"
            onClick={() => setFilter((f) => (f === "starred" ? "all" : "starred"))}
            aria-pressed={filter === "starred"}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              filter === "starred" ? inbox.chipActive : inbox.chipIdle
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${filter === "starred" ? "fill-current" : ""}`} />
            Starred
            {page.starredCount > 0 ? <span className="opacity-70">{page.starredCount}</span> : null}
          </button>

          {/* Shown only when there is something to find, so it never dangles. */}
          {page.needsPersonCount > 0 || filter === "human" ? (
            <button
              type="button"
              onClick={() => setFilter((f) => (f === "human" ? "all" : "human"))}
              aria-pressed={filter === "human"}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                filter === "human"
                  ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300"
                  : inbox.chipIdle
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              Needs a person
              <span className="opacity-70">{page.needsPersonCount}</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* The rows. */}
      <div className={`min-h-0 flex-1 overflow-y-auto border-t ${inbox.frame}`}>
        {loading ? (
          <ListSkeleton />
        ) : failed ? (
          <Notice
            icon={SearchX}
            title="Couldn't load your conversations"
            body="Something went wrong on our side. Try a different filter, or reload the page."
          />
        ) : rows.length === 0 ? (
          unconnected ? (
            // Says which channel, and what would make it work — never "no results" for something
            // that could not have had any.
            <Notice
              icon={SearchX}
              title={`${unconnected.label} isn't connected yet`}
              body={`${unconnected.description} Connect it from Channels and its conversations land here.`}
              action={{ label: "Go to Channels", href: "/dashboard/channels" }}
            />
          ) : hasFilters ? (
            <Notice
              icon={SearchX}
              title="Nothing matches"
              body="Try another channel, clear the star filter, or search for a different name or number."
            />
          ) : (
            <Notice
              icon={MessagesSquare}
              title="No conversations yet"
              body="When your AI Employees answer a call or a message, every conversation appears here."
            />
          )
        ) : (
          <ul className={`divide-y ${inbox.rowDivider}`}>
            {rows.map((row) => (
              <ConversationRow
                key={`${row.source}:${row.id}`}
                row={row}
                active={row.id === activeId}
                onOpen={() => clearUnread(row.id)}
              />
            ))}
            <li ref={sentinel} aria-hidden="true" />
            {loadingMore ? (
              <li className={`px-4 py-3 text-center text-xs ${inbox.metaFaint}`}>Loading…</li>
            ) : null}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * One conversation.
 *
 * The avatar is the anchor and the channel rides on it as a small badge — the "minik ikon" that
 * lets a person tell a phone call from a DM without reading a word. Name and time share the first
 * line; the preview and the unread count share the second, exactly as every messaging list does.
 */
function ConversationRow({
  row,
  active,
  onOpen,
}: {
  row: InboxRow;
  active: boolean;
  onOpen: () => void;
}) {
  const name = row.displayName || row.handle || "Unknown contact";
  const preview = row.summary || (row.employeeName ? `Handled by ${row.employeeName}` : "—");

  return (
    <li>
      <Link
        href={`/dashboard/inbox/${row.id}`}
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className={`flex items-center gap-3 px-3 py-3 transition ${active ? inbox.rowActive : inbox.rowIdle}`}
      >
        <span className="relative shrink-0">
          <Avatar name={row.displayName} seed={row.handle || row.id} size="md" />
          <ChannelBadge
            channel={row.channel}
            compact
            className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white dark:ring-[#111B21]"
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${inbox.strong}`}>
              {name}
            </span>
            <HandledChip handling={row.handling} />
            <span className={`shrink-0 text-[11px] tabular-nums ${inbox.metaFaint}`}>
              {formatShortWhen(row.lastActivityAt)}
            </span>
          </span>

          <span className="mt-0.5 flex items-center gap-2">
            {/* An unread row states itself twice — the count, and the weight of the line it
                belongs to — because the count is easy to miss while scanning a column. */}
            <span
              className={`min-w-0 flex-1 truncate text-[13px] ${
                row.unread > 0 ? `font-medium ${inbox.strong}` : inbox.meta
              }`}
            >
              {preview}
            </span>
            {row.starred ? (
              <Star className="h-3.5 w-3.5 shrink-0 fill-[#F5B301] text-[#F5B301]" aria-label="Starred" />
            ) : null}
            {row.unread > 0 ? (
              <span
                className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${inbox.unread}`}
              >
                {row.unread}
                <span className="sr-only"> unread</span>
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Who is on this conversation. Quiet by design — it repeats down the whole column. */
function HandledChip({ handling }: { handling: "ai" | "human" }) {
  if (handling === "human") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
        <UserCheck className="h-3 w-3" />
        You
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-white/10 dark:text-[#8696A0]">
      <Bot className="h-3 w-3" />
      AI
    </span>
  );
}

function Notice({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10">
        <Icon className="h-5 w-5 text-gray-400" />
      </span>
      <p className={`text-sm font-semibold ${inbox.strong}`}>{title}</p>
      <p className={`mt-1 max-w-[15rem] text-xs ${inbox.meta}`}>{body}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-3 inline-flex items-center rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-95"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/** Row-shaped placeholders, so the list does not jump when the real rows arrive. */
function ListSkeleton() {
  return (
    <ul className={`divide-y ${inbox.rowDivider}`} aria-hidden="true">
      {Array.from({ length: 7 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-3">
          <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-gray-100 dark:bg-white/10" />
          <span className="min-w-0 flex-1">
            <span className="block h-3 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-white/10" />
            <span className="mt-2 block h-3 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-white/10" />
          </span>
        </li>
      ))}
    </ul>
  );
}
