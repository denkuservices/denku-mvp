import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { CHANNELS, type Channel } from "@/lib/platform/channels";
import { CHAT_ADDON_SLOTS } from "./chatPlanKeys";

/**
 * Chat entitlement — how many chat channels a workspace may run, and which ones are on.
 *
 * The axis is CAPACITY, not consumption. A plan says "one chat channel" or "two", not "3,000
 * messages", because a channel count is something this schema can already answer with a COUNT
 * while a message quota would need a metering pipeline that does not exist. That is a
 * deliberate MVP choice recorded in docs/LANDING_V3_DESIGN_PLAN.md §9.7 — if chat volume ever
 * needs billing, metering is built then, and nothing here has promised a number it cannot count.
 *
 * Two separate ideas, deliberately not merged:
 *
 *   - ENTITLEMENT (how many slots you bought) is derived from `billing_org_addons`. Nothing is
 *     stored, so it cannot drift from what Stripe charged.
 *   - ACTIVATION (which channels you switched on) lives in `org_active_channels`. A workspace
 *     may CONNECT more channels than it is entitled to — that is on purpose, so a customer can
 *     set everything up and watch messages arrive before paying. Only activated channels are
 *     answered.
 *
 * Voice is never gated here. It is entitled by the base plan's concurrency limit, which the
 * lease check already enforces.
 *
 * Everything fails SOFT to "not entitled": a broken query must not silently start answering on
 * a channel nobody paid for. That is the money-side of the house rule — fail open on gating,
 * fail closed on money.
 */

// The slot table lives in `chatPlanKeys.ts` — pure data, no `server-only` — so the billing
// settings page (a client component) can read the same numbers this gate enforces.
export { CHAT_ADDON_SLOTS } from "./chatPlanKeys";

export type ChatEntitlement = {
  /** How many chat channels this workspace may run. 0 means chat was not purchased. */
  slots: number;
  /** Channels currently switched on, capped by nothing — enforcement happens on activation. */
  active: Channel[];
  /** Slots bought but not yet used. Never negative. */
  remaining: number;
};

const EMPTY: ChatEntitlement = { slots: 0, active: [], remaining: 0 };

function isChatChannel(id: string): boolean {
  const c = CHANNELS[id as Channel];
  return Boolean(c) && c.kind === "chat";
}

export async function getChatEntitlement(orgId: string): Promise<ChatEntitlement> {
  if (!orgId) return EMPTY;

  try {
    const [addons, active] = await Promise.all([
      supabaseAdmin
        .from("billing_org_addons")
        .select("addon_key, qty")
        .eq("org_id", orgId)
        .eq("status", "active"),
      supabaseAdmin
        .from("org_active_channels")
        // Ordered so the downgrade rule below is deterministic: the channels switched
        // on first are the ones that keep working when slots shrink.
        .select("channel, activated_at")
        .eq("org_id", orgId)
        .order("activated_at", { ascending: true }),
    ]);

    // A missing table (before the migration is applied) or a failed read reads as "not
    // purchased" rather than as "allow everything".
    if (addons.error) return EMPTY;

    const slots = (addons.data ?? []).reduce((sum, row) => {
      const per = CHAT_ADDON_SLOTS[String(row.addon_key)] ?? 0;
      const qty = Number(row.qty) || 0;
      return sum + per * Math.max(0, qty);
    }, 0);

    const activeIds = active.error
      ? []
      : (active.data ?? [])
          .map((r) => String(r.channel))
          .filter(isChatChannel) as Channel[];

    return {
      slots,
      active: activeIds,
      remaining: Math.max(0, slots - activeIds.length),
    };
  } catch {
    return EMPTY;
  }
}

/**
 * May the AI answer on this channel for this workspace?
 *
 * Voice is always allowed — it is gated by the plan's concurrency limit at the lease, not here.
 * A chat channel is allowed only when it is both entitled and switched on, and only while the
 * number of switched-on channels is within what was bought (so a downgrade takes effect without
 * anyone having to go and deactivate channels by hand).
 */
