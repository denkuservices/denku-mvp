import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseTranscriptTurns } from "@/lib/platform/adapters/voice";
import type {
  ConversationView,
  ConversationDetailView,
  ConversationTurn,
  ArtifactRef,
} from "@/lib/platform/readModel/types";
import type { Channel } from "@/lib/platform/channels";

/**
 * Conversations read model (Sprint 5, P0).
 *
 * Presents interactions as channel-agnostic ConversationViews sourced from where the data
 * actually lives TODAY (decoupled from PLATFORM_MODEL_ENABLED):
 *   - **voice**     ← `calls` (always populated; the authoritative voice history)
 *   - **instagram** ← `conversations` WHERE channel='instagram' (populated once dual-write
 *                      is on; empty otherwise — IG has no real prod data yet regardless)
 * These sources are DISJOINT (voice never in `conversations` for reads), so no double count.
 * At read-cutover (R-085) the voice source swaps to `conversations` with no UI/type change.
 *
 * Pure row→view mappers are exported for unit testing; the async functions just fetch +map.
 * Org-scoped; never throws (returns [] / null on error).
 */

const SUMMARY_LEN = 140;

function preview(text: string | null | undefined): string | null {
  const t = (text ?? "").trim().replace(/\s+/g, " ");
  if (!t) return null;
  return t.length > SUMMARY_LEN ? `${t.slice(0, SUMMARY_LEN)}…` : t;
}

// --- pure mappers -----------------------------------------------------------

export interface CallRow {
  id: string;
  agent_id: string | null;
  from_phone: string | null;
  lead_id: string | null;
  intent: string | null;
  outcome: string | null;
  completion_state: string | null;
  transcript: string | null;
  duration_seconds: number | null;
  direction: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export function callRowToConversationView(
  row: CallRow,
  employeeName: string | null
): ConversationView {
  return {
    id: row.id,
    channel: "voice",
    employeeId: row.agent_id,
    employeeName,
    contact: { id: row.lead_id, displayName: null, handle: row.from_phone },
    status: row.completion_state ?? row.outcome ?? null,
    intent: row.intent,
    startedAt: row.started_at,
    lastActivityAt: row.ended_at ?? row.started_at ?? row.created_at,
    summary: preview(row.transcript),
    meta: {
      durationSeconds: row.duration_seconds ?? null,
      direction: row.direction ?? null,
      outcome: row.outcome ?? null,
    },
    source: "calls",
  };
}

export interface ConversationRow {
  id: string;
  channel: string;
  agent_id: string | null;
  contact_id: string | null;
  external_user_id: string | null;
  status: string | null;
  last_message_at: string | null;
  created_at: string;
}

export function conversationRowToConversationView(
  row: ConversationRow,
  employeeName: string | null
): ConversationView {
  return {
    id: row.id,
    channel: (row.channel as Channel) ?? "instagram",
    employeeId: row.agent_id,
    employeeName,
    contact: { id: row.contact_id, displayName: null, handle: row.external_user_id },
    status: row.status,
    intent: null,
    startedAt: row.created_at,
    lastActivityAt: row.last_message_at ?? row.created_at,
    summary: null,
    meta: {},
    source: "conversations",
  };
}

/** Sort newest-activity first; nulls last. Pure. */
export function sortByActivityDesc(a: ConversationView, b: ConversationView): number {
  const av = a.lastActivityAt ? Date.parse(a.lastActivityAt) : -Infinity;
  const bv = b.lastActivityAt ? Date.parse(b.lastActivityAt) : -Infinity;
  return bv - av;
}

// --- employee name map ------------------------------------------------------

async function employeeNames(
  orgId: string,
  db: SupabaseClient
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { data } = await db.from("agents").select("id, name").eq("org_id", orgId);
    for (const a of (data ?? []) as Array<{ id: string; name: string }>) map.set(a.id, a.name);
  } catch {
    /* non-fatal — names are optional */
  }
  return map;
}

// --- list -------------------------------------------------------------------

export interface ListConversationsOpts {
  channel?: Channel;
  limit?: number;
}

