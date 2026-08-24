import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Channel } from "@/lib/platform/channels";
import type { ConversationView } from "@/lib/platform/readModel/types";

/**
 * Conversation handling state — human takeover + customer automation opt-out (Phase 3).
 *
 * Channel-agnostic by construction: keyed on the read model's stable conversation id, so voice
 * (sourced from `calls`) and chat (sourced from `conversations`) behave identically, and a new
 * channel inherits takeover with no work. Generalizes the Instagram-specific thread state built
 * for App Review.
 *
 * The table is RLS-locked and service-role only, so **every query here carries an explicit
 * `org_id` filter** — there is no safety net under the service-role client.
 *
 * **Inert until migrated.** `20260824100000_conversation_handling.sql` may not be applied yet, so
 * readers fail soft to `defaultHandling()` and writers report a clean failure. The Inbox must
 * render either way: a missing table degrades the controls, never the conversation.
 */

export type HandlingMode = "ai" | "human";
export type ConversationSource = ConversationView["source"];

export interface HandlingState {
  conversationRef: string;
  handling: HandlingMode;
  automationOptedOut: boolean;
  assignedTo: string | null;
  note: string | null;
  updatedAt: string | null;
}

/** What a conversation means when nobody has recorded anything about it. */
export function defaultHandling(conversationRef: string): HandlingState {
  return {
    conversationRef,
    handling: "ai",
    automationOptedOut: false,
    assignedTo: null,
    note: null,
    updatedAt: null,
  };
}

function toState(row: Record<string, unknown>): HandlingState {
  return {
    conversationRef: String(row.conversation_ref),
    handling: row.handling === "human" ? "human" : "ai",
    automationOptedOut: row.automation_opted_out === true,
    assignedTo: (row.assigned_to as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}

const SELECT = "conversation_ref, handling, automation_opted_out, assigned_to, note, updated_at";

/**
 * States for a set of conversations, keyed by ref. Conversations with no row are absent —
 * callers fall back to `defaultHandling`. Returns an empty map on any error (including
 * "table does not exist"), so the Inbox still renders.
 */
export async function getHandlingStates(
  orgId: string,
  conversationRefs: string[],
  db: SupabaseClient = supabaseAdmin
): Promise<Map<string, HandlingState>> {
  const out = new Map<string, HandlingState>();
  const refs = Array.from(new Set(conversationRefs.filter(Boolean)));
  if (!orgId || refs.length === 0) return out;

  const { data, error } = await db
    .from("conversation_handling")
    .select(SELECT)
    .eq("org_id", orgId)
    .in("conversation_ref", refs);

  if (error) {
    console.warn("[PLATFORM][HANDLING][LIST][UNAVAILABLE]", { orgId, error: error.message });
    return out;
  }
  for (const row of data ?? []) out.set(String(row.conversation_ref), toState(row));
  return out;
}

/** One conversation's state, or the default when unset/unavailable. */
export async function getHandlingState(
  orgId: string,
  conversationRef: string,
  db: SupabaseClient = supabaseAdmin
): Promise<HandlingState> {
  const states = await getHandlingStates(orgId, [conversationRef], db);
  return states.get(conversationRef) ?? defaultHandling(conversationRef);
}

/**
 * Every conversation in this org currently owned by a human.
 *
 * Bounded deliberately: this is the set someone has explicitly touched, which stays small in
 * practice, and it feeds an in-memory filter over the already-scanned conversation window — so
 * the Inbox's truthful-count guarantee is unaffected.
 */
export async function listHumanHandledRefs(
  orgId: string,
  db: SupabaseClient = supabaseAdmin,
  limit = 500
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!orgId) return out;

  const { data, error } = await db
    .from("conversation_handling")
    .select("conversation_ref")
    .eq("org_id", orgId)
    .eq("handling", "human")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[PLATFORM][HANDLING][HUMAN_REFS][UNAVAILABLE]", { orgId, error: error.message });
    return out;
  }
  for (const row of data ?? []) out.add(String(row.conversation_ref));
  return out;
}

/**
 * Is the handling table present and answering for this org?
 *
 * An empty state map is ambiguous — nothing recorded yet, or the migration is not applied. The
 * UI needs to tell those apart to decide whether the takeover controls can be used at all.
 */
export async function handlingAvailable(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<boolean> {
  if (!orgId) return false;
  const { error } = await db
    .from("conversation_handling")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  return !error;
}

/**
 * Upsert the parts of a conversation's handling state the caller wants to change. Returns a
 * clean `{ ok: false }` (never throws) when the table is missing or the write fails, so the
 * dashboard can say "not available yet" rather than crashing.
 */
export async function setHandlingState(
  params: {
    orgId: string;
    conversationRef: string;
    source: ConversationSource;
    channel: Channel;
    handling?: HandlingMode;
    automationOptedOut?: boolean;
    assignedTo?: string | null;
    note?: string | null;
    updatedBy?: string | null;
  },
  db: SupabaseClient = supabaseAdmin
): Promise<{ ok: boolean; error?: string }> {
  const { orgId, conversationRef } = params;
  if (!orgId || !conversationRef) return { ok: false, error: "missing_conversation" };

  const patch: Record<string, unknown> = {
    org_id: orgId,
    conversation_ref: conversationRef,
    source: params.source,
    channel: params.channel,
    updated_at: new Date().toISOString(),
    updated_by: params.updatedBy ?? null,
  };
  if (params.handling !== undefined) patch.handling = params.handling;
  if (params.automationOptedOut !== undefined) patch.automation_opted_out = params.automationOptedOut;
  if (params.assignedTo !== undefined) patch.assigned_to = params.assignedTo;
  if (params.note !== undefined) patch.note = params.note;

  const { error } = await db
    .from("conversation_handling")
    .upsert(patch, { onConflict: "org_id,conversation_ref" });

  if (error) {
    console.error("[PLATFORM][HANDLING][WRITE][FAILED]", { orgId, error: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** How many of this org's conversations are waiting on a person. Feeds the Home alert. */
export async function countNeedsHuman(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<number | null> {
  if (!orgId) return null;
  const { count, error } = await db
    .from("conversation_handling")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("handling", "human");
  return error ? null : (count ?? 0);
}
