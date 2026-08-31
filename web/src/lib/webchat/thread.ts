import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * What the visitor's browser is allowed to see of their own conversation.
 *
 * This is the read side of the transport: with no provider to push to, a reply reaches the
 * visitor because this function returns it. So it is also a disclosure boundary, and it is
 * narrow on purpose:
 *
 *   - **Only `content`, `role` and a timestamp.** Not `meta` — that carries `generated`,
 *     `sent_by`, artifact ids and the employee's internal reasoning about the thread. A
 *     customer messaging a shop has no business learning which staff member typed a reply, or
 *     that the AI opened ticket #482 about them.
 *   - **Only `assistant` and `user` roles.** A `system` message is instruction, never dialogue.
 *   - **Always scoped by org AND conversation**, both taken from the signed session token. The
 *     service-role client has no safety net; a missing filter here would be a cross-tenant leak
 *     readable by anyone with a browser.
 *
 * A person answering from the Inbox and the AI answering produce the same row, so a human
 * takeover appears in the widget with no extra code — which is the whole point of routing both
 * through one transport.
 */

export interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

/** Newest-last, capped. The cap is a page size, not a retention rule. */
export async function loadThread(
  orgId: string,
  conversationId: string,
  options: { after?: string | null; limit?: number } = {}
): Promise<ThreadMessage[]> {
  if (!orgId || !conversationId) return [];
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);

  try {
    let query = supabaseAdmin
      .from("messages")
      .select("id, role, content, created_at")
      .eq("org_id", orgId)
      .eq("conversation_id", conversationId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(limit);

    // The cursor is a timestamp rather than an id because that is what the widget can hold
    // without us handing it our primary keys.
    if (options.after) query = query.gt("created_at", options.after);

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((row) => ({
      id: String(row.id),
      role: row.role === "assistant" ? "assistant" : "user",
      content: String(row.content ?? ""),
      createdAt: String(row.created_at),
    }));
  } catch (err) {
    console.error("[WEBCHAT][THREAD][READ][ERROR]", err instanceof Error ? err.message : String(err));
    return [];
  }
}
