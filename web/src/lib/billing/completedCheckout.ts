import { isVoicePlanCode, isChatAddonKey, type VoicePlanCode } from "@/lib/billing/chatPlanKeys";

/**
 * What a completed Stripe checkout actually bought.
 *
 * **Four different code paths activate a completed checkout** — the webhook, the redirect the
 * onboarding success page makes, `/api/billing/checkout/complete`, and
 * `/api/billing/stripe/sync-checkout`. They exist because any one of them can be the first to
 * arrive, and they must agree completely: a purchase that activates on one and is refused on
 * another is a customer who has been charged for something they did not receive.
 *
 * They used to agree by each repeating the same `isActivatablePlanCode(plan_code)` check. That
 * worked while every purchase carried a plan code — including the fictional `chat_only`, a $0
 * voice plan invented so that a chat customer would have *something* to put in that field.
 * Retiring the fiction means a chat purchase carries no plan code at all, and four separate
 * copies of "is this valid" is exactly the shape where three get updated and one does not.
 *
 * So the decision lives here, once, as a pure function over the session metadata.
 *
 * **`chat_only` is still accepted on the way in.** A checkout session created before this shipped
 * may be sitting in a customer's browser right now; refusing it would take money and give nothing.
 * It is read as what it always meant — no voice plan — and never written again.
 */

export type CheckoutRejection = "missing_org" | "nothing_bought" | "invalid_plan";

export interface CompletedCheckout {
  ok: boolean;
  orgId: string | null;
  /** The voice plan bought, or null for a chat-only purchase. */
  voicePlanCode: VoicePlanCode | null;
  /** The chat tier bought, or null. */
  chatAddonKey: string | null;
  reason?: CheckoutRejection;
}

/** The legacy $0 base plan a chat purchase used to be parked on. Read, never written. */
const RETIRED_CHAT_ONLY = "chat_only";

export function readCompletedCheckout(
  metadata: Record<string, string | undefined> | null | undefined
): CompletedCheckout {
  const meta = metadata ?? {};
  const orgId = meta.org_id?.trim() || null;
  const rawPlan = meta.plan_code?.toLowerCase().trim() || null;
  const rawAddon = meta.chat_addon_key?.trim() || null;

  const empty: CompletedCheckout = { ok: false, orgId, voicePlanCode: null, chatAddonKey: null };

  if (!orgId) return { ...empty, reason: "missing_org" };

  const chatAddonKey = rawAddon && isChatAddonKey(rawAddon) ? rawAddon : null;

  /**
   * A plan code that is neither a voice plan nor the retired placeholder is a session we do not
   * understand. Refusing is right: activating on a guess would grant capacity from a code nobody
   * defined.
   */
  if (rawPlan && !isVoicePlanCode(rawPlan) && rawPlan !== RETIRED_CHAT_ONLY) {
    return { ...empty, chatAddonKey, reason: "invalid_plan" };
  }

  const voicePlanCode = rawPlan && isVoicePlanCode(rawPlan) ? rawPlan : null;

  // Neither product. Nothing to activate, and nothing was charged for that we can name.
  if (!voicePlanCode && !chatAddonKey) return { ...empty, reason: "nothing_bought" };

  return { ok: true, orgId, voicePlanCode, chatAddonKey };
}
