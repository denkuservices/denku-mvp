import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Channel } from "@/lib/platform/channels";
import type { ConversationView } from "@/lib/platform/readModel/types";
import { listRequestViews, type RequestView } from "@/lib/platform/readModel/requests";
import { listContactNotes, type ContactNote } from "@/lib/platform/contactNotes";

/**
 * Contact timeline (Phase 4) — the spine of the CRM.
 *
 * One reverse-chronological stream of everything that has happened with a person, across every
 * channel and every record type: conversations (voice + chat), the requests they produced, and
 * the notes a human left. This is the "CRM as shared memory" promise made concrete — the arc
 * `IG DM → contact created → AI qualifies → voice call → appointment booked` reads as one
 * journey rather than four unrelated tables.
 *
 * **The merge is pure** (`buildTimeline`), so ordering and grouping are testable without a
 * database. The async wrapper only fetches.
 *
 * Honest by construction: entries are only ever built from records that exist. There is no
 * synthesized "contact created" or "lead scored" entry — if we did not observe it, it is not on
 * the timeline.
 */

export type TimelineKind = "conversation" | "call" | "request" | "note";

/** A voice call, as the timeline needs it. */
export interface TimelineCall {
  id: string;
  startedAt: string | null;
  durationSeconds: number | null;
  direction: string | null;
  outcome: string | null;
  intent: string | null;
}

export interface TimelineEntry {
  /** Stable within a timeline — `${kind}:${id}`. */
  key: string;
  kind: TimelineKind;
  /** ISO timestamp the entry is ordered by. Entries without one are dropped, not guessed. */
  at: string;
  title: string;
  /** Secondary line: summary, status, or note body. */
  detail: string | null;
  /** Present for conversations; drives the channel badge. */
  channel: Channel | null;
  /** Where clicking the entry goes, when it has a destination. */
  href: string | null;
  /** Request status / conversation intent — rendered as a pill when present. */
  badge: string | null;
}

/** "4 min", "45 sec" — never "0:00", which reads as a bug rather than a very short call. */
function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 60) return `${seconds} sec`;
  return `${Math.round(seconds / 60)} min`;
}

/**
 * A phone call, on its own.
 *
 * Calls used to reach the timeline only when they produced a request — and since a call is now
 * only turned into a ticket when a person actually has something to do, that means an answered,
 * fully-resolved call left NO trace on the customer it was with. The most common good outcome
 * was the most invisible one, which is the opposite of what a CRM is for.
 */
function callEntry(call: TimelineCall, linkedRequest: RequestView | null): TimelineEntry | null {
  const at = call.startedAt;
  if (!at) return null;

  const inbound = (call.direction ?? "inbound") !== "outbound";
  const duration = formatDuration(call.durationSeconds);

  // The request is folded in rather than listed twice: one real-world event, one row.
  const detail = linkedRequest
    ? `${duration ? `${duration} · ` : ""}${linkedRequest.title}`
    : duration;

  return {
    key: `call:${call.id}`,
    kind: "call",
    at,
    title: inbound ? "Called in" : "We called",
    detail: detail ?? null,
    channel: "voice",
    // The request is the more useful destination when there is one — it carries the transcript
    // and everything a person would act on.
    href: linkedRequest?.href ?? `/dashboard/calls/${call.id}`,
    badge: linkedRequest?.status ?? call.intent ?? null,
  };
}

function conversationEntry(c: ConversationView): TimelineEntry | null {
  const at = c.lastActivityAt ?? c.startedAt;
  if (!at) return null;
  return {
    key: `conversation:${c.source}:${c.id}`,
    kind: "conversation",
    at,
    title: c.employeeName ? `Conversation with ${c.employeeName}` : "Conversation",
    detail: c.summary,
    channel: c.channel,
    href: `/dashboard/inbox/${c.id}`,
    badge: c.intent,
  };
}

function requestEntry(r: RequestView): TimelineEntry | null {
  if (!r.createdAt) return null;
  return {
    key: `request:${r.type}:${r.id}`,
    kind: "request",
    at: r.createdAt,
    title: r.title || (r.type === "appointment" ? "Appointment request" : "Request"),
    detail: null,
    channel: null,
    href: r.href,
    badge: r.status,
  };
}

