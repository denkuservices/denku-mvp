/**
 * Which add-on keys sell chat, and how many channels each one grants.
 *
 * This is pure data with no imports on purpose. `chatEntitlement.ts` — the module that
 * decides whether the AI may answer — starts with `import "server-only"`, so anything it
 * touches is unreachable from a client component. The billing settings page IS a client
 * component and needs to know which catalogue rows are chat tiers in order to draw them
 * as alternatives rather than as another quantity stepper.
 *
 * Keeping the numbers here means the marketing page, the entitlement gate and the billing
 * UI all read the same source. A tier can never advertise two channels, grant one, and be
 * drawn as a third thing.
 */

/** Add-on keys that grant chat slots, and how many each grants. */
export const CHAT_ADDON_SLOTS: Record<string, number> = {
  chat_basic: 1,
  // Two while only Telegram and email are sellable. Becomes 3 when a third chat channel ships —
  // selling three slots against two available channels would be selling a number, not a product.
  chat_standard: 2,
};

/** True when this catalogue row is a chat tier rather than a per-piece add-on. */
export function isChatAddonKey(key: string): boolean {
  return key in CHAT_ADDON_SLOTS;
}

/**
 * The $0 base plan a chat-only workspace sits on.
 *
 * `org_plan_limits` holds exactly one `plan_code` per org, so buying chat without voice
 * still needs a base plan to point at. It carries zero minutes, zero concurrency and zero
 * phone numbers — which is also how voice stays off for these workspaces with no new code,
 * since the existing lease check rejects every call at a concurrency limit of 0.
 */
export const CHAT_ONLY_PLAN_CODE = "chat_only";

/**
 * The three plans that come with a phone line.
 *
 * `["starter", "growth", "scale"]` was written out by hand in five places — the plan-change
 * route, the two checkout entry points, the Stripe webhook and the redirect-fallback sync.
 * Four of those had to learn about `chat_only` and one deliberately must not, which is exactly
 * the situation where five copies drift apart and a purchase completes on one path but is
 * refused on another. They read from here now.
 */
export const VOICE_PLAN_CODES = ["starter", "growth", "scale"] as const;

export type VoicePlanCode = (typeof VOICE_PLAN_CODES)[number];

/** A plan that provisions a phone number. The only kind a customer picks from the plan grid. */
export function isVoicePlanCode(planCode: string): planCode is VoicePlanCode {
  return (VOICE_PLAN_CODES as readonly string[]).includes(planCode);
}

/**
 * A plan code a completed checkout may activate.
 *
 * Wider than `isVoicePlanCode` by exactly one: a chat-only purchase lands the workspace on
 * `chat_only`. Deliberately NOT used by the plan-change route — moving an existing workspace
 * onto `chat_only` would strand the phone number it is already paying for, and that is a
 * migration, not a plan switch.
 */
export function isActivatablePlanCode(planCode: string): boolean {
  return isVoicePlanCode(planCode) || planCode === CHAT_ONLY_PLAN_CODE;
}

/**
 * Whether a plan may be OFFERED in the plan grid.
 *
 * `chat_only` must not be: it is a foundation a chat-only signup lands on, not a plan a
 * customer picks. Left offerable, it would render beside Starter/Growth/Scale as a $0 card
 * with zero minutes and zero numbers, and a voice customer clicking it would downgrade
 * themselves out of the phone service they are paying for.
 *
 * It stays in the plans PAYLOAD so a chat-only workspace's header still resolves the name
 * "Chat only" rather than printing a raw plan code. Offerable and known are different
 * questions.
 */
export function isOfferablePlanCode(planCode: string): boolean {
  return planCode !== CHAT_ONLY_PLAN_CODE;
}

/** The other chat tier, for the one-plan-at-a-time rule. */
export function otherChatAddonKey(key: string): string | null {
  const others = Object.keys(CHAT_ADDON_SLOTS).filter((k) => k !== key);
  return others.length === 1 ? others[0] : null;
}

/**
 * Why a chat purchase must be refused, or `null` if it may proceed.
 *
 * Lives here, as a pure function, so the two rules can be tested without standing up
 * auth, Stripe and Supabase around the route that enforces them. The route stays the
 * only thing that decides HOW to refuse; this decides WHETHER.
 *
 * Both rules exist because a chat tier is a CHOICE, not a quantity:
 *
 *   - Quantity: `chat_standard` already means two channels, so two of it would charge
 *     $998 for four slots against two channels the AI can actually answer on. The
 *     settings UI only ever sends 0 or 1 — this guards the API, which is callable
 *     directly.
 *   - Exclusivity: holding both tiers would bill $798 for three slots, which is an
 *     incoherent purchase rather than a generous one. Switching is remove-then-add,
 *     two writes that each either happen or don't, instead of one click that can
 *     half-fail across two Stripe calls with no transaction around them.
 *
 * Decreases are never refused. Letting someone reduce or cancel must not depend on any
 * of this — that is the same reason the route allows decreases while billing is paused.
 */
export function refuseChatPurchase(input: {
  addonKey: string;
  qty: number;
  /** Whether this request raises the quantity. Decreases are always allowed. */
  isIncreasing: boolean;
  /** Active quantity of the OTHER chat tier, if any. */
  otherChatQty: number;
}): { status: number; error: string } | null {
  if (!isChatAddonKey(input.addonKey)) return null;

  if (input.qty > 1) {
    return { status: 400, error: "A chat plan is a single choice, not a quantity" };
  }

  if (input.isIncreasing && input.otherChatQty > 0) {
    return { status: 409, error: "Remove your current chat plan before adding another" };
  }

  return null;
}
