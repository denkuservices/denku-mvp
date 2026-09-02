import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getChatEntitlement } from "@/lib/billing/chatEntitlement";
import { isVoicePlanCode, type VoicePlanCode } from "@/lib/billing/chatPlanKeys";

/**
 * What this workspace has bought — as two independent products, which is what they are.
 *
 * **The fiction this replaces.** `org_plan_limits` holds exactly one `plan_code`, so a customer
 * who wanted chat and no phone line was parked on `chat_only`: a $0 voice plan with zero minutes,
 * zero concurrency and zero numbers. It worked, and it described a workspace by a voice plan it had
 * never bought — which meant every screen reasoning about "the plan" had to know that one of the
 * plans was not really a plan. The reason it existed at all was that `plan_code IS NULL` *meant*
 * preview mode, so a chat customer with no voice plan would have been treated as having bought
 * nothing and gated out of what they were paying for.
 *
 * So the fix is not a new column. It is answering the question the code was actually asking:
 * **has this workspace bought anything?** Once that is separate from "does it have a voice plan",
 * the fake plan has no job left and a chat customer is simply a workspace with no voice.
 *
 * Voice lives in `org_plan_limits.plan_code`; chat lives in `billing_org_addons` and is read
 * through `getChatEntitlement`, which is already the only thing that decides whether the AI may
 * answer on a chat channel. Neither gates the other.
 *
 * Fails to "bought nothing" on a broken read, which is the safe direction: it gates paid features
 * and shows an upgrade path rather than silently handing out capacity nobody paid for. That is the
 * house rule — fail open on gating, fail closed on money — and this is the money side.
 */

export interface PlanState {
  /** The voice plan, or null when this workspace has no phone service. */
  voicePlanCode: VoicePlanCode | null;
  /** How many chat channels it may answer on. 0 means chat was not bought. */
  chatSlots: number;
  /** True when it holds voice, chat, or both. */
  hasAnyPlan: boolean;
  /**
   * Whether the voice-plan read actually succeeded.
   *
   * Exists for one caller and one rule: sign-in decides between the dashboard and onboarding, and
   * that is GATING, which fails open — a broken query must never trap a paying customer in a
   * signup flow. Every other caller is deciding whether to hand out something paid for, which is
   * the money side, and there `hasAnyPlan: false` is the right answer to a failed read.
   *
   * Chat entitlement is not reflected here: `getChatEntitlement` already fails closed by its own
   * design, deliberately, and that is not a decision to relitigate from this side.
   */
  resolved: boolean;
}

const NOTHING: PlanState = { voicePlanCode: null, chatSlots: 0, hasAnyPlan: false, resolved: false };

export async function getPlanState(orgId: string): Promise<PlanState> {
  if (!orgId) return NOTHING;

  try {
    const [limits, chat] = await Promise.all([
      supabaseAdmin
        .from("org_plan_limits")
        .select("plan_code")
        .eq("org_id", orgId)
        .maybeSingle<{ plan_code: string | null }>(),
      getChatEntitlement(orgId),
    ]);

    const raw = limits.data?.plan_code ?? null;
    /**
     * `chat_only` is retired, and reading it as "no voice plan" is what makes the retirement safe
     * to do in either order: a row that has not been backfilled yet answers exactly as it will
     * after the backfill, so nothing depends on the migration having run first.
     */
    const voicePlanCode = raw && isVoicePlanCode(raw) ? raw : null;
    const chatSlots = chat.slots;

    return {
      voicePlanCode,
      chatSlots,
      hasAnyPlan: Boolean(voicePlanCode) || chatSlots > 0,
      // A "no rows" answer is a resolved question: this workspace has no voice plan.
      resolved: !limits.error,
    };
  } catch (err) {
    console.error("[BILLING][PLAN_STATE][ERROR]", err instanceof Error ? err.message : String(err));
    return NOTHING;
  }
}

/** Has this workspace bought anything at all? The inverse of preview mode. */
export async function hasAnyPaidPlan(orgId: string): Promise<boolean> {
  return (await getPlanState(orgId)).hasAnyPlan;
}
