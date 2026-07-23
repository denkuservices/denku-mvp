import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Channel } from "@/lib/platform/channels";

/**
 * Conversation + message helpers for the shared platform model (Sprint 4.5).
 *
 * A Conversation is the canonical, channel-agnostic interaction record: a voice call, an
 * Instagram thread, a future WhatsApp/email thread are all Conversations with Messages.
 *
 * Idempotency (assume every webhook fires twice — project rule):
 *   - `ensureConversation` is anchored on the partial unique index
 *     `conversations (org_id, channel, external_thread_id)` — the same call/thread resolves
 *     to one Conversation.
 *   - `appendMessage` is anchored on `messages (conversation_id, external_message_id)` —
 *     the same channel-native message is never double-inserted.
 *
 * Org-scoped, never throws into the caller's hot path (returns null + logs on failure).
 */

const PG_UNIQUE_VIOLATION = "23505";

export type MessageRole = "user" | "assistant" | "system";
export type MessageDirection = "inbound" | "outbound";

export interface EnsureConversationInput {
  orgId: string;
  channel: Channel;
  /** Channel-native thread key: vapi_call_id (voice), IG thread/sender id, … */
  externalThreadId: string;
  agentId?: string | null;
  contactId?: string | null;
  /** External participant handle (denormalized convenience; e.g. caller phone, IG user id). */
  externalUserId?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Resolve (or create) the Conversation for a channel thread. Idempotent.
 * Returns the conversation id, or null on failure.
 */
export async function ensureConversation(
  input: EnsureConversationInput,
  db: SupabaseClient = supabaseAdmin
): Promise<string | null> {
  const { orgId, channel, externalThreadId } = input;
  if (!orgId || !channel || !externalThreadId) return null;

  try {
    const existing = await db
      .from("conversations")
      .select("id")
      .eq("org_id", orgId)
      .eq("channel", channel)
      .eq("external_thread_id", externalThreadId)
      .maybeSingle<{ id: string }>();

    if (existing.data?.id) {
      // Backfill contact_id if it became known after creation (non-fatal).
      if (input.contactId) {
        await db
          .from("conversations")
          .update({ contact_id: input.contactId })
          .eq("id", existing.data.id)
          .eq("org_id", orgId)
          .is("contact_id", null);
      }
      return existing.data.id;
    }

    const inserted = await db
      .from("conversations")
      .insert({
        org_id: orgId,
        channel,
        external_thread_id: externalThreadId,
        agent_id: input.agentId ?? null,
        contact_id: input.contactId ?? null,
        external_user_id: input.externalUserId ?? null,
        status: "open",
        last_activity_at: new Date().toISOString(),
        meta: input.meta ?? {},
      })
      .select("id")
      .single<{ id: string }>();

    if (inserted.error) {
      // Race: another writer created the same thread — re-select the winner.
      if ((inserted.error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        const winner = await db
          .from("conversations")
          .select("id")
          .eq("org_id", orgId)
          .eq("channel", channel)
          .eq("external_thread_id", externalThreadId)
          .maybeSingle<{ id: string }>();
        return winner.data?.id ?? null;
      }
      console.error("[PLATFORM][CONVERSATION][INSERT][FAILED]", inserted.error.message);
      return null;
    }

    return inserted.data?.id ?? null;
  } catch (err) {
    console.error("[PLATFORM][CONVERSATION][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export interface AppendMessageInput {
  orgId: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  direction?: MessageDirection;
  /** Channel-native message id → idempotent append. Omit for synthetic messages. */
  externalMessageId?: string | null;
  meta?: Record<string, unknown>;
  /** Message timestamp (defaults to now); also advances conversation.last_message_at. */
  createdAt?: string;
}

/**
 * Append a message to a Conversation. Idempotent when `externalMessageId` is provided.
 * Advances the conversation's last_message_at / last_activity_at. Returns the message id
 * (existing id on idempotent hit), or null on failure.
 */
export async function appendMessage(
  input: AppendMessageInput,
  db: SupabaseClient = supabaseAdmin
): Promise<string | null> {
  const { orgId, conversationId, role, content } = input;
  if (!orgId || !conversationId || !role || !content) return null;

  const ts = input.createdAt ?? new Date().toISOString();

  try {
    const row: Record<string, unknown> = {
      org_id: orgId,
      conversation_id: conversationId,
      role,
      content,
      direction: input.direction ?? null,
      external_message_id: input.externalMessageId ?? null,
      meta: input.meta ?? {},
      created_at: ts,
    };

    const inserted = await db
      .from("messages")
      .insert(row)
      .select("id")
      .single<{ id: string }>();

    if (inserted.error) {
      // Idempotent hit: same (conversation_id, external_message_id) already stored.
      if ((inserted.error as { code?: string }).code === PG_UNIQUE_VIOLATION && input.externalMessageId) {
        const winner = await db
          .from("messages")
          .select("id")
          .eq("conversation_id", conversationId)
          .eq("external_message_id", input.externalMessageId)
          .maybeSingle<{ id: string }>();
        return winner.data?.id ?? null;
      }
      console.error("[PLATFORM][MESSAGE][INSERT][FAILED]", inserted.error.message);
      return null;
    }

    // Advance conversation recency markers (non-fatal).
    await db
      .from("conversations")
      .update({ last_message_at: ts, last_activity_at: ts })
      .eq("id", conversationId)
      .eq("org_id", orgId);

    return inserted.data?.id ?? null;
  } catch (err) {
    console.error("[PLATFORM][MESSAGE][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Mark a conversation closed (voice call ended, IG thread resolved). Non-fatal. */
export async function closeConversation(
  orgId: string,
  conversationId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<void> {
  if (!orgId || !conversationId) return;
  try {
    await db
      .from("conversations")
      .update({ status: "closed" })
      .eq("id", conversationId)
      .eq("org_id", orgId);
  } catch (err) {
    console.error("[PLATFORM][CONVERSATION][CLOSE][ERROR]", err instanceof Error ? err.message : String(err));
  }
}
