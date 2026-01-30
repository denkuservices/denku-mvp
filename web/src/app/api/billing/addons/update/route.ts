import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import { z } from "zod";
import Stripe from "stripe";
import { getStripeClient } from "@/app/api/billing/stripe/create-draft-invoice-helpers";

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
  addon_key: z.enum(["extra_concurrency", "extra_phone"]),
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
    // 1) Get authenticated user
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2) Get profile and org_id
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, org_id")
      .eq("auth_user_id", user.id)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    const profile = profiles && profiles.length > 0 ? profiles[0] : null;
    const org_id = profile?.org_id ?? null;

    if (!org_id) {
      return NextResponse.json(
        { ok: false, error: "Organization not found" },
        { status: 400 }
      );
    }

    // 3) Check if workspace is billing-paused
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
      return NextResponse.json(
        { ok: false, error: "Stripe customer not found" },
        { status: 409 }
      );
    }

    const stripeCustomerId = stripeCustomer.stripe_customer_id;

    // 9) Update Stripe subscription items (BEFORE DB update)
    try {
      const stripe = getStripeClient();

      // Find active subscription: first check DB for stored subscription_id
      // Check billing_stripe_customers for stripe_subscription_id
      const { data: customerRow } = await supabaseAdmin
        .from("billing_stripe_customers")
        .select("stripe_subscription_id")
        .eq("org_id", org_id)
        .maybeSingle<{ stripe_subscription_id: string | null }>();

      let subscriptionId: string | null = customerRow?.stripe_subscription_id ?? null;

      // If not in DB, fetch from Stripe API
      if (!subscriptionId) {
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          status: "active",
          limit: 10,
        });

        // Also check trialing subscriptions
        if (subscriptions.data.length === 0) {
          const trialingSubs = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            status: "trialing",
            limit: 10,
          });
          subscriptions.data.push(...trialingSubs.data);
        }

        // Pick the newest subscription (by created timestamp)
        if (subscriptions.data.length > 0) {
          subscriptions.data.sort((a: Stripe.Subscription, b: Stripe.Subscription) => b.created - a.created);
          subscriptionId = subscriptions.data[0].id;

          // Persist subscription_id to DB for future use
          await supabaseAdmin
            .from("billing_stripe_customers")
            .update({ stripe_subscription_id: subscriptionId })
            .eq("org_id", org_id);
        }
      }

      if (!subscriptionId) {
        return NextResponse.json(
          { ok: false, error: "No active Stripe subscription found" },
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

    // 14) Return success
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
