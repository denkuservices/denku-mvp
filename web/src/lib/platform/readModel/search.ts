import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { channelMeta } from "@/lib/platform/channels";
import { listInboxPage } from "@/lib/platform/readModel/inbox";
import { listRequestViews } from "@/lib/platform/readModel/requests";
import type { LeadRow } from "@/lib/platform/readModel/contacts";
import {
  EMPTY_SEARCH_RESULTS,
  SEARCH_GROUP_SIZE as GROUP_SIZE,
  SEARCH_MIN_LENGTH as MIN_LENGTH,
  type SearchHit,
  type SearchResults,
} from "@/lib/platform/readModel/searchTypes";

/**
 * Workspace search — the topbar's search field, and the only search that spans the product.
 *
 * **Why a read model rather than a query per surface.** A person typing a customer's name into
 * the topbar does not know whether that name lives on a conversation, a contact or a request;
 * they know the name. So the three are searched together and returned grouped, each row already
 * carrying the URL it opens. Nothing here invents an index: conversations reuse the Inbox's own
 * search, requests reuse the Requests list's, and contacts are the one new query — a single
 * org-scoped `ILIKE` over the columns a person would actually type.
 *
 * Bounded on purpose. Every group is capped, every branch is independently try/caught, and a
 * group that fails comes back empty rather than failing the search: a broken tickets table must
 * not stop you finding a customer.
 */

export type {
  SearchHitKind,
  SearchHit,
  SearchResults,
} from "@/lib/platform/readModel/searchTypes";
export {
  SEARCH_MIN_LENGTH,
  SEARCH_GROUP_SIZE,
} from "@/lib/platform/readModel/searchTypes";

/**
 * A safe `ILIKE` pattern for PostgREST's `or=` filter.
 *
 * That filter is a comma-separated list inside parentheses, so a comma, a paren or a backslash
 * in the typed text would end the filter early and silently change WHICH columns are searched —
 * and `%`/`_`/`*` are wildcards that would widen it. They are stripped rather than escaped:
 * someone searching for a literal comma is not a case worth a parser, and stripping fails
 * towards "fewer results", never towards "someone else's rows".
 */
export function searchPattern(raw: string): string {
  return `*${raw.replace(/[,()\\%_*]/g, " ").trim()}*`;
}

function trimLine(value: string | null | undefined, max = 120): string | null {
  const v = (value ?? "").replace(/\s+/g, " ").trim();
  if (!v) return null;
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

async function searchContacts(
  orgId: string,
  raw: string,
  limit: number,
  db: SupabaseClient
): Promise<SearchHit[]> {
  const pattern = searchPattern(raw);
  // A pattern of only wildcards would match the whole table — that is a listing, not a search.
  if (pattern === "**") return [];

  try {
    const { data } = await db
      .from("leads")
      .select("id, name, phone, email, source, status, notes, created_at, updated_at")
      .eq("org_id", orgId)
      .or(`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(limit);

    // Sliced as well as `.limit()`-ed: the cap is a property of this panel, not a favour the
    // database does us, and it must hold whatever the query layer hands back.
    return ((data ?? []) as LeadRow[]).slice(0, limit).map((row) => ({
      kind: "contact" as const,
      id: row.id,
      title: trimLine(row.name) ?? row.phone ?? row.email ?? "Contact",
      subtitle: trimLine([row.phone, row.email].filter(Boolean).join(" · ")),
      meta: trimLine(row.status, 24),
      href: `/dashboard/crm/contacts/${row.id}`,
    }));
  } catch (err) {
    console.error("[PLATFORM][SEARCH][CONTACTS]", err instanceof Error ? err.message : String(err));
    return [];
  }
}

async function searchConversations(
  orgId: string,
  userId: string,
  raw: string,
  limit: number,
  db: SupabaseClient
): Promise<SearchHit[]> {
  try {
    const page = await listInboxPage(orgId, userId, { search: raw, limit }, db);
    return page.rows.map((row) => ({
      kind: "conversation" as const,
      id: row.id,
      title: row.displayName ?? row.handle ?? "Unknown contact",
      subtitle: trimLine(row.summary),
      meta: channelMeta(row.channel).label,
      href: `/dashboard/inbox/${row.id}`,
    }));
  } catch (err) {
    console.error("[PLATFORM][SEARCH][CONVERSATIONS]", err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * Requests match in memory over a recent window, because that is how the Requests list itself
 * filters (`filterRequests`). Two tables, two shapes, one text filter — pushing it into the
 * database would mean two hand-written `or=` filters that could drift from the list's own
 * behaviour, so the search you get from the topbar is exactly the search you get on the page.
 */
async function searchRequests(
  orgId: string,
  raw: string,
  limit: number,
  db: SupabaseClient
): Promise<SearchHit[]> {
  try {
    const { items } = await listRequestViews(orgId, { search: raw, limit: 200 }, db);
    return items.slice(0, limit).map((r) => ({
      kind: "request" as const,
      id: r.id,
      title: r.title,
      subtitle: trimLine(r.body) ?? trimLine(r.status, 40),
      meta: r.type === "appointment" ? "Appointment" : "Ticket",
      href: r.href,
    }));
  } catch (err) {
    console.error("[PLATFORM][SEARCH][REQUESTS]", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function searchWorkspace(
  orgId: string,
  userId: string,
  rawQuery: string,
  opts: { groupSize?: number } = {},
  db: SupabaseClient = supabaseAdmin
): Promise<SearchResults> {
  const query = (rawQuery ?? "").trim();
  if (!orgId || query.length < MIN_LENGTH) return EMPTY_SEARCH_RESULTS(query);

  const groupSize = opts.groupSize ?? GROUP_SIZE;

  const [conversations, contacts, requests] = await Promise.all([
    searchConversations(orgId, userId, query, groupSize, db),
    searchContacts(orgId, query, groupSize, db),
    searchRequests(orgId, query, groupSize, db),
  ]);

  return {
    query,
    conversations,
    contacts,
    requests,
    total: conversations.length + contacts.length + requests.length,
  };
}
