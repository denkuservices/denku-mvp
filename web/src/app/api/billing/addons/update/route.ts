import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import {
  isChatAddonKey,
  otherChatAddonKey,
  refuseChatPurchase,
} from "@/lib/billing/chatPlanKeys";
import { z } from "zod";
import Stripe from "stripe";
import { getStripeClient } from "@/app/api/billing/stripe/create-draft-invoice-helpers";
import { notifyAddonChanged } from "@/lib/billing/lifecycleNotifications";
import { getEffectiveLimits } from "@/lib/billing/limits";
import { guard } from "@/lib/auth/permissions";
import { logAuditEvent } from "@/lib/audit/log";

/**
 * Get current month start in UTC (YYYY-MM-01 format).
 */
function getCurrentMonthStart(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

/**
 * Request schema for addon update.
 */
const RequestSchema = z.object({
  // `chat_basic` / `chat_standard` sell chat capacity (how many channels the AI may
  // answer on). They reuse this route wholesale — the Stripe flow, the idempotency key
  // and the invoice-staleness marking are all already correct for them.
  addon_key: z.enum(["extra_concurrency", "extra_phone", "chat_basic", "chat_standard"]),
  qty: z.number().int().min(0).max(100),
});

/**
 * POST /api/billing/addons/update
 * 
 * Updates add-on quantity for authenticated user's organization.
 * Updates billing_org_addons and marks current month invoice as stale.
 */
export async function POST(req: NextRequest) {
  try {
    // 1) Authenticate AND authorize. This route adds a paid line item to a live Stripe
    // subscription; a signed-in `viewer` could previously do it. `manage_billing` is owner/admin.
    //
    // The phone-line purchase calls this route over HTTP forwarding the buyer's cookies
    // (see CLAUDE.md landmine #7) — that path stays working because a buyer who may purchase a
    // line is already owner or admin, and if they are not, refusing here is the correct outcome.
    const gate = await guard("manage_billing");
    if (!gate.ok) return gate.response;
    const org_id = gate.viewer.orgId;

    // 2) Check if workspace is billing-paused
    const { data: orgSettings } = await supabaseAdmin
      .from("organization_settings")
      .select("workspace_status, paused_reason")
      .eq("org_id", org_id)
      .maybeSingle<{
        workspace_status: "active" | "paused" | null;
        paused_reason: string | null;
      }>();

    const workspaceStatus = orgSettings?.workspace_status ?? "active";
    const pausedReason = orgSettings?.paused_reason;
    const isBillingPaused =
      workspaceStatus === "paused" &&
      (pausedReason === "hard_cap" || pausedReason === "past_due");

    // 4) Parse and validate request body
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parseResult = RequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { ok: false, error: "Validation failed", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { addon_key, qty } = parseResult.data;

    // 5) Get current quantity
    const { data: currentAddon } = await supabaseAdmin
      .from("billing_org_addons")
      .select("qty, status")
      .eq("org_id", org_id)
      .eq("addon_key", addon_key)
      .maybeSingle<{ qty: number; status: string | null }>();

    const currentQty = currentAddon?.qty ? Number(currentAddon.qty) : 0;
    const isIncreasing = qty > currentQty;

    // A chat tier is a choice, not a quantity, and only one may be held at a time. Both rules
    // live in `chatPlanKeys.refuseChatPurchase` so they are testable without auth, Stripe and
    // Supabase standing behind them; the reasoning is documented there.
    if (isChatAddonKey(addon_key)) {
      const otherKey = otherChatAddonKey(addon_key);
      let otherChatQty = 0;

      if (otherKey && isIncreasing) {
        const { data: otherAddon } = await supabaseAdmin
          .from("billing_org_addons")
          .select("qty, status")
          .eq("org_id", org_id)
          .eq("addon_key", otherKey)
          .maybeSingle<{ qty: number; status: string | null }>();

        if (otherAddon?.status === "active") {
          otherChatQty = Number(otherAddon.qty ?? 0);
        }
      }

      const refusal = refuseChatPurchase({
        addonKey: addon_key,
        qty,
        isIncreasing,
        otherChatQty,
      });

      if (refusal) {
        return NextResponse.json(
          { ok: false, error: refusal.error },
          { status: refusal.status }
        );
      }
    }

    // 6) Block increases if billing-paused (but allow decreases to 0)
    if (isBillingPaused && isIncreasing) {
      logEvent({
        tag: "[BILLING][ADDON_UPDATE][BLOCKED]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "warn",
        details: {
          addon_key: addon_key,
          current_qty: currentQty,
          requested_qty: qty,
          paused_reason: pausedReason,
        },
      });

      return NextResponse.json(
        { ok: false, error: "Billing paused; cannot increase add-ons" },
        { status: 409 }
      );
    }

    // 7) Fetch Stripe price_id from billing_addon_catalog
    const { data: addonCatalog } = await supabaseAdmin
      .from("billing_addon_catalog")
      .select("stripe_price_id")
      .eq("addon_key", addon_key)
      .eq("is_active", true)
      .maybeSingle<{ stripe_price_id: string | null }>();

    if (!addonCatalog?.stripe_price_id) {
      logEvent({
        tag: "[BILLING][ADDON_UPDATE][CONFIG_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          addon_key: addon_key,
          error: "stripe_price_id not configured for addon",
        },
      });

      return NextResponse.json(
        { ok: false, error: "Add-on configuration error. Please contact support." },
        { status: 500 }
      );
    }

    const stripePriceId = addonCatalog.stripe_price_id;

    // 8) Fetch Stripe customer_id from billing_stripe_customers
    const { data: stripeCustomer } = await supabaseAdmin
      .from("billing_stripe_customers")
      .select("stripe_customer_id")
      .eq("org_id", org_id)
      .maybeSingle<{ stripe_customer_id: string | null }>();

    if (!stripeCustomer?.stripe_customer_id) {
      // Same reasoning as the subscription case below: this sentence reaches a shop owner as-is.
      console.warn("[BILLING][ADDON][NO_CUSTOMER]", { org_id, addon_key });
      return NextResponse.json(
        {
          ok: false,
          error:
            "This workspace is not set up with our payment provider yet, so add-ons cannot be purchased. Choose a plan first, or contact support.",
        },
        { status: 409 }
      );
    }

    const stripeCustomerId = stripeCustomer.stripe_customer_id;

    // 9) Update Stripe subscription items (BEFORE DB update)
    try {
      const stripe = getStripeClient();

      /**
       * Which subscription is this add-on going onto?
       *
       * Asked of Stripe every time, deliberately. There used to be a cache in front of this: read
       * `billing_stripe_customers.stripe_subscription_id`, and write it back "for future use".
       * **That column does not exist.** The read errored into a discarded `data`, the write failed
       * silently, and every request fell through to the Stripe call anyway — so the cache never
       * cached anything and its only effect was two pointless round trips and a misleading
       * comment. Stripe is the source of truth for what a customer is subscribed to; asking it is
       * the correct thing to do, not the fallback.
       */
      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: "active",
        limit: 10,
      });

      // A subscription still inside its trial can take a line item just like an active one.
      if (subscriptions.data.length === 0) {
        const trialingSubs = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          status: "trialing",
          limit: 10,
        });
        subscriptions.data.push(...trialingSubs.data);
      }

      // Newest wins: an org that re-subscribed has an old cancelled one lying around.
      subscriptions.data.sort((a: Stripe.Subscription, b: Stripe.Subscription) => b.created - a.created);
      const subscriptionId: string | null = subscriptions.data[0]?.id ?? null;

      if (!subscriptionId) {
        /**
         * A plan in our database with no subscription in Stripe.
         *
         * Real, and reachable: a workspace whose plan was set without a completed checkout — a
         * support action, an abandoned payment, a plan granted during development. Add-ons are
         * sold as line items on a subscription, so there is genuinely nothing to add this to.
         *
         * The message says that in words, because it is shown to a shop owner verbatim in the
         * confirmation dialog. "No active Stripe subscription found" is an error code wearing a
         * sentence's clothes: true, unactionable, and indistinguishable from a bug.
         */
        console.warn("[BILLING][ADDON][NO_SUBSCRIPTION]", { org_id, addon_key });
        return NextResponse.json(
          {
            ok: false,
            /**
             * A machine-readable name for the one refusal a caller can recover from.
             *
             * Chat can still be sold here — through its own checkout, which creates the
             * subscription this workspace is missing. The billing page routes on this code rather
             * than on the sentence, because matching on prose is how a copy edit becomes an
             * outage. The sentence stays for everything else, which has no recovery.
             */
            code: "no_subscription",
            error:
              "This workspace has a plan but no active subscription in our payment provider, so there is nothing to add this to. Contact support and we will sort the billing out.",
          },
          { status: 409 }
        );
      }

      // Fetch subscription with expanded items
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["items.data.price"],
      });

      // Find existing subscription item with matching price_id
      const existingItem = subscription.items.data.find(
        (item: Stripe.SubscriptionItem) => {
          const priceId = typeof item.price === "string" ? item.price : item.price.id;
          return priceId === stripePriceId;
        }
      );

      // Generate idempotency key
      const idempotencyKey = `addon_update:${org_id}:${addon_key}:${qty}`;

      if (qty > 0) {
        if (existingItem) {
          // Update existing item quantity
          await stripe.subscriptionItems.update(
            existingItem.id,
            { quantity: qty },
            { idempotencyKey }
          );
        } else {
          // Add new subscription item
          await stripe.subscriptionItems.create(
            {
              subscription: subscriptionId,
              price: stripePriceId,
              quantity: qty,
            },
            { idempotencyKey }
          );
        }
      } else {
        // qty == 0: delete the subscription item
        if (existingItem) {
          await stripe.subscriptionItems.del(existingItem.id, {
            idempotencyKey,
          });
        }
      }
    } catch (stripeErr) {
      const errorMsg = stripeErr instanceof Error ? stripeErr.message : "Stripe update failed";
      
      logEvent({
        tag: "[BILLING][ADDON_UPDATE][STRIPE_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          addon_key: addon_key,
          qty: qty,
          stripe_price_id: stripePriceId,
          error: errorMsg,
        },
      });

      return NextResponse.json(
        { ok: false, error: `Payment service error: ${errorMsg}` },
        { status: 502 }
      );
    }

    // 10) Upsert billing_org_addons (AFTER Stripe succeeds)
    const upsertData: {
      org_id: string;
      addon_key: string;
      qty: number;
      status: string;
      updated_at: string;
    } = {
      org_id: org_id,
      addon_key: addon_key,
      qty: qty,
      status: qty > 0 ? "active" : "inactive",
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabaseAdmin
      .from("billing_org_addons")
      .upsert(upsertData, { onConflict: "org_id,addon_key" });

    if (upsertError) {
      logEvent({
        tag: "[BILLING][ADDON_UPDATE][UPSERT_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          addon_key: addon_key,
          qty: qty,
          error: upsertError.message,
        },
      });

      return NextResponse.json(
        { ok: false, error: "Failed to update add-on" },
        { status: 500 }
      );
    }

    // 11) Mark current month invoice as stale (invalidate draft invoice)
    const currentMonth = getCurrentMonthStart();
    await supabaseAdmin
      .from("billing_invoice_runs")
      .update({
        status: "stale",
        stripe_invoice_id: null,
      })
      .eq("org_id", org_id)
      .eq("month", currentMonth);

    // 12) Log draft invoice invalidation
    logEvent({
      tag: "[BILLING][DRAFT_INVALIDATED][ADDON_CHANGE]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: org_id,
      severity: "info",
      details: {
        addon_key: addon_key,
        qty: qty,
        month: currentMonth,
      },
    });

    // 13) Log addon update event
    logEvent({
      tag: "[BILLING][ADDON_UPDATE]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: org_id,
      severity: "info",
      details: {
        addon_key: addon_key,
        previous_qty: currentQty,
        new_qty: qty,
        month: currentMonth,
      },
    });

    // 14) Confirm the change by email. Add-ons move both the bill and the capability, and
    // until now they moved both silently. Deduped on (org, addon, qty) so a re-submitted
    // form does not re-confirm the same state; never throws — the purchase already happened.
    try {
      const limits = await getEffectiveLimits(org_id);
      const effectiveTotal =
        addon_key === "extra_phone"
          ? limits.included_phones
          : addon_key === "extra_concurrency"
          ? limits.max_concurrent_calls
          : null;

      await notifyAddonChanged(org_id, {
        addonKey: addon_key,
        qty,
        previousQty: currentQty,
        effectiveTotal,
      });
    } catch (notifyErr) {
      console.error("[BILLING][ADDON_UPDATE] Confirmation email failed (non-fatal)", notifyErr);
    }

    // 15) Record it. An add-on moves the monthly bill and the capability ceiling; the audit log
    // claimed to cover billing and never saw one of these.
    await logAuditEvent({
      org_id,
      actor_user_id: gate.viewer.profileId,
      action: qty > currentQty ? "billing.addon.increase" : "billing.addon.decrease",
      entity_type: "billing.addon",
      entity_id: org_id,
      diff: { [addon_key]: { before: currentQty, after: qty } },
    });

    // 16) Return success
    // TODO(billing): When we generate Stripe invoices, include add-on line items derived from:
    // - public.billing_org_addons (org_id, addon_key, qty)
    // - public.billing_addon_catalog (addon_key -> Stripe price metadata)
    // so add-ons like extra_phone can be billed as $/month per unit.
    return NextResponse.json({
      ok: true,
      addon_key: addon_key,
      qty: qty,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    logEvent({
      tag: "[BILLING][ADDON_UPDATE][ERROR]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "error",
      details: {
        error: errorMsg,
      },
    });

    return NextResponse.json(
      {
        ok: false,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}
