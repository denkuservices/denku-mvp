import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { voiceAdapter, type VoiceInboundRaw } from "@/lib/platform/adapters/voice";
import { ingestInboundMessage } from "@/lib/platform/ingest";

/**
 * Voice → shared conversation model recorder (Sprint 4.5).
 *
 * Called from the Vapi webhook at end-of-call, behind PLATFORM_MODEL_ENABLED, to record a
 * completed call as a Conversation with per-turn Messages, then back-link the call and its
 * artifacts to that Conversation. RECORD-ONLY: the webhook's own intent classification and
 * never-dead-end ticket/appointment creation are untouched — this is purely additive
 * mirroring. Never throws (the call must finalize regardless).
 */

export interface RecordVoiceCallInput {
  callId: string;
  orgId: string;
  agentId?: string | null;
  vapiCallId: string;
  fromPhone?: string | null;
  callerName?: string | null;
  transcript?: string | null;
  startedAt?: string | null;
}

export async function recordVoiceCall(
  input: RecordVoiceCallInput,
  db: SupabaseClient = supabaseAdmin
): Promise<{ conversationId: string | null }> {
  const { callId, orgId, vapiCallId } = input;
  if (!callId || !orgId || !vapiCallId) return { conversationId: null };

  try {
    const raw: VoiceInboundRaw = {
      vapiCallId,
      fromPhone: input.fromPhone ?? null,
      callerName: input.callerName ?? null,
      transcript: input.transcript ?? null,
      startedAt: input.startedAt ?? null,
    };
    const turns = voiceAdapter.normalizeInbound(raw, { orgId, agentId: input.agentId ?? null });
    if (turns.length === 0) return { conversationId: null };

    let conversationId: string | null = null;
    for (const turn of turns) {
      // Record-only: no intent/automation stage (voice runs those in the webhook).
      const res = await ingestInboundMessage(turn, { db });
      if (res.conversationId) conversationId = res.conversationId;
    }
    if (!conversationId) return { conversationId: null };

    // Back-link the call and its artifacts to the conversation (idempotent, non-fatal).
    await db
      .from("calls")
      .update({ conversation_id: conversationId })
      .eq("id", callId)
      .eq("org_id", orgId)
      .is("conversation_id", null);

    for (const table of ["tickets", "appointments"]) {
      await db
        .from(table)
        .update({ conversation_id: conversationId })
        .eq("call_id", callId)
        .eq("org_id", orgId)
        .is("conversation_id", null);
    }

    return { conversationId };
  } catch (err) {
    console.error("[PLATFORM][VOICE][RECORD][ERROR]", err instanceof Error ? err.message : String(err));
    return { conversationId: null };
  }
}
