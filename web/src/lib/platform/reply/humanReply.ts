import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Channel } from "@/lib/platform/channels";
import { appendMessage } from "@/lib/platform/conversations";
import { canReplyOn, getTransport } from "@/lib/platform/transports/registry";
import { setHandlingState } from "@/lib/platform/handling";

/**
 * A person answering a customer from the Inbox.
 *
 * The AI answering and a human answering travel the **same transport** — the difference is only
 * who wrote the words and what it means for the conversation afterwards. That "afterwards" is the
 * whole reason this is not three lines inside a server action:
 *
 * **When a human speaks, the AI stops.** Anything else means the owner and their AI both replying
 * to the same customer, seconds apart, contradicting each other — the failure mode that makes a
 * shared inbox worse than no shared inbox. So a human send flips
 * `conversation_handling.handling` to `"human"`, and `respondToInbound` refuses to generate while
 * it stays there. Handing back is deliberate, from the takeover control in the context rail.
 *
 * Same order as the AI path, for the same reason: **send first, store second.** A stored-but-unsent
 * message would show the owner their own reply sitting in the thread when the customer never got
 * it — and unlike a missed AI reply, they would believe they had answered.
 */

export interface HumanReplyInput {
  orgId: string;
  /** `conversations.id` — chat only; a voice call has nothing to reply to. */
  conversationId: string;
  channel: Channel;
  text: string;
  /** The person sending, for provenance and for the takeover assignment. */
  userId: string | null;
  /**
   * Whether sending means "I am handling this now". Defaults to true.
   *
   * False for an approved AI draft: the owner read what the AI wrote and let it go, which is the
   * opposite of taking over. Flipping to `"human"` there would silence the AI on a conversation
   * the business is happy for it to keep answering, and every approval would quietly cost them
   * the automation they are paying for.
   */
  takeover?: boolean;
  /** Marks the message as AI-authored when a person merely approved it. */
  generated?: boolean;
  db?: SupabaseClient;
}

export interface HumanReplyResult {
  ok: boolean;
  error?: string;
}

/** Where a conversation's replies physically go — resolved from what ingest recorded. */
export async function resolveOutboundTarget(
  orgId: string,
  conversationId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<{ threadId: string; connectionId: string | null } | null> {
  try {
    const { data } = await db
      .from("conversations")
      .select("external_thread_id, meta")
      .eq("id", conversationId)
      .eq("org_id", orgId)
      .maybeSingle<{ external_thread_id: string | null; meta: Record<string, unknown> | null }>();

    if (!data?.external_thread_id) return null;

    // The connection id is written onto the conversation by the channel's webhook, precisely so
    // that replying later does not have to guess which of an org's connections to send through.
    const meta = data.meta ?? {};
    const connectionId =
      (meta.telegram_connection_id as string | undefined) ?? (meta.connection_id as string | undefined) ?? null;

    return { threadId: data.external_thread_id, connectionId };
  } catch (err) {
    console.error("[REPLY][HUMAN][TARGET][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function sendHumanReply(input: HumanReplyInput): Promise<HumanReplyResult> {
  const db = input.db ?? supabaseAdmin;
  const text = (input.text ?? "").trim();

  if (!text) return { ok: false, error: "Nothing to send." };
  if (text.length > 4000) return { ok: false, error: "That message is too long to send." };
  if (!canReplyOn(input.channel)) return { ok: false, error: "Denku cannot send on this channel yet." };

  const transport = getTransport(input.channel);
  if (!transport) return { ok: false, error: "Denku cannot send on this channel yet." };

  const target = await resolveOutboundTarget(input.orgId, input.conversationId, db);
  if (!target) return { ok: false, error: "This conversation has no reply address." };

  const sent = await transport.sendText(
    { orgId: input.orgId, conversationId: input.conversationId, ...target },
    text
  );

  if (!sent.ok) {
    console.error("[REPLY][HUMAN][SEND][FAILED]", {
      org_id: input.orgId,
      conversation_id: input.conversationId,
      channel: input.channel,
      error: sent.error,
    });
    return { ok: false, error: sent.error ?? "The message could not be delivered." };
  }

  await appendMessage(
    {
      orgId: input.orgId,
      conversationId: input.conversationId,
      role: "assistant",
      direction: "outbound",
      content: text,
      externalMessageId: sent.externalMessageId ?? null,
      // `generated: false` is what lets the thread show who actually said this. Without it a
      // teammate reading back cannot tell their colleague's words from the AI's. An approved
      // draft records both facts: the AI wrote it, and a named person released it.
      meta: {
        generated: input.generated ?? false,
        sent_by: input.userId,
        ...(input.generated ? { approved_by: input.userId } : {}),
      },
    },
    db
  );

  // An approved draft is not a takeover — the AI keeps the conversation.
  if (input.takeover === false) {
    console.info("[REPLY][DRAFT][APPROVED]", {
      org_id: input.orgId,
      conversation_id: input.conversationId,
      channel: input.channel,
    });
    return { ok: true };
  }

  // The AI steps back. Best-effort: the customer already has the message, and a failure to record
  // the takeover must not be reported as a failure to send.
  const takeover = await setHandlingState({
    orgId: input.orgId,
    conversationRef: input.conversationId,
    source: "conversations",
    channel: input.channel,
    handling: "human",
    assignedTo: input.userId,
    updatedBy: input.userId,
  });
  if (!takeover.ok) {
    console.error("[REPLY][HUMAN][TAKEOVER][FAILED]", {
      conversation_id: input.conversationId,
      error: takeover.error,
    });
  }

  console.info("[REPLY][HUMAN][SENT]", {
    org_id: input.orgId,
    conversation_id: input.conversationId,
    channel: input.channel,
  });

  return { ok: true };
}
