import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ConversationSource } from "@/lib/platform/handling";

/**
 * Read watermarks (Inbox v2) — what each person has already seen.
 *
 * Unread is the one number on the redesigned Inbox that a business owner acts on before reading
 * anything, so it has to be a fact rather than a decoration. It is stored as a **watermark, not a
 * counter**: "everything at or before this instant has been seen by this user". A counter would
 * have to be decremented by whoever happens to open the conversation, and would drift the moment
 * two people used the same inbox; a watermark compared against the conversation's own last
 * activity cannot drift, and stays correct as new messages arrive.
 *
 * Per USER, unlike `stars.ts` and `handling.ts`: the owner having opened a conversation says
 * nothing about whether their colleague has.
 *
 * **Inert until migrated** (`20260826120000_conversation_stars_and_reads.sql`): readers fail soft
 * to "nothing recorded", which the Inbox renders as *no badges at all* rather than as "everything
 * is unread" — an inbox that shouts 181 unread on first load because a table is missing would be
 * worse than one that shows none.
 */

/** Everything this user has read, keyed by conversation ref → ISO watermark. */
export type ReadMap = Map<string, string>;

export interface ReadState {
  /** Watermarks for the refs asked about. Empty when unavailable. */
  reads: ReadMap;
  /**
   * Whether the table answered at all.
   *
   * The Inbox uses this to decide between "you have read these" and "we cannot know" — the
   * unread badge is suppressed entirely in the second case (see the note above).
   */
  available: boolean;
}

/** Watermarks for a set of conversations. Never throws. */
export async function getReadStates(
  orgId: string,
  userId: string,
  conversationRefs: string[],
  db: SupabaseClient = supabaseAdmin
): Promise<ReadState> {
  const reads: ReadMap = new Map();
  const refs = Array.from(new Set(conversationRefs.filter(Boolean)));
  if (!orgId || !userId || refs.length === 0) return { reads, available: Boolean(orgId && userId) };

  const { data, error } = await db
    .from("conversation_reads")
    .select("conversation_ref, last_read_at")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .in("conversation_ref", refs);

  if (error) {
    console.warn("[PLATFORM][READS][LIST][UNAVAILABLE]", { orgId, error: error.message });
    return { reads, available: false };
  }
  for (const row of data ?? []) reads.set(String(row.conversation_ref), String(row.last_read_at));
  return { reads, available: true };
}

/**
 * Record that this user has seen everything in a conversation up to `at` (default: now).
 *
 * Called when a conversation is opened. Idempotent — one row per user per conversation, and
 * re-opening simply moves the watermark forward. Returns a clean `{ ok: false }` when the table
 * is missing, because failing to remember a read must never break opening a conversation.
 */
export async function markRead(
  params: {
    orgId: string;
    userId: string;
    conversationRef: string;
    source: ConversationSource;
    at?: string;
  },
  db: SupabaseClient = supabaseAdmin
): Promise<{ ok: boolean; error?: string }> {
  const { orgId, userId, conversationRef } = params;
  if (!orgId || !userId || !conversationRef) return { ok: false, error: "missing_conversation" };

  const at = params.at ?? new Date().toISOString();
  const { error } = await db.from("conversation_reads").upsert(
    {
      org_id: orgId,
      user_id: userId,
      conversation_ref: conversationRef,
      source: params.source,
      last_read_at: at,
      updated_at: at,
    },
    { onConflict: "org_id,user_id,conversation_ref" }
  );

  if (error) {
    console.warn("[PLATFORM][READS][WRITE][FAILED]", { orgId, error: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * When read tracking began.
 *
 * Nothing older than this can be unread, because we hold no read history from before the table
 * existed. Without this rule, the day the migration is applied every conversation an org has ever
 * had turns into an unread badge at once — a shop with 181 archived calls would open the Inbox to
 * 181 alerts about calls it answered months ago. That is not a fact about their data; it is an
 * artefact of when we started recording, and the honest thing to say about the past is nothing.
 *
 * Matches the migration's own date (`20260826120000_conversation_stars_and_reads.sql`).
 */
export const UNREAD_TRACKING_SINCE = "2026-08-26T00:00:00.000Z";

/**
 * Is this conversation unread for this user? Pure, so the rule lives in one testable place.
 *
 * A conversation with no watermark counts as unread ONLY if we know the table answered — see
 * `ReadState.available`; the caller passes `available: false` and gets `false` for everything.
 */
export function isUnread(
  lastActivityAt: string | null | undefined,
  lastReadAt: string | null | undefined,
  available = true
): boolean {
  if (!available) return false;
  if (!lastActivityAt) return false;
  // Predates tracking: silent, whether or not a watermark exists.
  if (Date.parse(lastActivityAt) < Date.parse(UNREAD_TRACKING_SINCE)) return false;
  if (!lastReadAt) return true;
  const activity = Date.parse(lastActivityAt);
  const read = Date.parse(lastReadAt);
  if (Number.isNaN(activity) || Number.isNaN(read)) return false;
  return activity > read;
}
