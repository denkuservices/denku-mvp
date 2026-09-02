import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import { VOICE_PLAN_CODES } from "@/lib/billing/chatPlanKeys";
import { guard } from "@/lib/auth/permissions";
import { logAuditEvent } from "@/lib/audit/log";
import { getStripeClient } from "@/app/api/billing/stripe/create-draft-invoice-helpers";
import { findActiveSubscriptionId, findPlanSubscriptionItem } from "@/lib/billing/subscription";

const RequestSchema = z.object({
  // Voice plans only, on purpose: moving an existing workspace onto `chat_only` would
  // strand the phone number it is already paying for. That is a migration, not a switch.
  plan_code: z.enum(VOICE_PLAN_CODES),
});

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
 * POST /api/billing/plan/change
 * 
 * Changes the plan for authenticated user's organization.
 * Updates org_plan_overrides and marks current month invoice as stale.
 */
export async function POST(req: NextRequest) {
  try {
    // 1) Authenticate AND authorize. Being signed in was never enough here: this route moves a
    // workspace between a $149 and an $899 plan, and until the capability check landed a `viewer`
    // could do it. `manage_billing` is owner/admin — see lib/auth/permissions.ts.
    const gate = await guard("manage_billing");
    if (!gate.ok) return gate.response;
    const org_id = gate.viewer.orgId;

    // 2) Read the plan we are leaving, so the audit row can say what changed rather than only
    // what it became. Best-effort: a missing override row simply means "on the catalogue plan".
    const { data: previousOverride } = await supabaseAdmin
      .from("org_plan_overrides")
      .select("plan_code")
      .eq("org_id", org_id)
      .maybeSingle<{ plan_code: string | null }>();

    // 3) Parse and validate request body
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

    const { plan_code } = parseResult.data;

    /*
     * 4) Move the money BEFORE moving the entitlement.
     *
     * This route used to write `org_plan_overrides` and stop. `org_plan_limits` is a VIEW straight
     * over that table, so the new plan's limits took effect the instant the row was written — while
     * the Stripe subscription carried on billing the old price. An owner on starter could put
     * themselves on scale and hold 3600 minutes and ten concurrent calls for $149 a month, forever.
     * The most expensive action in the product was the only one that never reached Stripe.
     *
     * So Stripe first, and the override only if Stripe agreed. A failure here leaves the workspace
     * on the plan it is actually paying for, which is the safe direction to fail in.
     *
     * Proration is Stripe's to compute and is the honest answer to "do my remaining minutes carry
     * over?": they do not — minutes are metered per calendar month and are not a balance — but the
     * unused part of the old plan's fee is credited against the new one, so nobody pays twice for
     * the same days.
     */
    const { data: planData } = await supabaseAdmin
      .from("billing_plan_catalog")
      .select("display_name, monthly_fee_usd")
      .eq("plan_code", plan_code)
      .maybeSingle<{ display_name: string | null; monthly_fee_usd: number | null }>();

    if (!planData?.monthly_fee_usd && planData?.monthly_fee_usd !== 0) {
      return NextResponse.json(
        { ok: false, error: "That plan is not available" },
        { status: 400 }
      );
    }

    const { data: customerRow } = await supabaseAdmin
      .from("billing_stripe_customers")
      .select("stripe_customer_id")
      .eq("org_id", org_id)
      .maybeSingle<{ stripe_customer_id: string | null }>();

    if (!customerRow?.stripe_customer_id) {
      // No customer means nothing has ever been paid. Granting a plan here would be the same free
      // upgrade by a different door.
      return NextResponse.json(
        { ok: false, error: "Start a subscription before changing plan" },
        { status: 409 }
      );
    }

    try {
      const stripe = getStripeClient();
      const subscriptionId = await findActiveSubscriptionId(
        stripe,
        org_id,
        customerRow.stripe_customer_id
      );

      if (!subscriptionId) {
        return NextResponse.json(
          { ok: false, error: "No active subscription to change" },
          { status: 409 }
        );
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["items.data.price"],
      });
      const planItem = await findPlanSubscriptionItem(subscription);

      if (!planItem) {
        // Ambiguous rather than absent: refusing beats charging the wrong line item.
        logEvent({
          tag: "[BILLING][PLAN_CHANGE][ITEM_AMBIGUOUS]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          org_id,
          severity: "error",
          details: { subscription_id: subscriptionId, item_count: subscription.items.data.length },
        });
        return NextResponse.json(
          { ok: false, error: "Could not identify the plan on this subscription. Contact support." },
          { status: 409 }
        );
      }

      // Keep the Stripe Product and change only its price. A subscription item update takes a
      // product id, not a product to create — and reusing it is right anyway: this is the same
      // subscription line for the same thing, at a different rate. A new product each time would
      // scatter one workspace's plan across a dozen products in the Stripe dashboard.
      const currentPrice = typeof planItem.price === "string" ? null : planItem.price;
      const productId =
        typeof currentPrice?.product === "string" ? currentPrice.product : currentPrice?.product?.id;

      if (!productId) {
        return NextResponse.json(
          { ok: false, error: "Could not read the current plan price. Contact support." },
          { status: 409 }
        );
      }

      await stripe.subscriptionItems.update(
        planItem.id,
        {
          price_data: {
            currency: "usd",
            product: productId,
            unit_amount: Math.round(Number(planData.monthly_fee_usd) * 100),
            recurring: { interval: "month" },
          },
          quantity: 1,
          proration_behavior: "create_prorations",
        },
        { idempotencyKey: `plan_change:${org_id}:${plan_code}:${getCurrentMonthStart()}` }
      );

      logEvent({
        tag: "[BILLING][PLAN_CHANGE][STRIPE_UPDATED]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id,
        severity: "info",
        details: { plan_code, subscription_id: subscriptionId, item_id: planItem.id },
      });
    } catch (stripeErr) {
      const message = stripeErr instanceof Error ? stripeErr.message : "Unknown Stripe error";
      logEvent({
        tag: "[BILLING][PLAN_CHANGE][STRIPE_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id,
        severity: "error",
        details: { plan_code, error: message },
      });
      // Deliberately not falling through: the entitlement must never move without the price.
      return NextResponse.json(
        { ok: false, error: "Could not update your subscription. Nothing was changed." },
        { status: 502 }
      );
    }

    // 5) Upsert org_plan_overrides
    const { error: overrideError } = await supabaseAdmin
      .from("org_plan_overrides")
      .upsert(
        {
          org_id: org_id,
          plan_code: plan_code,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" }
      );

    if (overrideError) {
      logEvent({
        tag: "[BILLING][PLAN_CHANGE][OVERRIDE_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          plan_code: plan_code,
          error: overrideError.message,
        },
      });

      return NextResponse.json(
        { ok: false, error: "Failed to update plan override" },
        { status: 500 }
      );
    }

    // 5) Mark current month invoice run as stale
    const currentMonth = getCurrentMonthStart();
    await supabaseAdmin
      .from("billing_invoice_runs")
      .update({
        status: "stale",
        stripe_invoice_id: null,
      })
      .eq("org_id", org_id)
      .eq("month", currentMonth);

    // 6) Log event
    logEvent({
      tag: "[BILLING][PLAN_CHANGE]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: org_id,
      severity: "info",
      details: {
        plan_code: plan_code,
        month: currentMonth,
      },
    });

    // 7) Record it in the audit log. The Audit page told customers it covered "plan changes"
    // while nothing on this path ever wrote a row — the most expensive action in the product was
    // the least traceable one. Never throws (logAuditEvent swallows its own errors); the plan
    // change already happened and must not be reported as failed because a log write did not.
    await logAuditEvent({
      org_id,
      actor_user_id: gate.viewer.profileId,
      action: "billing.plan.change",
      entity_type: "billing.plan",
      entity_id: org_id,
      diff: { plan_code: { before: previousOverride?.plan_code ?? null, after: plan_code } },
    });

    // 8) Return success
    return NextResponse.json({
      ok: true,
      plan_code: plan_code,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    logEvent({
      tag: "[BILLING][PLAN_CHANGE][ERROR]",
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
