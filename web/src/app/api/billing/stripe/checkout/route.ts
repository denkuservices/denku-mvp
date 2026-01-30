import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import { getStripeClient, ensureStripeCustomer } from "../create-draft-invoice-helpers";

/**
 * Get APP_URL for checkout return URLs.
 * Priority:
 * 1. NEXT_PUBLIC_APP_URL (explicit env var)
 * 2. Derive from request headers (origin or host)
 * 3. Fallback to localhost for dev
 */
function getAppUrl(req: NextRequest): string {
  // 1. Explicit env var (preferred)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // 2. Derive from request headers
  const origin = req.headers.get("origin");
  if (origin) {
    return origin;
  }

  const host = req.headers.get("host");
  const protocol = req.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  if (host) {
    return `${protocol}://${host}`;
  }

  // 3. Fallback for local dev
  return "http://localhost:3000";
}

/**
 * POST /api/billing/stripe/checkout
 * 
 * Creates a Stripe Checkout Session for plan purchase during onboarding.
 * Returns checkout session URL that user should be redirected to.
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
      .select("id, org_id, email, full_name")
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
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { plan_code, return_to } = body;
    if (!plan_code || !["starter", "growth", "scale"].includes(plan_code)) {
      return NextResponse.json(
        { ok: false, error: "Invalid plan_code. Must be starter, growth, or scale" },
        { status: 400 }
      );
    }

    // 4) Check workspace status - block if billing paused
    const { data: orgSettings } = await supabaseAdmin
      .from("organization_settings")
      .select("workspace_status, paused_reason")
      .eq("org_id", org_id)
      .maybeSingle<{
        workspace_status: "active" | "paused" | null;
        paused_reason: string | null;
      }>();

    const workspaceStatus = orgSettings?.workspace_status || "active";
    const pausedReason = orgSettings?.paused_reason || null;

    if (workspaceStatus === "paused" && (pausedReason === "hard_cap" || pausedReason === "past_due")) {
      return NextResponse.json(
        { ok: false, error: "BILLING_PAUSED", reason: pausedReason },
        { status: 403 }
      );
    }

    // 5) Get plan details from billing_plan_catalog
    const { data: planData } = await supabaseAdmin
      .from("billing_plan_catalog")
      .select("plan_code, display_name, monthly_fee_usd")
      .eq("plan_code", plan_code)
      .maybeSingle<{
        plan_code: string;
        display_name: string;
        monthly_fee_usd: number;
      }>();

    if (!planData) {
      return NextResponse.json(
        { ok: false, error: "Plan not found" },
        { status: 404 }
      );
    }

    // 6) Initialize Stripe client
    let stripe: Stripe;
    try {
      stripe = getStripeClient();
    } catch (stripeErr) {
      const errorMsg = stripeErr instanceof Error ? stripeErr.message : "Stripe initialization failed";
      logEvent({
        tag: "[BILLING][CHECKOUT][STRIPE_INIT_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          error: errorMsg,
          plan_code: plan_code,
        },
      });
      return NextResponse.json(
        { ok: false, error: "Payment service unavailable" },
        { status: 500 }
      );
    }

    // 7) Ensure Stripe customer exists
    let stripeCustomerId: string;
    try {
      stripeCustomerId = await ensureStripeCustomer(stripe, org_id);
    } catch (customerErr) {
      const errorMsg = customerErr instanceof Error ? customerErr.message : "Customer creation failed";
      logEvent({
        tag: "[BILLING][CHECKOUT][CUSTOMER_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          error: errorMsg,
          plan_code: plan_code,
        },
      });
      return NextResponse.json(
        { ok: false, error: "Failed to setup customer account" },
        { status: 500 }
      );
    }

    // 8) Get APP_URL for return URLs
    const appUrl = getAppUrl(req);
    
    // Determine return URLs based on return_to parameter
    // Default to onboarding for backward compatibility
    const returnPath = return_to || "/onboarding";
    const successUrl = `${appUrl}${returnPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}${returnPath}?checkout=cancel`;

    // 9) Create Stripe Checkout Session
    // Use subscription mode with price_data for recurring billing
    let checkoutSession: Stripe.Checkout.Session;
    try {
      checkoutSession = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        mode: "subscription", // Recurring subscription
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `${planData.display_name} Plan`,
                description: `Monthly subscription for ${planData.display_name} plan`,
              },
              unit_amount: Math.round(planData.monthly_fee_usd * 100), // Convert to cents
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          org_id: org_id,
          plan_code: plan_code,
          kind: "onboarding_plan_purchase",
        },
        allow_promotion_codes: true,
        // On success, we'll set plan in org_plan_overrides via webhook or redirect handling
      });
    } catch (checkoutErr) {
      const errorMsg = checkoutErr instanceof Error ? checkoutErr.message : "Checkout session creation failed";
      logEvent({
        tag: "[BILLING][CHECKOUT][SESSION_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          error: errorMsg,
          plan_code: plan_code,
          stripe_customer_id: stripeCustomerId,
        },
      });
      return NextResponse.json(
        { ok: false, error: "Failed to create checkout session" },
        { status: 500 }
      );
    }

    // 10) Log success
    logEvent({
      tag: "[BILLING][CHECKOUT][CREATED]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: org_id,
      severity: "info",
      details: {
        plan_code: plan_code,
        checkout_session_id: checkoutSession.id,
        amount: planData.monthly_fee_usd,
      },
    });

    // 11) Return checkout URL
    return NextResponse.json({
      ok: true,
      url: checkoutSession.url,
      checkout_session_id: checkoutSession.id,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    logEvent({
      tag: "[BILLING][CHECKOUT][ERROR]",
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
