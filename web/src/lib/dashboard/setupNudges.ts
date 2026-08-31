import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getChatEntitlement } from "@/lib/billing/chatEntitlement";

/**
 * The two things a workspace can be paying for and not getting.
 *
 * Both are deliberately EARNED rather than nagged. A setup checklist that appears the moment
 * you sign in gets dismissed and never read again; these appear only once there is evidence the
 * customer is losing something real, and they say what that something is.
 *
 * Neither is a progress bar. There is no "complete your profile" score here, because a score
 * invents an obligation the product does not actually have — a workspace with no business
 * context still works, it is just less useful, and the honest thing is to say exactly that.
 */

export type SetupNudge =
  | {
      kind: "knowledge";
      /** How many conversations the AI has handled while knowing nothing about the business. */
      conversations: number;
      /** Where to go and fix it. */
      href: string;
    }
  | {
      kind: "unused_chat_slots";
      /** Channel slots bought. */
      slots: number;
      /** Channels actually connected. */
      connected: number;
      href: string;
    };

/** Fields that make the AI able to answer instead of hand over. Name alone is not knowledge. */
const KNOWLEDGE_FIELDS = [
  "services",
  "openingHours",
  "serviceArea",
  "faqs",
  "bookingPolicy",
  "cancellationPolicy",
] as const;

function hasRealKnowledge(context: unknown): boolean {
  if (!context || typeof context !== "object") return false;
  const ctx = context as Record<string, unknown>;
  return KNOWLEDGE_FIELDS.some((f) => {
    const v = ctx[f];
    return typeof v === "string" && v.trim().length > 0;
  });
}

/**
 * What this workspace is missing, if anything.
 *
 * Never throws and never blocks a page render: a nudge is the least important thing on the
 * dashboard, and a failure to compute one must not cost the customer the numbers they came for.
 */
export async function getSetupNudges(orgId: string): Promise<SetupNudge[]> {
  if (!orgId) return [];

  try {
    const [agents, conversations, entitlement, telegram, email] = await Promise.all([
      supabaseAdmin
        .from("agents")
        .select("id, business_context")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true })
        .limit(1),
      supabaseAdmin
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId),
      getChatEntitlement(orgId),
      supabaseAdmin
        .from("telegram_connections")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "connected"),
      supabaseAdmin
        .from("email_connections")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "connected"),
    ]);

    const nudges: SetupNudge[] = [];

    /**
     * Knowledge gap.
     *
     * Only shown once the AI has actually spoken to someone. Before that there is no evidence,
     * and telling a customer their AI is under-informed before it has answered anyone is a
     * checklist wearing a warning's clothes.
     *
     * The claim is kept to what is provably true: the AI handled N conversations and its
     * knowledge is empty. It deliberately does NOT claim "it failed to answer N questions" —
     * nothing in the schema distinguishes a ticket raised because the AI did not know something
     * from one raised because the customer asked for a human, and inventing that number would be
     * the same kind of unearned precision this product refuses everywhere else.
     */
    const agent = agents.data?.[0] as { business_context?: unknown } | undefined;
    const conversationCount = conversations.count ?? 0;
    if (agent && !hasRealKnowledge(agent.business_context) && conversationCount > 0) {
      nudges.push({
        kind: "knowledge",
        conversations: conversationCount,
        href: "/dashboard/team",
      });
    }

    /**
     * Paid chat capacity going unused.
     *
     * The rule is slots bought vs channels CONNECTED — not channels activated. A workspace that
     * bought one channel and connected one is finished, and telling it otherwise would be noise.
     * A workspace that bought two and connected one is paying for something it is not using, and
     * has a right to know.
     */
    const connectedCount = (telegram.count ?? 0) + (email.count ?? 0);
    if (entitlement.slots > 0 && connectedCount < entitlement.slots) {
      nudges.push({
        kind: "unused_chat_slots",
        slots: entitlement.slots,
        connected: connectedCount,
        href: "/dashboard/channels",
      });
    }

    return nudges;
  } catch (err) {
    console.error("[SETUP_NUDGES][FAILED]", {
      org_id: orgId,
      error: err instanceof Error ? err.message : "unknown",
    });
    return [];
  }
}
