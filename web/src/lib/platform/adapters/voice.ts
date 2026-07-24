import type { ChannelAdapter, NormalizedInbound, NormalizeContext } from "@/lib/platform/adapters/types";
import type { MessageRole } from "@/lib/platform/conversations";

/**
 * Voice channel adapter (Sprint 4.5 — Voice becomes a channel adapter).
 *
 * Maps a completed Vapi call (its transcript) into the shared conversation model: one
 * Conversation per call (thread = vapi_call_id), one Message per transcript turn. This is
 * RECORD-ONLY adoption — the existing end-of-call intent classification and never-dead-end
 * ticket/appointment creation in the Vapi webhook are unchanged; the wiring links the
 * call and its artifact to the Conversation this produces. Pure + deterministic + never
 * throws (returns [] on unusable input), per the ChannelAdapter contract.
 */

export interface VoiceInboundRaw {
  vapiCallId: string;
  fromPhone?: string | null;
  callerName?: string | null;
  transcript?: string | null;
  /** ISO timestamp the call started (turn timestamps are synthesized from it). */
  startedAt?: string | null;
}

interface Turn {
  role: MessageRole;
  content: string;
}

/**
 * Split a Vapi transcript into speaker turns. Mirrors the guardrail splitter's label set
 * ("AI/Assistant/Agent" = the employee; "User/Caller" = the customer; "System"). Text
 * before the first label, or a transcript with no labels, becomes a single system turn so
 * nothing is lost. Pure.
 */
export function parseTranscriptTurns(transcript: string | null | undefined): Turn[] {
  const text = (transcript ?? "").trim();
  if (!text) return [];

  const tokens = text.split(/(AI|Assistant|Agent|User|Caller|System)\s*:/i);
  const turns: Turn[] = [];

  // tokens[0] = any preamble before the first label.
  const preamble = (tokens[0] ?? "").trim();
  if (tokens.length === 1) {
    // No speaker labels at all → keep the whole transcript as one system turn.
    return preamble ? [{ role: "system", content: preamble }] : [];
  }
  if (preamble) turns.push({ role: "system", content: preamble });

  for (let i = 1; i < tokens.length; i += 2) {
    const speaker = (tokens[i] ?? "").toLowerCase();
    const content = (tokens[i + 1] ?? "").trim();
    if (!content) continue;
    const isAgent = speaker === "ai" || speaker === "assistant" || speaker === "agent";
    const role: MessageRole = speaker === "system" ? "system" : isAgent ? "assistant" : "user";
    turns.push({ role, content });
  }
  return turns;
}

export const voiceAdapter: ChannelAdapter = {
  channel: "voice",
  normalizeInbound(raw: unknown, ctx: NormalizeContext): NormalizedInbound[] {
    const call = raw as VoiceInboundRaw | null;
    if (!call || !call.vapiCallId || !ctx.orgId) return [];

    const turns = parseTranscriptTurns(call.transcript);
    if (turns.length === 0) return [];

    const baseTs = call.startedAt ?? new Date().toISOString();
    const externalId = (call.fromPhone && call.fromPhone.trim()) || "unknown";

    return turns.map((turn, i) => ({
      channel: "voice",
      orgId: ctx.orgId,
      agentId: ctx.agentId ?? null,
      externalThreadId: call.vapiCallId,
      contact: {
        externalId,
        displayName: call.callerName ?? null,
        phone: call.fromPhone ?? null,
      },
      message: {
        role: turn.role,
        // Employee turns are outbound (spoken to the caller); caller turns inbound.
        direction: turn.role === "assistant" ? "outbound" : "inbound",
        content: turn.content,
        // Stable per-turn id → idempotent re-ingest of the same call.
        externalMessageId: `${call.vapiCallId}:${i}`,
        createdAt: baseTs,
      },
    }));
  },
};
