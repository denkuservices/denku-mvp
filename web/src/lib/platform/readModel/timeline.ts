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

export type TimelineKind = "conversation" | "request" | "note";

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
  requests: RequestView[];
  notes: ContactNote[];
}): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const c of input.conversations) {
    const e = conversationEntry(c);
    if (e) entries.push(e);
  }
  for (const r of input.requests) {
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

  const [requests, notes] = await Promise.all([
    // `contactId` is pushed into the query, so this is EVERY request for this person — not the
    // org's most recent N with theirs filtered out of it.
    listRequestViews(orgId, { contactId: contactRef }, db)
      .then((r) => r.items)
      .catch(() => [] as RequestView[]),
    listContactNotes(orgId, contactRef, db).catch(() => [] as ContactNote[]),
  ]);

  return buildTimeline({ conversations, requests, notes });
}
