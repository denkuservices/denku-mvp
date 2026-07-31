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
 *
 * Reads public.messages, which carries org_id, conversation_id, role and
 * created_at — so the org scope is applied directly in one query.
 *
 * R-134: this function previously queried a table named `conversation_messages`,
 * which was DROPped from production by migration 20260405185521 ("conversation_messages
 * RLS'siz ve messages tablosu ile çakışıyor"). Every call therefore failed and the
 * dashboard tile silently rendered "—" forever. It also did a two-step lookup
 * (conversations -> ids -> messages) that is unnecessary now that messages is
 * org-scoped in its own right.
 */
export async function getAvgResponseTime(orgId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();

  // Last 24 hours window
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error: msgErr } = await supabase
    .from("messages")
    .select("conversation_id, role, created_at")
    .eq("org_id", orgId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .returns<MsgRow[]>();

  // Fail safe: never break the dashboard
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
