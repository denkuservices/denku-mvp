import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Channel } from "@/lib/platform/channels";
import type { ConversationSource } from "@/lib/platform/handling";

/**
 * Conversation stars (Inbox v2) — the org's own flag on a conversation, on any channel.
 *
 * A star means "this one matters, keep it findable" and belongs to the BUSINESS, not to the
 * person who clicked it: two people looking at the same inbox must see the same flags. That is
 * why there is no `user_id` here — only a `created_by` breadcrumb.
 *
 * Channel-agnostic by construction, exactly like `handling.ts`: keyed on the read model's stable
 * conversation id, so voice (sourced from `calls`) and chat (sourced from `conversations`) behave
 * identically and a new channel inherits starring with no work.
 *
 * The table is RLS-locked and service-role only, so **every query here carries an explicit
 * `org_id` filter** — there is no safety net under the service-role client.
 *
 * **Inert until migrated.** `20260826120000_conversation_stars_and_reads.sql` may not be applied
 * yet, so readers fail soft to "nothing is starred" and writers report a clean failure. The Inbox
 * must render either way: a missing table degrades the star control, never the conversation.
 */

/** How many starred refs we load at once. Also the "N+" threshold in the UI. */
export const STARRED_REF_LIMIT = 500;

export interface StarredRefs {
  refs: Set<string>;
  /** True when the cap was hit, so `refs.size` is a floor — surface it as "N+", never as N. */
  bounded: boolean;
}

/**
 * Every conversation this org has starred.
 *
 * One set drives BOTH the facet count and the rows the "Starred" filter returns — the Inbox
 * fetches those conversations *by id* rather than scanning a recent window, so a star put on an
 * old conversation never disappears from its own filter.
 */
export async function listStarredRefs(
  orgId: string,
  db: SupabaseClient = supabaseAdmin,
  limit = STARRED_REF_LIMIT
): Promise<StarredRefs> {
  const empty: StarredRefs = { refs: new Set<string>(), bounded: false };
  if (!orgId) return empty;

  const { data, error } = await db
    .from("conversation_stars")
    .select("conversation_ref")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[PLATFORM][STARS][LIST][UNAVAILABLE]", { orgId, error: error.message });
    return empty;
  }
  const refs = new Set<string>();
  for (const row of data ?? []) refs.add(String(row.conversation_ref));
  return { refs, bounded: refs.size >= limit };
}

/**
 * Is the stars table present and answering for this org?
 *
 * An empty set is ambiguous — nothing starred yet, or the migration is not applied. The UI needs
 * to tell those apart to decide whether the star control can be used at all.
 */
export async function starsAvailable(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<boolean> {
  if (!orgId) return false;
  const { error } = await db
    .from("conversation_stars")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  return !error;
}

/**
 * Star or unstar one conversation. Idempotent in both directions — starring twice is one row
 * (unique on org + ref), unstarring something that was never starred is a no-op delete.
 *
 * Returns a clean `{ ok: false }` (never throws) when the table is missing or the write fails,
 * so the Inbox can say "not available yet" rather than crashing.
 */
export async function setStar(
  params: {
    orgId: string;
    conversationRef: string;
    source: ConversationSource;
    channel: Channel;
    starred: boolean;
    userId?: string | null;
  },
  db: SupabaseClient = supabaseAdmin
): Promise<{ ok: boolean; error?: string }> {
  const { orgId, conversationRef } = params;
  if (!orgId || !conversationRef) return { ok: false, error: "missing_conversation" };

  if (!params.starred) {
    const { error } = await db
      .from("conversation_stars")
      .delete()
      .eq("org_id", orgId)
      .eq("conversation_ref", conversationRef);
    if (error) {
      console.error("[PLATFORM][STARS][UNSTAR][FAILED]", { orgId, error: error.message });
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }

  const { error } = await db.from("conversation_stars").upsert(
    {
      org_id: orgId,
      conversation_ref: conversationRef,
      source: params.source,
      channel: params.channel,
      created_by: params.userId ?? null,
    },
    { onConflict: "org_id,conversation_ref" }
  );

  if (error) {
    console.error("[PLATFORM][STARS][STAR][FAILED]", { orgId, error: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Whether one conversation is starred. Fails soft to `false`. */
export async function isStarred(
  orgId: string,
  conversationRef: string,
  db: SupabaseClient = supabaseAdmin
): Promise<boolean> {
  if (!orgId || !conversationRef) return false;
  const { data, error } = await db
    .from("conversation_stars")
    .select("id")
    .eq("org_id", orgId)
    .eq("conversation_ref", conversationRef)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}
