import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseTranscriptTurns } from "@/lib/platform/adapters/voice";
import type {
  ConversationView,
  ConversationDetailView,
  ConversationTurn,
  ArtifactRef,
} from "@/lib/platform/readModel/types";
import type { Channel } from "@/lib/platform/channels";

/**
 * Conversations read model (Sprint 5, P0).
 *
 * Presents interactions as channel-agnostic ConversationViews sourced from where the data
 * actually lives TODAY (decoupled from PLATFORM_MODEL_ENABLED):
 *   - **voice**     ← `calls` (always populated; the authoritative voice history)
 *   - **instagram** ← `conversations` WHERE channel='instagram' (populated once dual-write
 *                      is on; empty otherwise — IG has no real prod data yet regardless)
 * These sources are DISJOINT (voice never in `conversations` for reads), so no double count.
 * At read-cutover (R-085) the voice source swaps to `conversations` with no UI/type change.
 *
 * Pure row→view mappers are exported for unit testing; the async functions just fetch +map.
 * Org-scoped; never throws (returns [] / null on error).
 */

const SUMMARY_LEN = 140;

function preview(text: string | null | undefined): string | null {
  const t = (text ?? "").trim().replace(/\s+/g, " ");
  if (!t) return null;
  return t.length > SUMMARY_LEN ? `${t.slice(0, SUMMARY_LEN)}…` : t;
}

// --- pure mappers -----------------------------------------------------------

export interface CallRow {
  id: string;
  agent_id: string | null;
  from_phone: string | null;
  lead_id: string | null;
  intent: string | null;
  outcome: string | null;
  completion_state: string | null;
  transcript: string | null;
  duration_seconds: number | null;
  direction: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export function callRowToConversationView(
  row: CallRow,
  employeeName: string | null
): ConversationView {
  return {
    id: row.id,
    channel: "voice",
    employeeId: row.agent_id,
    employeeName,
    contact: { id: row.lead_id, displayName: null, handle: row.from_phone },
    status: row.completion_state ?? row.outcome ?? null,
    intent: row.intent,
    startedAt: row.started_at,
    lastActivityAt: row.ended_at ?? row.started_at ?? row.created_at,
    summary: preview(row.transcript),
    meta: {
      durationSeconds: row.duration_seconds ?? null,
      direction: row.direction ?? null,
      outcome: row.outcome ?? null,
    },
    source: "calls",
  };
}

export interface ConversationRow {
  id: string;
  channel: string;
  agent_id: string | null;
  contact_id: string | null;
  external_user_id: string | null;
  status: string | null;
  last_message_at: string | null;
  created_at: string;
}

export function conversationRowToConversationView(
  row: ConversationRow,
  employeeName: string | null
): ConversationView {
  return {
    id: row.id,
    channel: (row.channel as Channel) ?? "instagram",
    employeeId: row.agent_id,
    employeeName,
    contact: { id: row.contact_id, displayName: null, handle: row.external_user_id },
    status: row.status,
    intent: null,
    startedAt: row.created_at,
    lastActivityAt: row.last_message_at ?? row.created_at,
    summary: null,
    meta: {},
    source: "conversations",
  };
}

/** Sort newest-activity first; nulls last. Pure. */
export function sortByActivityDesc(a: ConversationView, b: ConversationView): number {
  const av = a.lastActivityAt ? Date.parse(a.lastActivityAt) : -Infinity;
  const bv = b.lastActivityAt ? Date.parse(b.lastActivityAt) : -Infinity;
  return bv - av;
}

// --- employee name map ------------------------------------------------------

async function employeeNames(
  orgId: string,
  db: SupabaseClient
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { data } = await db.from("agents").select("id, name").eq("org_id", orgId);
    for (const a of (data ?? []) as Array<{ id: string; name: string }>) map.set(a.id, a.name);
  } catch {
    /* non-fatal — names are optional */
  }
  return map;
}

// --- list -------------------------------------------------------------------

export interface ListConversationsOpts {
  channel?: Channel;
  limit?: number;
  /** Free-text match over contact handle/name, summary and intent. */
  search?: string;
  /** Inclusive ISO date bounds on last activity. */
  from?: string;
  to?: string;
  /** Filter by classified intent (appointment | support | …). */
  intent?: string;
  /** Skip N results (simple offset pagination). */
  offset?: number;
  /**
   * Filter by who owns the conversation (Phase 3). Handling state lives in its own table and
   * cannot be joined here — voice and chat come from two different sources — so the caller
   * passes the human-owned ref set and this filters the already-scanned window in memory. That
   * keeps the truthful-count guarantee intact: `total` still describes the same window.
   */
  handling?: "human" | "ai";
  humanHandledRefs?: ReadonlySet<string>;
  /**
   * Restrict to one contact, **pushed into the query** (`calls.lead_id` / `conversations.contact_id`).
   *
   * The contact timeline needs every conversation for one person, not the org's most recent N
   * with that person's filtered out of them — scanning-then-filtering silently drops a
   * customer's older history once the org passes the scan limit.
   */
  contactId?: string;
  /**
   * Fetch these specific conversations by id, **pushed into the query**.
   *
   * Used by the "needs a person" filter: those conversations are identified by a separate table
   * and can be arbitrarily old, so scanning a recent window would show fewer than the count
   * promises. Fetching by id makes the badge, the list and Home's exact count agree.
   */
  ids?: string[];
}

