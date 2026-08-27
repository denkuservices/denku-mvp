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

/**
 * The recording URL, asked for by path instead of by dragging the whole payload across.
 *
 * `raw_payload` is the entire Vapi webhook body — measured at **77 KB for a single call** — and
 * this function needs one string out of it. Selecting these paths instead means Postgres does the
 * digging and sends back a few hundred bytes, on a query that runs every time a conversation is
 * opened. The aliases mirror `findRecordingUrl`'s candidate list exactly, in the same order.
 */
const RECORDING_PATHS = [
  "r1:raw_payload->message->artifact->>recordingUrl",
  "r2:raw_payload->message->artifact->>stereoRecordingUrl",
  "r3:raw_payload->message->artifact->recording->>stereoUrl",
  "r4:raw_payload->message->artifact->recording->mono->>combinedUrl",
  "r5:raw_payload->message->artifact->recording->mono->>assistantUrl",
  "r6:raw_payload->message->artifact->recording->mono->>customerUrl",
  "r7:raw_payload->artifact->>recordingUrl",
  "r8:raw_payload->artifact->>stereoRecordingUrl",
  "r9:raw_payload->artifact->recording->>stereoUrl",
  "r10:raw_payload->artifact->recording->mono->>combinedUrl",
].join(",");

type NarrowRow = Record<string, unknown> & {
  cost_usd: number | string | null;
  duration_seconds: number | null;
};

export async function getVoiceArtifacts(
  orgId: string,
  callId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<VoiceArtifacts | null> {
  if (!orgId || !callId) return null;
  try {
    const { data, error } = await db
      .from("calls")
      .select(`cost_usd, duration_seconds, ${RECORDING_PATHS}`)
      .eq("id", callId)
      .eq("org_id", orgId)
      .maybeSingle<NarrowRow>();

    if (error || !data) return null;

    let recordingUrl: string | null = null;
    for (let i = 1; i <= 10; i++) {
      const v = data[`r${i}`];
      if (typeof v === "string" && v.startsWith("http")) {
        recordingUrl = v;
        break;
      }
    }

    /**
     * Fall back to the whole payload only when the paths found nothing.
     *
     * Worth the second round trip because it is the correctness net: `raw_payload` has been seen
     * stored as a JSON *string* rather than an object, and a jsonb path over a string scalar
     * returns null rather than erroring — so without this, those calls would silently lose their
     * recording. A call that genuinely has no recording pays this once and gets null either way.
     */
    if (!recordingUrl) {
      const { data: full } = await db
        .from("calls")
        .select("raw_payload")
        .eq("id", callId)
        .eq("org_id", orgId)
        .maybeSingle<{ raw_payload: unknown }>();
      recordingUrl = findRecordingUrl(parsePayload(full?.raw_payload));
    }

    return {
      recordingUrl,
      costUsd: data.cost_usd == null ? null : Number(data.cost_usd),
      durationSeconds: data.duration_seconds ?? null,
    };
  } catch (err) {
    console.error("[PLATFORM][READMODEL][VOICE_ARTIFACTS]", err instanceof Error ? err.message : String(err));
    return null;
  }
}