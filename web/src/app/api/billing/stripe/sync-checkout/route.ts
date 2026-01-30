import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripeClient } from "../create-draft-invoice-helpers";
import { logEvent } from "@/lib/observability/logEvent";

/**
 * POST /api/billing/stripe/sync-checkout
 * 
 * Syncs Stripe checkout session to DB state (same logic as webhook).
 * Used when returning from Stripe checkout to ensure deterministic UX
 * even if webhook is delayed or missing (e.g., local dev).
 * 
 * This endpoint replicates the webhook handler logic for checkout.session.completed.
 */
export async function POST(req: NextRequest) {
  try {
    // 1) Authenticate user
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

    // 3) Parse request body
    const body = await req.json().catch(() => null);
    if (!body || !body.session_id) {
      return NextResponse.json(
        { ok: false, error: "Missing session_id" },
        { status: 400 }
      );
    }

    const { session_id } = body;

    // 4) Retrieve session from Stripe
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription", "customer", "line_items"],
    });

    // 5) Validate session mode (should be "subscription" for plan purchases)
    if (session.mode !== "subscription") {
      logEvent({
        tag: "[BILLING][SYNC_CHECKOUT][NON_SUBSCRIPTION]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "info",
        details: {
          session_id: session_id,
          mode: session.mode,
        },
      });
      return NextResponse.json(
        { ok: false, error: "Checkout session is not subscription mode" },
        { status: 400 }
      );
    }

    // 6) Validate payment status
    if (session.payment_status !== "paid") {
      logEvent({
        tag: "[BILLING][SYNC_CHECKOUT][NOT_PAID]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "warn",
        details: {
          session_id: session_id,
          payment_status: session.payment_status,
        },
      });
      return NextResponse.json(
        { ok: false, error: "Checkout session payment not completed" },
        { status: 400 }
      );
    }

    // 7) Extract metadata
    const sessionOrgId = session.metadata?.org_id;
    const planCode = session.metadata?.plan_code?.toLowerCase();

    if (!sessionOrgId || !planCode) {
      logEvent({
        tag: "[BILLING][SYNC_CHECKOUT][MISSING_METADATA]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "warn",
        details: {
          session_id: session_id,
          has_org_id: !!sessionOrgId,
          has_plan_code: !!planCode,
        },
      });
      return NextResponse.json(
        { ok: false, error: "Checkout session missing metadata" },
        { status: 400 }
      );
    }

    // 8) Verify org_id matches (security check)
    if (sessionOrgId !== org_id) {
      logEvent({
        tag: "[BILLING][SYNC_CHECKOUT][ORG_MISMATCH]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          session_id: session_id,
          session_org_id: sessionOrgId,
          user_org_id: org_id,
        },
      });
      return NextResponse.json(
        { ok: false, error: "Organization mismatch" },
        { status: 403 }
      );
    }

    // 9) Validate plan_code
    if (!["starter", "growth", "scale"].includes(planCode)) {
      logEvent({
        tag: "[BILLING][SYNC_CHECKOUT][INVALID_PLAN]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "warn",
        details: {
          session_id: session_id,
          plan_code: planCode,
        },
      });
      return NextResponse.json(
        { ok: false, error: "Invalid plan_code" },
        { status: 400 }
      );
    }

    // 10) Upsert org_plan_overrides (idempotent - same as webhook)
    const { error: overrideError } = await supabaseAdmin
      .from("org_plan_overrides")
      .upsert(
        {
          org_id: org_id,
          plan_code: planCode,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" }
      );

    if (overrideError) {
      logEvent({
        tag: "[BILLING][SYNC_CHECKOUT][OVERRIDE_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          session_id: session_id,
          plan_code: planCode,
          error: overrideError.message,
        },
      });
      return NextResponse.json(
        { ok: false, error: "Failed to activate plan" },
        { status: 500 }
      );
    }

    // 11) Update billing_stripe_customers if subscription exists
    if (session.subscription && typeof session.subscription === "object") {
      const subscription = session.subscription as Stripe.Subscription;
      const customerId = typeof session.customer === "string" 
        ? session.customer 
        : (session.customer as Stripe.Customer)?.id;

      if (customerId && subscription.id) {
        // Upsert billing_stripe_customers
        await supabaseAdmin
          .from("billing_stripe_customers")
          .upsert(
            {
              org_id: org_id,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscription.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "org_id" }
          );
      }
    }

    // 12) Verify plan is now active by checking org_plan_limits
    const { data: planLimits } = await supabaseAdmin
      .from("org_plan_limits")
      .select("plan_code")
      .eq("org_id", org_id)
      .maybeSingle<{ plan_code: string | null }>();

    const isPlanActive = !!planLimits?.plan_code;

    logEvent({
      tag: "[BILLING][SYNC_CHECKOUT][SUCCESS]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: org_id,
      severity: "info",
      details: {
        session_id: session_id,
        plan_code: planCode,
        is_plan_active: isPlanActive,
        subscription_id: session.subscription || null,
      },
    });

    return NextResponse.json({
      ok: true,
      isPlanActive,
      plan_code: planCode,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logEvent({
      tag: "[BILLING][SYNC_CHECKOUT][ERROR]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "error",
      details: {
        error: errorMsg,
      },
    });

    return NextResponse.json(
      { ok: false, error: errorMsg },
      { status: 500 }
    );
  }
}
