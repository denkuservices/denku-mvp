import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ReplyArtifact } from "@/lib/platform/reply/types";

/**
 * A reply the AI wrote but did not send.
 *
 * **Why this is not a row in `messages`.** `respond.ts` and `humanReply.ts` both state the same
 * rule, from the same scar: the Inbox must never show a message the customer did not receive.
 * `messages` is the record of what was actually exchanged, and a draft has not been exchanged —
 * putting one there would make the thread lie to the person reading it, and would feed the AI its
 * own unsent words back as conversation history on the next turn.
 *
 * **Why drafts exist at all.** Email is the first channel where a wrong answer cannot be walked
 * back: it is kept, forwarded, and occasionally has legal weight. So `reply_mode` defaults to
 * `'draft'` — the AI writes, a person sends — and auto-send is something a business opts into
 * once it trusts what it is reading. Telegram's send-immediately behaviour is unchanged.
 *
 * Channel-agnostic on purpose: Web Chat will want the same thing.
 *
 * Everything here fails soft. A missing table (before the migration is applied) degrades to
 * "no draft", never to a broken conversation — the same discipline as `conversation_stars`.
 */

export interface ConversationDraft {
  id: string;
  conversationId: string;
  body: string;
  artifacts: ReplyArtifact[];
  generatedAt: string;
}

interface Row {
  id: string;
  conversation_id: string;
  body: string;
  artifacts: unknown;
  generated_at: string;
}

function toDraft(row: Row): ConversationDraft {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    body: row.body,
    artifacts: Array.isArray(row.artifacts) ? (row.artifacts as ReplyArtifact[]) : [],
    generatedAt: row.generated_at,
  };
}

/** The pending draft for a conversation, if there is one. Never throws. */
export async function getDraft(
  orgId: string,
  conversationId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<ConversationDraft | null> {
  if (!orgId || !conversationId) return null;
  try {
    const { data, error } = await db
      .from("conversation_drafts")
      .select("id, conversation_id, body, artifacts, generated_at")
      .eq("org_id", orgId)
      .eq("conversation_id", conversationId)
      .is("discarded_at", null)
      .maybeSingle<Row>();

    if (error || !data) return null;
    return toDraft(data);
  } catch {
    return null;
  }
}

/**
 * Record what the AI would have said.
 *
 * Upsert on `(org_id, conversation_id)`: a second inbound message REPLACES the pending draft
 * rather than queueing a second answer. A customer who follows up before anyone has read the
 * first draft has moved the conversation on, and answering their older message would read as
 * not having listened.
 */
export async function saveDraft(input: {
  orgId: string;
  conversationId: string;
  body: string;
  artifacts?: ReplyArtifact[];
  db?: SupabaseClient;
}): Promise<ConversationDraft | null> {
  const db = input.db ?? supabaseAdmin;
  const body = (input.body ?? "").trim();
  if (!input.orgId || !input.conversationId || !body) return null;

  try {
    const { data, error } = await db
      .from("conversation_drafts")
      .upsert(
        {
          org_id: input.orgId,
          conversation_id: input.conversationId,
          body,
          artifacts: input.artifacts ?? [],
          generated_at: new Date().toISOString(),
          // A fresh draft is pending again, even if an older one for this conversation had
          // already been dismissed.
          discarded_at: null,
        },
        { onConflict: "org_id,conversation_id" }
      )
      .select("id, conversation_id, body, artifacts, generated_at")
      .maybeSingle<Row>();

    if (error || !data) {
      console.error("[DRAFT][SAVE][FAILED]", {
        conversation_id: input.conversationId,
        error: error?.message,
      });
      return null;
    }

    console.info("[DRAFT][SAVED]", {
      org_id: input.orgId,
      conversation_id: input.conversationId,
      artifacts: (input.artifacts ?? []).map((a) => a.type),
    });
    return toDraft(data);
  } catch (err) {
    console.error("[DRAFT][SAVE][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Mark a draft resolved — sent or thrown away.
 *
 * Stamped rather than deleted, so "the AI wrote something and a person decided against it" stays
 * visible. That signal is the only evidence a business has that draft mode is earning its
 * keep — or that the AI is not yet worth trusting with auto-send.
 */
export async function discardDraft(
  orgId: string,
  conversationId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<boolean> {
  if (!orgId || !conversationId) return false;
  try {
    const { error } = await db
      .from("conversation_drafts")
      .update({ discarded_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("conversation_id", conversationId)
      .is("discarded_at", null);

    return !error;
  } catch (err) {
    console.error("[DRAFT][DISCARD][ERROR]", err instanceof Error ? err.message : String(err));
    return false;
  }
}