function noteEntry(n: ContactNote): TimelineEntry {
  return {
    key: `note:${n.id}`,
    kind: "note",
    at: n.createdAt,
    title: "Note",
    detail: n.body,
    channel: null,
    href: null,
    badge: null,
  };
}

/**
 * Merge the sources into one reverse-chronological stream. Pure + testable.
 *
 * Entries with no usable timestamp are **dropped rather than placed at an arbitrary position** —
 * a timeline whose order is partly invented is worse than one that is short.
 */
export function buildTimeline(input: {
  conversations: ConversationView[];
  calls?: TimelineCall[];
  requests: RequestView[];
  notes: ContactNote[];
}): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const calls = input.calls ?? [];

  // A request that came from a call is shown ON the call, not beside it. Two rows a second apart
  // describing one phone call is noise, and the call is the thing that actually happened.
  const requestByCall = new Map<string, RequestView>();
  for (const r of input.requests) {
    if (r.callId) requestByCall.set(r.callId, r);
  }

  for (const c of input.conversations) {
    const e = conversationEntry(c);
    if (e) entries.push(e);
  }
  for (const call of calls) {
    const e = callEntry(call, requestByCall.get(call.id) ?? null);
    if (e) entries.push(e);
  }
  for (const r of input.requests) {
    // Already folded into its call above. Folding is an optimisation — a request whose call is
    // NOT on this timeline still gets its own row rather than disappearing.
    if (r.callId && calls.some((c) => c.id === r.callId)) continue;
    const e = requestEntry(r);
    if (e) entries.push(e);
  }
  for (const n of input.notes) entries.push(noteEntry(n));

  return entries.sort((a, b) => {
    const diff = Date.parse(b.at) - Date.parse(a.at);
    // Deterministic tie-break so equal timestamps never reorder between renders.
    return diff !== 0 ? diff : a.key.localeCompare(b.key);
  });
}

/**
 * Every call this person made, newest first.
 *
 * Keyed on `lead_id` because that is where voice identity still lives (the `contacts` backfill is
 * R-081) — the same choice `lib/platform/recall.ts` makes, and for the same reason. Capped: a
 * timeline is read, not audited, and the calls page holds the whole history.
 */
export async function listContactCalls(
  orgId: string,
  contactRef: string,
  db: SupabaseClient = supabaseAdmin,
  limit = 50
): Promise<TimelineCall[]> {
  const { data, error } = await db
    .from("calls")
    .select("id, started_at, duration_seconds, direction, outcome, intent")
    .eq("org_id", orgId)
    .eq("lead_id", contactRef)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    startedAt: (row.started_at as string | null) ?? null,
    durationSeconds: (row.duration_seconds as number | null) ?? null,
    direction: (row.direction as string | null) ?? null,
    outcome: (row.outcome as string | null) ?? null,
    intent: (row.intent as string | null) ?? null,
  }));
}

/**
 * Fetch and merge a contact's timeline. Never throws — each source degrades independently, so a
 * missing notes table (not yet migrated) costs the notes, not the timeline.
 */
export async function getContactTimeline(
  orgId: string,
  contactRef: string,
  conversations: ConversationView[],
  db: SupabaseClient = supabaseAdmin
): Promise<TimelineEntry[]> {
  if (!orgId || !contactRef) return [];

  const [requests, notes, calls] = await Promise.all([
    // `contactId` is pushed into the query, so this is EVERY request for this person — not the
    // org's most recent N with theirs filtered out of it.
    listRequestViews(orgId, { contactId: contactRef }, db)
      .then((r) => r.items)
      .catch(() => [] as RequestView[]),
    listContactNotes(orgId, contactRef, db).catch(() => [] as ContactNote[]),
    listContactCalls(orgId, contactRef, db).catch(() => [] as TimelineCall[]),
  ]);

  return buildTimeline({ conversations, calls, requests, notes });
}