export async function listConversationViews(
  orgId: string,
  opts: ListConversationsOpts = {},
  db: SupabaseClient = supabaseAdmin
): Promise<ConversationView[]> {
  if (!orgId) return [];
  const limit = opts.limit ?? 50;
  const names = await employeeNames(orgId, db);
  const out: ConversationView[] = [];

  try {
    // Voice source (calls) unless a non-voice channel is requested.
    if (!opts.channel || opts.channel === "voice") {
      const { data } = await db
        .from("calls")
        .select(
          "id, agent_id, from_phone, lead_id, intent, outcome, completion_state, transcript, duration_seconds, direction, started_at, ended_at, created_at"
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(limit);
      for (const r of (data ?? []) as CallRow[]) {
        out.push(callRowToConversationView(r, names.get(r.agent_id ?? "") ?? null));
      }
    }

    // Chat sources (conversations table) unless voice specifically requested.
    if (!opts.channel || opts.channel !== "voice") {
      let q = db
        .from("conversations")
        .select("id, channel, agent_id, contact_id, external_user_id, status, last_message_at, created_at")
        .eq("org_id", orgId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (opts.channel) q = q.eq("channel", opts.channel);
      const { data } = await q;
      for (const r of (data ?? []) as ConversationRow[]) {
        out.push(conversationRowToConversationView(r, names.get(r.agent_id ?? "") ?? null));
      }
    }
  } catch (err) {
    console.error("[PLATFORM][READMODEL][CONVERSATIONS]", err instanceof Error ? err.message : String(err));
  }

  return out.sort(sortByActivityDesc).slice(0, limit);
}

// --- detail -----------------------------------------------------------------

async function artifactsForCall(
  orgId: string,
  key: { call_id?: string; conversation_id?: string },
  db: SupabaseClient
): Promise<ArtifactRef[]> {
  const refs: ArtifactRef[] = [];
  const col = key.call_id ? "call_id" : "conversation_id";
  const val = key.call_id ?? key.conversation_id!;
  try {
    const { data: tickets } = await db
      .from("tickets")
      .select("id, subject, status")
      .eq("org_id", orgId)
      .eq(col, val);
    for (const t of (tickets ?? []) as Array<{ id: string; subject: string | null; status: string | null }>) {
      refs.push({ id: t.id, type: "ticket", status: t.status, title: t.subject });
    }
    const { data: appts } = await db
      .from("appointments")
      .select("id, status, start_at")
      .eq("org_id", orgId)
      .eq(col, val);
    for (const a of (appts ?? []) as Array<{ id: string; status: string | null; start_at: string | null }>) {
      refs.push({ id: a.id, type: "appointment", status: a.status, title: a.start_at });
    }
  } catch {
    /* non-fatal */
  }
  return refs;
}

export async function getConversationView(
  orgId: string,
  id: string,
  db: SupabaseClient = supabaseAdmin
): Promise<ConversationDetailView | null> {
  if (!orgId || !id) return null;
  const names = await employeeNames(orgId, db);

  try {
    // 1) Voice (calls).
    const { data: call } = await db
      .from("calls")
      .select(
        "id, agent_id, from_phone, lead_id, intent, outcome, completion_state, transcript, duration_seconds, direction, started_at, ended_at, created_at"
      )
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle<CallRow>();

    if (call) {
      const base = callRowToConversationView(call, names.get(call.agent_id ?? "") ?? null);
      const turns: ConversationTurn[] = parseTranscriptTurns(call.transcript).map((t, i) => ({
        id: `${call.id}:${i}`,
        channel: "voice",
        role: t.role,
        direction: t.role === "assistant" ? "outbound" : t.role === "system" ? null : "inbound",
        content: t.content,
        at: call.started_at,
      }));
      const artifacts = await artifactsForCall(orgId, { call_id: call.id }, db);
      return { ...base, turns, artifacts };
    }

    // 2) Chat (conversations).
    const { data: conv } = await db
      .from("conversations")
      .select("id, channel, agent_id, contact_id, external_user_id, status, last_message_at, created_at")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle<ConversationRow>();

    if (conv) {
      const base = conversationRowToConversationView(conv, names.get(conv.agent_id ?? "") ?? null);
      const { data: msgs } = await db
        .from("messages")
        .select("id, role, content, direction, created_at")
        .eq("org_id", orgId)
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });
      const turns: ConversationTurn[] = ((msgs ?? []) as Array<{
        id: string;
        role: string;
        content: string;
        direction: string | null;
        created_at: string;
      }>).map((m) => ({
        id: m.id,
        channel: base.channel,
        role: (m.role as ConversationTurn["role"]) ?? "user",
        direction: (m.direction as ConversationTurn["direction"]) ?? null,
        content: m.content,
        at: m.created_at,
      }));
      const artifacts = await artifactsForCall(orgId, { conversation_id: conv.id }, db);
      return { ...base, turns, artifacts };
    }
  } catch (err) {
    console.error("[PLATFORM][READMODEL][CONVERSATION_DETAIL]", err instanceof Error ? err.message : String(err));
  }

  return null;
}