export async function canAiReplyOnChannel(
  orgId: string,
  channel: string
): Promise<{ allowed: boolean; reason?: string }> {
  if (!isChatChannel(channel)) return { allowed: true };

  const ent = await getChatEntitlement(orgId);
  if (ent.slots <= 0) return { allowed: false, reason: "chat_not_purchased" };

  if (!ent.active.includes(channel as Channel)) {
    /**
     * A paid slot going spare claims itself on the first message.
     *
     * Without this the feature would look broken after a sale: buying a plan fills the slot
     * count but `org_active_channels` starts empty, so the AI would stay silent until someone
     * found a settings screen that does not exist yet. Claiming on first use is also what the
     * customer means — they connected the channel and a message arrived.
     *
     * It only ever claims a slot that was already paid for, and the claim is idempotent, so a
     * retried webhook cannot consume two. Deactivating stays a deliberate act.
     */
    if (ent.remaining > 0 && (await claimSlot(orgId, channel as Channel))) {
      return { allowed: true };
    }
    return { allowed: false, reason: "channel_not_activated" };
  }
  // A downgrade leaves more channels switched on than were bought. Rather than guessing which
  // one the customer wanted, the oldest activations keep working and the rest go quiet — a
  // stable, explainable rule the customer can correct in Settings.
  const withinPlan = ent.active.slice(0, ent.slots);
  if (!withinPlan.includes(channel as Channel)) {
    return { allowed: false, reason: "over_plan_slots" };
  }
  return { allowed: true };
}

/**
 * Record a channel as switched on. Idempotent — the primary key is (org_id, channel), so a
 * concurrent retry lands on the same row rather than consuming a second slot.
 *
 * Returns false when the write fails (including before the migration is applied), which leaves
 * the caller refusing the reply. Failing to claim must never read as "allowed".
 */
async function claimSlot(orgId: string, channel: Channel): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from("org_active_channels")
      .upsert({ org_id: orgId, channel }, { onConflict: "org_id,channel", ignoreDuplicates: true });
    if (error) return false;
    console.info("[CHAT][SLOT][CLAIMED]", { org_id: orgId, channel });
    return true;
  } catch {
    return false;
  }
}

/**
 * Record a completed chat purchase.
 *
 * Both completion paths call this — the Stripe webhook and the redirect fallback the success
 * page uses when the webhook is slow. They must agree: if only one wrote the add-on row, a
 * customer's experience of whether chat works would depend on which arrived first.
 *
 * Idempotent on `(org_id, addon_key)`, because users refresh the success URL and Stripe retries
 * webhooks. `qty` is fixed at 1 — a tier is a choice, not a quantity, the same rule
 * `refuseChatPurchase` enforces on the add-on route.
 *
 * A workspace can only hold one tier, so any OTHER chat tier is cleared first. Without that, a
 * customer who bought the one-channel tier and later re-ran checkout for two would end up
 * holding both: billed twice, and granted three slots against two answerable channels.
 *
 * Never throws. A completion path that threw here would fail a webhook Stripe has already
 * charged for; the error is logged and the caller carries on, leaving the row to be repaired
 * rather than the payment lost.
 */
export async function recordChatPurchase(
  orgId: string,
  addonKey: string
): Promise<{ ok: boolean; error?: string }> {
  if (!orgId || !(addonKey in CHAT_ADDON_SLOTS)) {
    return { ok: false, error: "invalid_input" };
  }

  try {
    const others = Object.keys(CHAT_ADDON_SLOTS).filter((k) => k !== addonKey);
    if (others.length > 0) {
      const { error: clearError } = await supabaseAdmin
        .from("billing_org_addons")
        .update({ qty: 0, status: "inactive", updated_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .in("addon_key", others);

      // Not fatal: the purchase itself matters more than tidying the tier it replaces, and
      // the surplus is visible on the billing page rather than silent.
      if (clearError) {
        console.error("[CHAT][PURCHASE][CLEAR_OTHER_TIER_FAILED]", {
          org_id: orgId,
          error: clearError.message,
        });
      }
    }

    const { error } = await supabaseAdmin.from("billing_org_addons").upsert(
      {
        org_id: orgId,
        addon_key: addonKey,
        qty: 1,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,addon_key" }
    );

    if (error) {
      console.error("[CHAT][PURCHASE][RECORD_FAILED]", { org_id: orgId, addon_key: addonKey, error: error.message });
      return { ok: false, error: error.message };
    }

    console.info("[CHAT][PURCHASE][RECORDED]", { org_id: orgId, addon_key: addonKey });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[CHAT][PURCHASE][RECORD_THREW]", { org_id: orgId, addon_key: addonKey, error: message });
    return { ok: false, error: message };
  }
}