export interface ConversationPage {
  items: ConversationView[];
  /** Total matching the filters within the scanned window (see `scanned`). */
  total: number;
  /** True when the scan hit its bound, so `total` is a floor, not an exact count (R-018). */
  bounded: boolean;
}

/** Apply search/date/intent/handling filters to already-materialized views. Pure + testable. */
export function filterConversationViews(
  views: ConversationView[],
  opts: Pick<ListConversationsOpts, "search" | "from" | "to" | "intent" | "handling" | "humanHandledRefs">
): ConversationView[] {
  const q = (opts.search ?? "").trim().toLowerCase();
  const fromTs = opts.from ? Date.parse(opts.from) : null;
  // `to` is inclusive of the whole day when a bare date is supplied.
  const toTs = opts.to ? Date.parse(opts.to) + (opts.to.length <= 10 ? 86_399_999 : 0) : null;

  return views.filter((v) => {
    if (opts.intent && (v.intent ?? "") !== opts.intent) return false;

    if (opts.handling) {
      // A conversation with no recorded state is AI-handled by default, so "human" means
      // present in the set and "ai" means absent from it.
      const isHuman = opts.humanHandledRefs?.has(v.id) ?? false;
      if (opts.handling === "human" && !isHuman) return false;
      if (opts.handling === "ai" && isHuman) return false;
    }

    if (fromTs !== null || toTs !== null) {
      const at = v.lastActivityAt ? Date.parse(v.lastActivityAt) : NaN;
      if (Number.isNaN(at)) return false;
      if (fromTs !== null && at < fromTs) return false;
      if (toTs !== null && at > toTs) return false;
    }

    if (q) {
      const haystack = [
        v.contact.displayName,
        v.contact.handle,
        v.summary,
        v.intent,
        v.employeeName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export async function listConversationViews(
  orgId: string,
  opts: ListConversationsOpts = {},
  db: SupabaseClient = supabaseAdmin
): Promise<ConversationView[]> {
  if (!orgId) return [];
  const limit = opts.limit ?? 50;
  const names = await employeeNames(orgId, db);
  const out: ConversationView[] = [];

  try {
    // Voice source (calls) unless a non-voice channel is requested.
    if (!opts.channel || opts.channel === "voice") {
      let q = db
        .from("calls")
        .select(
          "id, agent_id, from_phone, lead_id, intent, outcome, completion_state, transcript, duration_seconds, direction, started_at, ended_at, created_at"
        )
        .eq("org_id", orgId);
      // Narrow at the database — see `contactId` / `ids` on ListConversationsOpts.
      if (opts.contactId) q = q.eq("lead_id", opts.contactId);
      if (opts.ids) q = q.in("id", opts.ids);
      const { data } = await q.order("created_at", { ascending: false }).limit(limit);
      for (const r of (data ?? []) as CallRow[]) {
        out.push(callRowToConversationView(r, names.get(r.agent_id ?? "") ?? null));
      }
    }

    // Chat sources (conversations table) unless voice specifically requested.
    if (!opts.channel || opts.channel !== "voice") {
      let q = db
        .from("conversations")
        .select("id, channel, agent_id, contact_id, external_user_id, status, last_message_at, created_at")
        .eq("org_id", orgId);
      if (opts.channel) q = q.eq("channel", opts.channel);
      if (opts.contactId) q = q.eq("contact_id", opts.contactId);
      if (opts.ids) q = q.in("id", opts.ids);
      const { data } = await q
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      for (const r of (data ?? []) as ConversationRow[]) {
        out.push(conversationRowToConversationView(r, names.get(r.agent_id ?? "") ?? null));
      }
    }
  } catch (err) {
    console.error("[PLATFORM][READMODEL][CONVERSATIONS]", err instanceof Error ? err.message : String(err));
  }

  return out.sort(sortByActivityDesc).slice(0, limit);
}

/** How many conversations we scan before reporting a bounded (floor) total. */
export const CONVERSATION_SCAN_LIMIT = 500;

/**
 * Paged, filtered conversations with a **truthful** total (R-018 / audit Y-003).
 *
 * The previous UI fetched 100 rows and rendered "{n} conversations" — so an org with thousands saw
 * "100 conversations", a false statement about their own data. This scans up to
 * `CONVERSATION_SCAN_LIMIT`, applies filters, and reports `bounded` so the surface can say
 * "500+ matching" instead of inventing an exact number.
 */
export async function listConversationPage(
  orgId: string,
  opts: ListConversationsOpts = {},
  db: SupabaseClient = supabaseAdmin
): Promise<ConversationPage> {
  const pageSize = opts.limit ?? 25;
  const offset = Math.max(0, opts.offset ?? 0);
  if (!orgId) return { items: [], total: 0, bounded: false };

  /**
   * `handling: "human"` is fetched BY ID, not scanned.
   *
   * Human-handled conversations are identified by a separate table and can be arbitrarily old,
   * so scanning the most recent `CONVERSATION_SCAN_LIMIT` would show fewer than the facet count
   * promises — and fewer than Home's exact count. Fetching the exact ref set makes all three
   * agree, and the result is never bounded because it is not a window.
   *
   * `handling: "ai"` stays on the scan: "not in a small set" is not a query, and the AI-handled
   * case is the default view, where a recent window is the right behaviour anyway.
   */
  const byRefSet = opts.handling === "human";
  if (byRefSet) {
    const refs = Array.from(opts.humanHandledRefs ?? []);
    if (refs.length === 0) return { items: [], total: 0, bounded: false };

    const fetched = await listConversationViews(
      orgId,
      { channel: opts.channel, ids: refs, limit: refs.length },
      db
    );
    // Re-apply the remaining facets (search/date/intent); handling is already satisfied.
    const filtered = filterConversationViews(fetched, { ...opts, handling: undefined });
    return {
      items: filtered.slice(offset, offset + pageSize),
      total: filtered.length,
      bounded: false,
    };
  }

  const scanned = await listConversationViews(orgId, { channel: opts.channel, limit: CONVERSATION_SCAN_LIMIT }, db);
  const filtered = filterConversationViews(scanned, opts);

  return {
    items: filtered.slice(offset, offset + pageSize),
    total: filtered.length,
    bounded: scanned.length >= CONVERSATION_SCAN_LIMIT,
  };
}

// --- detail -----------------------------------------------------------------

async function artifactsForCall(
  orgId: string,
  key: { call_id?: string; conversation_id?: string },
  db: SupabaseClient
): Promise<ArtifactRef[]> {
  const refs: ArtifactRef[] = [];
  const col = key.call_id ? "call_id" : "conversation_id";
  const val = key.call_id ?? key.conversation_id!;
  try {
    const { data: tickets } = await db
      .from("tickets")
      .select("id, subject, status")
      .eq("org_id", orgId)
      .eq(col, val);
    for (const t of (tickets ?? []) as Array<{ id: string; subject: string | null; status: string | null }>) {
      refs.push({ id: t.id, type: "ticket", status: t.status, title: t.subject });
    }
    const { data: appts } = await db
      .from("appointments")
      .select("id, status, start_at")
      .eq("org_id", orgId)
      .eq(col, val);
    for (const a of (appts ?? []) as Array<{ id: string; status: string | null; start_at: string | null }>) {
      refs.push({ id: a.id, type: "appointment", status: a.status, title: a.start_at });
    }
  } catch {
    /* non-fatal */
  }
  return refs;
}

export async function getConversationView(
  orgId: string,
  id: string,
  db: SupabaseClient = supabaseAdmin
): Promise<ConversationDetailView | null> {
  if (!orgId || !id) return null;
  const names = await employeeNames(orgId, db);

  try {
    // 1) Voice (calls).
    const { data: call } = await db
      .from("calls")
      .select(
        "id, agent_id, from_phone, lead_id, intent, outcome, completion_state, transcript, duration_seconds, direction, started_at, ended_at, created_at"
      )
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle<CallRow>();

    if (call) {
      const base = callRowToConversationView(call, names.get(call.agent_id ?? "") ?? null);
      const turns: ConversationTurn[] = parseTranscriptTurns(call.transcript).map((t, i) => ({
        id: `${call.id}:${i}`,
        channel: "voice",
        role: t.role,
        direction: t.role === "assistant" ? "outbound" : t.role === "system" ? null : "inbound",
        content: t.content,
        at: call.started_at,
      }));
      const artifacts = await artifactsForCall(orgId, { call_id: call.id }, db);
      return { ...base, turns, artifacts };
    }

    // 2) Chat (conversations).
    const { data: conv } = await db
      .from("conversations")
      .select("id, channel, agent_id, contact_id, external_user_id, status, last_message_at, created_at")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle<ConversationRow>();

    if (conv) {
      const base = conversationRowToConversationView(conv, names.get(conv.agent_id ?? "") ?? null);
      const { data: msgs } = await db
        .from("messages")
        .select("id, role, content, direction, created_at")
        .eq("org_id", orgId)
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });
      const turns: ConversationTurn[] = ((msgs ?? []) as Array<{
        id: string;
        role: string;
        content: string;
        direction: string | null;
        created_at: string;
      }>).map((m) => ({
        id: m.id,
        channel: base.channel,
        role: (m.role as ConversationTurn["role"]) ?? "user",
        direction: (m.direction as ConversationTurn["direction"]) ?? null,
        content: m.content,
        at: m.created_at,
      }));
      const artifacts = await artifactsForCall(orgId, { conversation_id: conv.id }, db);
      return { ...base, turns, artifacts };
    }
  } catch (err) {
    console.error("[PLATFORM][READMODEL][CONVERSATION_DETAIL]", err instanceof Error ? err.message : String(err));
  }

  return null;
}
