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
