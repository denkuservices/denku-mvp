import "server-only";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Finding the workspace's live subscription, and telling the plan apart from the add-ons on it.
 *
 * Both live here because getting either wrong costs money in a way nobody notices for a month:
 * a missed subscription means a change that never reaches Stripe, and a misidentified item means
 * changing the price of someone's extra phone number when they asked to upgrade their plan.
 */

/**
 * The org's active subscription id, from the DB when we have it and from Stripe when we do not.
 *
 * Falls back to the API because `stripe_subscription_id` was added after the first subscriptions
 * were created, so an early workspace has a live subscription and a null column. The id is written
 * back when found, so the fallback runs once per workspace rather than once per request.
 *
 * Returns null rather than throwing: the caller decides whether "no subscription" is an error
 * (changing a paid plan) or simply nothing to do.
 */
export async function findActiveSubscriptionId(
  stripe: Stripe,
  orgId: string,
  stripeCustomerId: string
): Promise<string | null> {
  const { data: row } = await supabaseAdmin
    .from("billing_stripe_customers")
    .select("stripe_subscription_id")
    .eq("org_id", orgId)
    .maybeSingle<{ stripe_subscription_id: string | null }>();

  if (row?.stripe_subscription_id) return row.stripe_subscription_id;

  const active = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "active",
    limit: 10,
  });
  const candidates = [...active.data];

  if (candidates.length === 0) {
    const trialing = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "trialing",
      limit: 10,
    });
    candidates.push(...trialing.data);
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.created - a.created);
  const found = candidates[0].id;

  await supabaseAdmin
    .from("billing_stripe_customers")
    .update({ stripe_subscription_id: found })
    .eq("org_id", orgId);

  return found;
}

/**
 * Which item on the subscription is the PLAN?
 *
 * Add-ons are the only items created from catalogue price ids (`billing_addon_catalog`), and the
 * plan is created from inline `price_data` at checkout — it has no catalogue id to match on. So
 * the plan is identified by elimination: the one item whose price is not an add-on's.
 *
 * Elimination is used rather than "the first item" or "the most expensive one" because both are
 * true today and neither is a rule. A workspace on starter with two extra concurrency seats has a
 * $149 plan item sitting beside a $198 add-on item, and item order is Stripe's business.
 *
 * Ambiguity returns null instead of guessing. Charging the wrong item is worse than refusing the
 * change and saying so.
 */
export async function findPlanSubscriptionItem(
  subscription: Stripe.Subscription
): Promise<Stripe.SubscriptionItem | null> {
  const { data: addons } = await supabaseAdmin
    .from("billing_addon_catalog")
    .select("stripe_price_id");

  const addonPriceIds = new Set(
    (addons ?? [])
      .map((a) => (a as { stripe_price_id: string | null }).stripe_price_id)
      .filter((id): id is string => Boolean(id))
  );

  const planItems = subscription.items.data.filter((item) => {
    const priceId = typeof item.price === "string" ? item.price : item.price?.id;
    return priceId ? !addonPriceIds.has(priceId) : false;
  });

  return planItems.length === 1 ? planItems[0] : null;
}
