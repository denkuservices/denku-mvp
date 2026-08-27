import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ReplyEmployee, ReplyTurn } from "@/lib/platform/reply/types";

/**
 * Who answers, and what they have already said.
 *
 * Both halves are org-scoped and never throw: a chat channel that cannot resolve its employee
 * must fall silent, not 500 into the provider's retry loop.
 */

const AGENT_COLUMNS =
  "id, org_id, name, language, timezone, first_message, system_prompt_override, business_context";

/**
 * Resolve the AI Employee for a conversation.
 *
 * `preferredAgentId` is the channel connection's assignment — the explicit answer. When a
 * connection has not been assigned yet we fall back to the org's oldest agent rather than
 * refusing to reply: a workspace with one AI Employee (which is every workspace today) would
 * otherwise stay silent for the entirely internal reason that a column is null.
 */
export async function resolveReplyEmployee(
  orgId: string,
  preferredAgentId: string | null,
  db: SupabaseClient = supabaseAdmin
): Promise<ReplyEmployee | null> {
  if (!orgId) return null;

  try {
    let query = db.from("agents").select(AGENT_COLUMNS).eq("org_id", orgId);
    query = preferredAgentId
      ? query.eq("id", preferredAgentId)
      : query.order("created_at", { ascending: true }).limit(1);

    const { data, error } = await query.maybeSingle<{
      id: string;
      org_id: string;
      name: string | null;
      language: string | null;
      timezone: string | null;
      first_message: string | null;
      system_prompt_override: string | null;
      business_context: Record<string, unknown> | null;
    }>();

    if (error || !data) {
      // An assignment pointing at a deleted agent should not silence the channel.
      if (preferredAgentId) return resolveReplyEmployee(orgId, null, db);
      console.warn("[REPLY][EMPLOYEE][NOT_FOUND]", { orgId });
      return null;
    }

    const { data: org } = await db
      .from("orgs")
      .select("name")
      .eq("id", orgId)
      .maybeSingle<{ name: string | null }>();

    return {
      id: data.id,
      orgId,
      name: data.name?.trim() || "Assistant",
      orgName: org?.name?.trim() || "the business",
      language: data.language,
      timezone: data.timezone,
      systemPromptOverride: data.system_prompt_override,
      firstMessage: data.first_message,
      businessContext: data.business_context,
    };
  } catch (err) {
    console.error("[REPLY][EMPLOYEE][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * The conversation so far, oldest → newest.
 *
 * Capped at `limit` turns because the thread is unbounded and the model is billed per token: a
 * customer who has messaged this bot every week for a year would otherwise make every reply
 * slower and more expensive than the last. Twenty turns is roughly the last two exchanges of
 * context a person expects a chat partner to remember.
 */
export async function loadHistory(
  orgId: string,
  conversationId: string,
  limit = 20,
  db: SupabaseClient = supabaseAdmin
): Promise<ReplyTurn[]> {
  if (!orgId || !conversationId) return [];
  try {
    const { data, error } = await db
      .from("messages")
      .select("role, content, created_at")
      .eq("org_id", orgId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return (data as { role: string; content: string }[])
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      .reverse();
  } catch (err) {
    console.error("[REPLY][HISTORY][ERROR]", err instanceof Error ? err.message : String(err));
    return [];
  }
}

/** The contact's known name, so the prompt can forbid asking for it again. */
export async function contactDisplayName(
  orgId: string,
  contactId: string | null,
  db: SupabaseClient = supabaseAdmin
): Promise<string | null> {
  if (!orgId || !contactId) return null;
  try {
    const { data } = await db
      .from("contacts")
      .select("display_name")
      .eq("id", contactId)
      .eq("org_id", orgId)
      .maybeSingle<{ display_name: string | null }>();
    return data?.display_name?.trim() || null;
  } catch {
    return null;
  }
}
