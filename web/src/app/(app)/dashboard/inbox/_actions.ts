"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setHandlingState, type HandlingMode, type ConversationSource } from "@/lib/platform/handling";
import { isKnownChannel, type Channel } from "@/lib/platform/channels";

/**
 * Inbox actions — human takeover and the customer's automation opt-out (Phase 3).
 *
 * Handling a conversation is ordinary support work, so **any member of the org** may take one
 * over. Deliberately a wider gate than the owner/admin checks guarding channel connection:
 * restricting takeover to admins would defeat its purpose on a team where admins are not the
 * people answering customers.
 */

type Caller = { ok: true; orgId: string; userId: string } | { ok: false; error: string };

async function requireOrgMember(): Promise<Caller> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("auth_user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ org_id: string | null }>();

  if (!profile?.org_id) return { ok: false, error: "No organization" };
  return { ok: true, orgId: profile.org_id, userId: user.id };
}

/** Reject anything the DB CHECK constraints would reject, with a readable message. */
function validate(
  conversationRef: string,
  source: string,
  channel: string
): { ok: true; source: ConversationSource; channel: Channel } | { ok: false; error: string } {
  if (!conversationRef) return { ok: false, error: "Missing conversation" };
  if (source !== "calls" && source !== "conversations") return { ok: false, error: "Unknown conversation source" };
  if (!isKnownChannel(channel)) return { ok: false, error: "Unknown channel" };
  return { ok: true, source, channel };
}

/**
 * Take a conversation over as a human, or hand it back to the AI. The write is scoped to the
 * caller's own org, so one org can never touch another's conversation even though the
 * underlying table is service-role.
 */
export async function setConversationHandlingAction(
  conversationRef: string,
  source: string,
  channel: string,
  handling: HandlingMode
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgMember();
  if (!auth.ok) return { ok: false, error: auth.error };

  const valid = validate(conversationRef, source, channel);
  if (!valid.ok) return { ok: false, error: valid.error };
  if (handling !== "ai" && handling !== "human") return { ok: false, error: "Invalid handling" };

  const res = await setHandlingState({
    orgId: auth.orgId,
    conversationRef,
    source: valid.source,
    channel: valid.channel,
    handling,
    // Taking over assigns it to you; handing back clears the assignment.
    assignedTo: handling === "human" ? auth.userId : null,
    updatedBy: auth.userId,
  });

  if (res.ok) {
    revalidatePath("/dashboard/inbox");
    revalidatePath(`/dashboard/inbox/${conversationRef}`);
  }
  return res;
}

/**
 * Record (or clear) the customer's opt-out from automated handling. Opting out never hides the
 * conversation — the business still sees everything; it only bars automated processing.
 */
export async function setConversationOptOutAction(
  conversationRef: string,
  source: string,
  channel: string,
  optedOut: boolean
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgMember();
  if (!auth.ok) return { ok: false, error: auth.error };

  const valid = validate(conversationRef, source, channel);
  if (!valid.ok) return { ok: false, error: valid.error };

  const res = await setHandlingState({
    orgId: auth.orgId,
    conversationRef,
    source: valid.source,
    channel: valid.channel,
    automationOptedOut: optedOut,
    // Opting a customer out implies a person owns the conversation from here.
    handling: optedOut ? "human" : undefined,
    assignedTo: optedOut ? auth.userId : undefined,
    updatedBy: auth.userId,
  });

  if (res.ok) {
    revalidatePath("/dashboard/inbox");
    revalidatePath(`/dashboard/inbox/${conversationRef}`);
  }
  return res;
}
