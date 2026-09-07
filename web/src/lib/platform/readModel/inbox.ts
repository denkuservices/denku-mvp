import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Channel } from "@/lib/platform/channels";
import { isKnownChannel } from "@/lib/platform/channels";
import {
  collapseByContact,
  listConversationPage,
  listConversationViews,
  filterConversationViews,
} from "@/lib/platform/readModel/conversations";
import type { ConversationView } from "@/lib/platform/readModel/types";
import { listHumanHandledRefs } from "@/lib/platform/handling";
import { listStarredRefs, starsAvailable } from "@/lib/platform/stars";
import { getReadStates, isUnread } from "@/lib/platform/reads";

/**
 * The Inbox list read model (Inbox v2).
 *
 * The redesigned Inbox is a split view: one persistent list beside one conversation. Its rows
 * carry four things the conversations read model does not hold on its own — the contact's NAME,
 * whether it is starred, whether a person owns it, and whether the viewer has read it — and each
 * of those lives in a different table. Composing them once, here, is what keeps the list
 * component free of data plumbing and keeps the queries it takes to a fixed number **regardless
 * of page size** (no per-row lookups).
 *
 * Everything degrades independently and silently: no stars table → no stars; no reads table → no
 * unread badges (never "everything unread"); no leads row → the handle stands in for the name.
 * The list must render for an org whose extra tables were never migrated.
 */

export type InboxFilter = "all" | "starred" | "human";

export interface InboxQuery {
  channel?: Channel;
  search?: string;
  filter?: InboxFilter;
  limit?: number;
  offset?: number;
}

export interface InboxRow {
  id: string;
  source: ConversationView["source"];
  channel: Channel;
  /** The contact's name when we hold one — never invented from a phone number. */
  displayName: string | null;
  /** Channel-native handle: E.164 phone, @username. */
  handle: string | null;
  summary: string | null;
  lastActivityAt: string | null;
  intent: string | null;
  employeeName: string | null;
  /** Who owns the conversation right now — drives the row's "AI" vs "Person" chip. */
  handling: "ai" | "human";
  starred: boolean;
  /**
   * New messages for THIS viewer since they last opened it. 0 when read, and 0 (not "all") when
   * the reads table is unavailable — an inbox that shouts because a migration is missing is
   * worse than one that stays quiet.
   */
  unread: number;
  /**
   * How many conversations this row stands for — 1 for most, higher for a customer who has been
   * in touch before on this channel. The row itself opens the newest.
   */
  mergedCount: number;
}

export interface InboxPage {
  rows: InboxRow[];
  /** Matching conversations within the scanned window. */
  total: number;
  /** True when the scan hit its bound, so `total` is a floor, not an exact count (R-018). */
  bounded: boolean;
  /** Whether another page exists after this one — drives the list's infinite scroll. */
  hasMore: boolean;
  /** Facet counts for the filter chips. */
  starredCount: number;
  needsPersonCount: number;
  /** False when the stars migration is not applied — the star control goes read-only. */
  canStar: boolean;
}

export const INBOX_PAGE_SIZE = 25;

/** How many chat messages we scan when counting unread per conversation. */
const UNREAD_MESSAGE_SCAN = 500;

const EMPTY_PAGE: InboxPage = {
  rows: [],
  total: 0,
  bounded: false,
  hasMore: false,
  starredCount: 0,
  needsPersonCount: 0,
  canStar: false,
};

/**
 * Names for the contacts behind a page of conversations, in ONE query.
 *
 * The conversations read model leaves `displayName` null for voice — it maps `calls.lead_id`
 * without joining — so every row in the old Inbox read "Unknown contact" even for callers the
 * CRM knows by name. The name is real data sitting one lookup away, and the split view puts it
 * where a person actually recognises the conversation, so it is resolved here rather than faked
 * or dropped.
 */
async function contactNames(
  orgId: string,
  contactIds: string[],
  db: SupabaseClient
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(new Set(contactIds.filter(Boolean)));
  if (!orgId || ids.length === 0) return out;

  try {
    const { data } = await db.from("leads").select("id, name").eq("org_id", orgId).in("id", ids);
    for (const row of (data ?? []) as Array<{ id: string; name: string | null }>) {
      const name = (row.name ?? "").trim();
      if (name) out.set(row.id, name);
    }
  } catch {
    /* non-fatal — the handle stands in for the name */
  }
  return out;
}

/**
 * Unread message counts for the chat conversations on this page, in ONE query.
 *
 * Voice is not counted here: a call is a single event, so an unread call is "1" — counting its
 * transcript turns would print "23 unread" for one two-minute phone call, which is a number
 * about our storage rather than about the customer.
 */
async function chatUnreadCounts(
  orgId: string,
  refs: string[],
  reads: Map<string, string>,
  db: SupabaseClient
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!orgId || refs.length === 0) return out;

  try {
    const { data, error } = await db
      .from("messages")
      .select("conversation_id, direction, created_at")
      .eq("org_id", orgId)
      .in("conversation_id", refs)
      .order("created_at", { ascending: false })
      .limit(UNREAD_MESSAGE_SCAN);
    if (error) return out;

    for (const m of (data ?? []) as Array<{
      conversation_id: string;
      direction: string | null;
      created_at: string;
    }>) {
      // Only what the CUSTOMER sent is "unread" — our own replies are not news to us.
      if (m.direction === "outbound") continue;
      const watermark = reads.get(m.conversation_id);
      if (watermark && Date.parse(m.created_at) <= Date.parse(watermark)) continue;
      out.set(m.conversation_id, (out.get(m.conversation_id) ?? 0) + 1);
    }
  } catch {
    /* non-fatal — callers fall back to a single-unit badge */
  }
  return out;
}

