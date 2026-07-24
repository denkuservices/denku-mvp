import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Channel } from "@/lib/platform/channels";

/**
 * Minimal read plumbing over the shared platform model (Sprint 4.5 — Phase 4).
 *
 * Org-scoped, service-role read helpers that expose the platform concepts (Conversations,
 * Contacts, Employee↔Channel bindings) as a queryable seam for future surfaces (a unified
 * inbox, cross-channel analytics). Intentionally NO UI and NO public API route this sprint
 * — "minimum internal plumbing" per the approved scope. Every query carries org_id.
 */

export interface ConversationSummary {
  id: string;
  channel: string;
  status: string | null;
  contact_id: string | null;
  agent_id: string | null;
  external_thread_id: string | null;
  last_message_at: string | null;
  created_at: string;
}

export interface PlatformMessage {
  id: string;
  role: string;
  content: string;
  direction: string | null;
  created_at: string;
}

/** List an org's conversations (optionally filtered by channel), newest activity first. */
export async function listConversations(
  orgId: string,
  opts: { channel?: Channel; limit?: number } = {},
  db: SupabaseClient = supabaseAdmin
): Promise<ConversationSummary[]> {
  if (!orgId) return [];
  let q = db
    .from("conversations")
    .select("id, channel, status, contact_id, agent_id, external_thread_id, last_message_at, created_at")
    .eq("org_id", orgId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(opts.limit ?? 50);
  if (opts.channel) q = q.eq("channel", opts.channel);
  const { data, error } = await q;
  if (error) {
    console.error("[PLATFORM][READ][CONVERSATIONS]", error.message);
    return [];
  }
  return (data ?? []) as ConversationSummary[];
}

/** Fetch one conversation's messages (org-scoped), oldest first. */
export async function getConversationMessages(
  orgId: string,
  conversationId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<PlatformMessage[]> {
  if (!orgId || !conversationId) return [];
  const { data, error } = await db
    .from("messages")
    .select("id, role, content, direction, created_at")
    .eq("org_id", orgId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[PLATFORM][READ][MESSAGES]", error.message);
    return [];
  }
  return (data ?? []) as PlatformMessage[];
}

/** List the channels an Employee (agent) is bound to. */
export async function listEmployeeChannels(
  orgId: string,
  employeeId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<Array<{ channel: string; status: string; external_id: string | null }>> {
  if (!orgId || !employeeId) return [];
  const { data, error } = await db
    .from("employee_channels")
    .select("channel, status, external_id")
    .eq("org_id", orgId)
    .eq("employee_id", employeeId);
  if (error) {
    console.error("[PLATFORM][READ][EMPLOYEE_CHANNELS]", error.message);
    return [];
  }
  return (data ?? []) as Array<{ channel: string; status: string; external_id: string | null }>;
}
