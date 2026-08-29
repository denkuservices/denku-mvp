"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setHandlingState, type HandlingMode, type ConversationSource } from "@/lib/platform/handling";
import { isKnownChannel, type Channel } from "@/lib/platform/channels";
import { setStar } from "@/lib/platform/stars";
import { markRead } from "@/lib/platform/reads";
import { discardDraft } from "@/lib/platform/drafts";
import { sendHumanReply } from "@/lib/platform/reply/humanReply";
import {
  listInboxPage,
  INBOX_PAGE_SIZE,
  type InboxFilter,
  type InboxPage,
} from "@/lib/platform/readModel/inbox";

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
    /**
     * Only the conversation, not the whole Inbox.
     *
     * Revalidating "/dashboard/inbox" re-runs the layout — which fetches a page of rows — and the
     * list is a client component holding its own state, so that output is discarded. It was work
     * on every star and every takeover that changed nothing a viewer could see.
     */
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
    /**
     * Only the conversation, not the whole Inbox.
     *
     * Revalidating "/dashboard/inbox" re-runs the layout — which fetches a page of rows — and the
     * list is a client component holding its own state, so that output is discarded. It was work
     * on every star and every takeover that changed nothing a viewer could see.
     */
    revalidatePath(`/dashboard/inbox/${conversationRef}`);
  }
  return res;
}

/**
 * One page of Inbox rows for the split view's list panel.
 *
 * **Why the list fetches through an action rather than a page render:** the list is a persistent
 * pane. It stays mounted while you move from one conversation to the next, which is the whole
 * point of a split view — the scroll position, the search you typed and the filter you chose all
 * survive selection. A server-rendered list would be rebuilt on every click and lose all three.
 * The action keeps auth and org-scoping on the server exactly as a page render would, so nothing
 * is traded away for that.
 */
export async function fetchInboxPageAction(query: {
  channel?: string;
  search?: string;
  filter?: string;
  offset?: number;
  limit?: number;
}): Promise<{ ok: boolean; page?: InboxPage; error?: string }> {
  const auth = await requireOrgMember();
  if (!auth.ok) return { ok: false, error: auth.error };

  const channel = query.channel && isKnownChannel(query.channel) ? query.channel : undefined;
  const filter: InboxFilter =
    query.filter === "starred" || query.filter === "human" ? query.filter : "all";

  const page = await listInboxPage(auth.orgId, auth.userId, {
    channel,
    search: query.search ?? "",
    filter,
    offset: Math.max(0, Number(query.offset) || 0),
    limit: Math.min(100, Math.max(1, Number(query.limit) || INBOX_PAGE_SIZE)),
  });

  return { ok: true, page };
}

/**
 * Star or unstar a conversation. Any member may star: it is the org's flag, not a personal one
 * (see `lib/platform/stars.ts`), so the gate matches the one on takeover rather than the
 * owner/admin gate that guards channel connection.
 */
export async function setConversationStarAction(
  conversationRef: string,
  source: string,
  channel: string,
  starred: boolean
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgMember();
  if (!auth.ok) return { ok: false, error: auth.error };

  const valid = validate(conversationRef, source, channel);
  if (!valid.ok) return { ok: false, error: valid.error };

  const res = await setStar({
    orgId: auth.orgId,
    conversationRef,
    source: valid.source,
    channel: valid.channel,
    starred,
    userId: auth.userId,
  });

  if (res.ok) {
    /**
     * Only the conversation, not the whole Inbox.
     *
     * Revalidating "/dashboard/inbox" re-runs the layout — which fetches a page of rows — and the
     * list is a client component holding its own state, so that output is discarded. It was work
     * on every star and every takeover that changed nothing a viewer could see.
     */
    revalidatePath(`/dashboard/inbox/${conversationRef}`);
  }
  return res;
}

/**
 * Record that the caller has seen everything in this conversation up to now.
 *
 * Fired when a conversation is opened. Failing to remember a read must never break opening one,
 * so this reports its failure and the UI ignores it — the badge simply comes back on reload.
 */
export async function markConversationReadAction(
  conversationRef: string,
  source: string,
  channel: string
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgMember();
  if (!auth.ok) return { ok: false, error: auth.error };

  const valid = validate(conversationRef, source, channel);
  if (!valid.ok) return { ok: false, error: valid.error };

  return markRead({
    orgId: auth.orgId,
    userId: auth.userId,
    conversationRef,
    source: valid.source,
  });
}

/**
 * Answer a customer yourself, from the Inbox.
 *
 * Deliberately available to **any org member**, like takeover: the people answering customers are
 * usually not the admins who connected the channel.
 *
 * Only chat conversations sourced from `conversations` can be replied to — a voice conversation is
 * a phone call that already ended, and its `conversationRef` is a `calls` row with no thread to
 * send into. `sendHumanReply` enforces the rest (the channel must actually have a transport) and
 * flips the conversation to human handling so the AI stops answering over the person.
 */
export async function sendInboxReplyAction(
  conversationRef: string,
  source: string,
  channel: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgMember();
  if (!auth.ok) return { ok: false, error: auth.error };

  const valid = validate(conversationRef, source, channel);
  if (!valid.ok) return { ok: false, error: valid.error };
  if (valid.source !== "conversations") {
    return { ok: false, error: "This was a phone call — there is nothing to reply to." };
  }

  const res = await sendHumanReply({
    orgId: auth.orgId,
    conversationId: conversationRef,
    channel: valid.channel,
    text,
    userId: auth.userId,
  });

  // The thread gained a message and the handling state changed; the list did not.
  if (res.ok) revalidatePath(`/dashboard/inbox/${conversationRef}`);
  return res;
}

/**
 * Send the reply the AI drafted.
 *
 * `text` is what is in the composer, which may be what the AI wrote or the owner's edit of it —
 * we never send the stored draft, always the words on screen, because an edit that silently did
 * not take is worse than no draft at all.
 *
 * `takeover: false` is the point of this action existing rather than reusing the plain reply
 * path: approving what the AI wrote is not taking the conversation away from it. The draft is
 * cleared only after the send succeeds, so a failed send leaves it recoverable.
 */
export async function approveDraftAction(
  conversationRef: string,
  source: string,
  channel: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgMember();
  if (!auth.ok) return { ok: false, error: auth.error };

  const valid = validate(conversationRef, source, channel);
  if (!valid.ok) return { ok: false, error: valid.error };
  if (valid.source !== "conversations") {
    return { ok: false, error: "This was a phone call — there is nothing to reply to." };
  }

  const res = await sendHumanReply({
    orgId: auth.orgId,
    conversationId: conversationRef,
    channel: valid.channel,
    text,
    userId: auth.userId,
    takeover: false,
    generated: true,
  });

  if (!res.ok) return res;

  await discardDraft(auth.orgId, conversationRef);
  revalidatePath(`/dashboard/inbox/${conversationRef}`);
  return res;
}

/** Throw away a draft without sending it. The conversation stays with the AI. */
export async function discardDraftAction(
  conversationRef: string,
  source: string,
  channel: string
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgMember();
  if (!auth.ok) return { ok: false, error: auth.error };

  const valid = validate(conversationRef, source, channel);
  if (!valid.ok) return { ok: false, error: valid.error };

  const ok = await discardDraft(auth.orgId, conversationRef);
  if (ok) revalidatePath(`/dashboard/inbox/${conversationRef}`);
  return ok ? { ok: true } : { ok: false, error: "Could not discard the draft." };
}
