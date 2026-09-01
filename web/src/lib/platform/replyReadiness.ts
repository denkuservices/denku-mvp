import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Channel } from "@/lib/platform/channels";
import { canReplyOn } from "@/lib/platform/transports/registry";
import { canAiReplyOnChannel } from "@/lib/billing/chatEntitlement";
import { llmConfigured } from "@/lib/llm/provider";

/**
 * "Is anyone actually going to answer this?" — asked of one conversation, answered honestly.
 *
 * The Inbox header used to state `handling === "ai"` as **"Your AI Employee is answering"**. That
 * is not what `handling` means. `handling` records only whether a *person* has taken the
 * conversation over; it says nothing about whether the AI can reply, and the AI stays silent for
 * several ordinary reasons the header knew nothing about:
 *
 *   - the workspace has not bought this chat channel (the common one, and the one that prompted
 *     this file: a real Telegram message arrived, nobody answered, and the header cheerfully
 *     claimed the AI was on it);
 *   - no employee is assigned;
 *   - the customer opted out of automated handling;
 *   - the channel has no transport at all (Instagram);
 *   - no model is configured on the deployment.
 *
 * Every one of those looks identical to the owner: a customer message with no reply under a line
 * of text promising one. Telling them which it is turns a mystery into an errand.
 *
 * **It mirrors `respondToInbound`'s gates in the same order**, deliberately. If these two ever
 * disagree the header becomes a new kind of lie, so this is the one place to look when a gate is
 * added there.
 *
 * Never throws: a failure to explain must not take the conversation down with it, so an unknown
 * answer reads as "answering" — the same optimistic default the Inbox had before, now confined to
 * the case where we genuinely do not know.
 */

export type ReplySilenceReason =
  | "human_handling"
  | "channel_cannot_reply"
  | "not_entitled"
  | "no_employee"
  | "automation_opted_out"
  | "no_model";

export interface ReplyReadiness {
  /** True when a customer writing right now would get an AI reply. */
  willAnswer: boolean;
  reason?: ReplySilenceReason;
  /** One short line for a header. Complete sentences, no jargon, no error codes. */
  label: string;
  /** Where the owner fixes it, when there is somewhere to go. */
  href?: string;
}

const ANSWERING: ReplyReadiness = { willAnswer: true, label: "Your AI Employee is answering" };

export async function describeReplyReadiness(input: {
  orgId: string;
  channel: Channel;
  handling: "ai" | "human";
  automationOptedOut?: boolean;
  /** The employee on this conversation, when the read model resolved one. */
  agentId?: string | null;
  db?: SupabaseClient;
}): Promise<ReplyReadiness> {
  const db = input.db ?? supabaseAdmin;

  if (input.handling === "human") {
    return { willAnswer: false, reason: "human_handling", label: "A person is handling this" };
  }

  try {
    if (input.automationOptedOut) {
      return {
        willAnswer: false,
        reason: "automation_opted_out",
        label: "This customer asked not to be answered automatically",
      };
    }

    // Voice replies inside the call and has no transport here, so `canReplyOn` is false for it —
    // asking would report every phone call as unanswerable. A call that reached the Inbox was
    // already answered, by definition.
    if (input.channel !== "voice" && !canReplyOn(input.channel)) {
      return {
        willAnswer: false,
        reason: "channel_cannot_reply",
        label: "Denku can't reply on this channel yet",
      };
    }

    if (!llmConfigured()) {
      return { willAnswer: false, reason: "no_model", label: "No AI model is configured yet" };
    }

    const entitlement = await canAiReplyOnChannel(input.orgId, input.channel);
    if (!entitlement.allowed) {
      return {
        willAnswer: false,
        reason: "not_entitled",
        // Says what is true and what it costs them, without naming a price the billing page owns.
        label: "Your plan doesn't answer on this channel — messages still arrive",
        href: "/dashboard/settings/workspace/billing",
      };
    }

    /**
     * An employee is resolved leniently at reply time — an unassigned connection falls back to the
     * workspace's oldest employee — so the honest question here is whether the org has ANY, not
     * whether this conversation names one.
     */
    if (!input.agentId) {
      const { count, error } = await db
        .from("agents")
        .select("id", { count: "exact", head: true })
        .eq("org_id", input.orgId);
      if (!error && (count ?? 0) === 0) {
        return {
          willAnswer: false,
          reason: "no_employee",
          label: "No AI Employee yet — nobody is answering",
          href: "/dashboard/team/new",
        };
      }
    }

    return ANSWERING;
  } catch (err) {
    console.error("[REPLY][READINESS][ERROR]", err instanceof Error ? err.message : String(err));
    return ANSWERING;
  }
}
