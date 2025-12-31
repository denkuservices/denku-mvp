// web/src/lib/dashboard/getAvgResponseTime.ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MsgRow = {
  conversation_id: string;
  role: "user" | "assistant" | "system" | string;
  created_at: string;
};

/**
 * Calculates average "time to first assistant reply" in the last 24h for an org.
 * Assumes:
 * - Table: conversation_messages
 * - Columns: conversation_id (uuid), role (text), created_at (timestamptz)
 * - Conversations are scoped by org_id in "conversations" table.
 */
export async function getAvgResponseTime(orgId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();

  // Last 24 hours window
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 1) Fetch recent conversations for org (to scope messages)
  const { data: convs, error: convErr } = await supabase
    .from("conversations")
    .select("id")
    .eq("org_id", orgId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(200); // cap for safety

  if (convErr) {
    // Fail safe: don't break dashboard
    return "—";
  }

  const convoIds = (convs ?? []).map((c: any) => String(c.id)).filter(Boolean);
  if (convoIds.length === 0) return "—";

  // 2) Fetch messages for those conversations within window
  // NOTE: in(...) is supported by PostgREST; keep list bounded (we limited convs).
  const { data: rows, error: msgErr } = await supabase
    .from("conversation_messages")
    .select("conversation_id, role, created_at")
    .in("conversation_id", convoIds)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .returns<MsgRow[]>();

  if (msgErr || !rows || rows.length === 0) return "—";

  // 3) Compute per-conversation first user msg -> first assistant msg delta
  const perConv = new Map<string, { userTs?: number; assistantTs?: number }>();

  for (const r of rows) {
    const cid = String(r.conversation_id);
    const ts = new Date(r.created_at).getTime();

    if (!perConv.has(cid)) perConv.set(cid, {});
    const entry = perConv.get(cid)!;

    // First user timestamp
    if ((r.role === "user" || r.role === "USER") && entry.userTs == null) {
      entry.userTs = ts;
      continue;
    }

    // First assistant timestamp after user exists
    if (
      (r.role === "assistant" || r.role === "ASSISTANT") &&
      entry.userTs != null &&
      entry.assistantTs == null
    ) {
      entry.assistantTs = ts;
      continue;
    }
  }

  const diffsMs: number[] = [];
  for (const v of perConv.values()) {
    if (v.userTs != null && v.assistantTs != null) {
      const diff = v.assistantTs - v.userTs;
      // guard: ignore negatives / absurd values
      if (diff >= 0 && diff <= 5 * 60 * 1000) diffsMs.push(diff); // <= 5 min
    }
  }

  if (diffsMs.length === 0) return "—";

  const avgMs = diffsMs.reduce((a, b) => a + b, 0) / diffsMs.length;

  // 4) Format
  if (avgMs < 1000) return `${Math.round(avgMs)} ms`;
  if (avgMs < 60_000) return `${(avgMs / 1000).toFixed(1)} s`;

  const mins = avgMs / 60_000;
  return `${mins.toFixed(1)} min`;
}
