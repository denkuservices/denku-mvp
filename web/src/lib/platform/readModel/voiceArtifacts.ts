import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * The voice-specific facts about a conversation: its recording and what it cost (Sprint 13).
 *
 * These lived only on `/dashboard/calls/:id`, a legacy page the conversation detail linked out
 * to — so hearing a call meant leaving the thread and landing in a differently-styled product.
 * The conversation is the place a customer interaction is read; the recording belongs there.
 *
 * `findRecordingUrl` is copied verbatim from that page because Vapi puts the URL in several
 * different places depending on how the call ended, and every one of those shapes has been seen
 * in production. Narrowing it would silently lose recordings.
 *
 * Read-only, org-scoped, never throws.
 */

export interface VoiceArtifacts {
  recordingUrl: string | null;
  costUsd: number | null;
  durationSeconds: number | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Dig the recording URL out of a Vapi payload. Pure; shapes observed in production. */
export function findRecordingUrl(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;

  const msg = obj?.message ?? obj;
  const candidates = [
    msg?.artifact?.recordingUrl,
    msg?.artifact?.stereoRecordingUrl,
    msg?.artifact?.recording?.stereoUrl,
    msg?.artifact?.recording?.mono?.combinedUrl,
    msg?.artifact?.recording?.mono?.assistantUrl,
    msg?.artifact?.recording?.mono?.customerUrl,
    msg?.artifact?.recordingUrl?.url,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
  }
  return null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Parse `raw_payload`, which is stored as jsonb but has been seen as a JSON string. */
function parsePayload(raw: unknown): unknown {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

export async function getVoiceArtifacts(
  orgId: string,
  callId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<VoiceArtifacts | null> {
  if (!orgId || !callId) return null;
  try {
    const { data, error } = await db
      .from("calls")
      .select("cost_usd, duration_seconds, raw_payload")
      .eq("id", callId)
      .eq("org_id", orgId)
      .maybeSingle<{ cost_usd: number | string | null; duration_seconds: number | null; raw_payload: unknown }>();

    if (error || !data) return null;

    return {
      recordingUrl: findRecordingUrl(parsePayload(data.raw_payload)),
      costUsd: data.cost_usd == null ? null : Number(data.cost_usd),
      durationSeconds: data.duration_seconds ?? null,
    };
  } catch (err) {
    console.error("[PLATFORM][READMODEL][VOICE_ARTIFACTS]", err instanceof Error ? err.message : String(err));
    return null;
  }
}