/**
 * One page of Inbox rows.
 *
 * `userId` is the viewer: unread is per person. Pass an empty string for an unauthenticated
 * caller and every row simply comes back read.
 */
export async function listInboxPage(
  orgId: string,
  userId: string,
  query: InboxQuery = {},
  db: SupabaseClient = supabaseAdmin
): Promise<InboxPage> {
  if (!orgId) return EMPTY_PAGE;

  const limit = query.limit ?? INBOX_PAGE_SIZE;
  const offset = Math.max(0, query.offset ?? 0);
  const channel = query.channel && isKnownChannel(query.channel) ? query.channel : undefined;
  const search = (query.search ?? "").trim();
  const filter: InboxFilter = query.filter ?? "all";

  /**
   * Both facet sets are needed on EVERY request, not just when their filter is on: the chips show
   * counts, and each row needs its own star/owner state regardless of how it was found.
   *
   * **They do not have to be waited for first, though.** Measured on production data: the Inbox's
   * first load was three sequential stages of ~240ms each, and the bytes were irrelevant — the
   * whole cost was round trips. On the default view the conversation scan does not consult these
   * sets at all (they only decorate the rows afterwards), so it runs alongside them instead of
   * behind them, and three stages become two. The `starred` and `human` filters still wait,
   * because there the refs ARE the query: those conversations are fetched by id.
   */
  const facets = Promise.all([
    listStarredRefs(orgId, db),
    listHumanHandledRefs(orgId, db),
    starsAvailable(orgId, db),
  ]);

  let items: ConversationView[];
  let total: number;
  let bounded: boolean;
  let starred: Awaited<ReturnType<typeof listStarredRefs>>;
  let human: Awaited<ReturnType<typeof listHumanHandledRefs>>;
  let canStar: boolean;

  if (filter === "all") {
    const [facetResult, page] = await Promise.all([
      facets,
      listConversationPage(orgId, { channel, search, limit, offset }, db),
    ]);
    [starred, human, canStar] = facetResult;
    items = page.items;
    total = page.total;
    bounded = page.bounded;
  } else {
    [starred, human, canStar] = await facets;

    if (filter === "starred") {
      /**
       * Starred conversations are fetched BY ID, never scanned.
       *
       * A star is most useful on something old — the conversation flagged last month is precisely
       * the one a recent-window scan would miss, and a "Starred" filter that hides starred things
       * is worse than no filter. Same reasoning as `handling: "human"` in `listConversationPage`.
       */
      const refs = Array.from(starred.refs);
      if (refs.length === 0) {
        return { ...EMPTY_PAGE, needsPersonCount: human.refs.size, canStar };
      }
      const fetched = await listConversationViews(orgId, { channel, ids: refs, limit: refs.length }, db);
      const filtered = collapseByContact(filterConversationViews(fetched, { search }));
      items = filtered.slice(offset, offset + limit);
      total = filtered.length;
      bounded = false;
    } else {
      const page = await listConversationPage(
        orgId,
        {
          channel,
          search,
          handling: "human",
          humanHandledRefs: human.refs,
          limit,
          offset,
        },
        db
      );
      items = page.items;
      total = page.total;
      bounded = page.bounded;
    }
  }

  /*
   * A collapsed row answers for everything inside it.
   *
   * The list shows the newest call of a group, so a star or an unread mark that lives on an
   * OLDER member would simply vanish — the owner flags a conversation, the customer rings again,
   * and the flag is gone. So every member id is looked up, and the row carries the strongest
   * answer any of them gives: starred if any is starred, unread if any is unread, handled by a
   * person if any is.
   */
  const memberIds = (c: ConversationView): string[] =>
    ((c.meta.mergedIds as string[] | undefined) ?? [c.id]);
  const refs = items.flatMap(memberIds);
  const { reads, available: readsAvailable } = await getReadStates(orgId, userId, refs, db);

  const [names, chatUnread] = await Promise.all([
    contactNames(
      orgId,
      items.map((c) => c.contact.id ?? "").filter(Boolean),
      db
    ),
    chatUnreadCounts(
      orgId,
      items.filter((c) => c.source === "conversations").flatMap(memberIds),
      reads,
      db
    ),
  ]);

  const rows: InboxRow[] = items.map((c) => {
    const members = memberIds(c);
    // The most recent time this viewer opened ANY member — reading the newest call is what
    // clears the row, and an older one they never opened must not keep it bold forever.
    const lastRead = members
      .map((id) => reads.get(id) ?? null)
      .filter((t): t is string => Boolean(t))
      .sort()
      .pop() ?? null;
    const unreadNow = isUnread(c.lastActivityAt, lastRead, readsAvailable);
    const counted = members.reduce((n, id) => n + (chatUnread.get(id) ?? 0), 0);
    return {
      id: c.id,
      source: c.source,
      channel: c.channel,
      displayName: c.contact.displayName ?? (c.contact.id ? names.get(c.contact.id) ?? null : null),
      handle: c.contact.handle,
      summary: c.summary,
      lastActivityAt: c.lastActivityAt,
      intent: c.intent,
      employeeName: c.employeeName,
      handling: members.some((id) => human.refs.has(id)) ? "human" : "ai",
      starred: members.some((id) => starred.refs.has(id)),
      mergedCount: members.length,
      // A voice call is one event; a chat thread counts its unseen inbound messages, falling
      // back to a single unit when the message scan could not resolve them.
      unread: unreadNow ? (c.source === "conversations" ? Math.max(1, counted) : 1) : 0,
    };
  });

  return {
    rows,
    total,
    bounded,
    hasMore: offset + rows.length < total,
    starredCount: starred.refs.size,
    needsPersonCount: human.refs.size,
    canStar,
  };
}
