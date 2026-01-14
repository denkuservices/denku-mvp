import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";

/**
 * Get Stripe client instance.
 */
function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is required");
  }
  return new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });
}

/**
 * Ensure Stripe customer exists for org_id.
 * Creates customer if missing and stores mapping in billing_stripe_customers.
 * 
 * NOTE: This is a shared helper pattern used across billing routes.
 * Subscription updates in Stripe Customer Portal must be disabled;
 * plan changes happen via /api/billing/plan/change and DB-truth.
 */
async function ensureStripeCustomer(
  stripe: Stripe,
  orgId: string
): Promise<string> {
  // Check existing mapping
  const { data: existing } = await supabaseAdmin
    .from("billing_stripe_customers")
    .select("stripe_customer_id")
    .eq("org_id", orgId)
    .maybeSingle<{ stripe_customer_id: string }>();

  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    name: orgId, // Use org_id as name (no email required)
    metadata: {
      org_id: orgId,
    },
  });

  // Store mapping
  await supabaseAdmin
    .from("billing_stripe_customers")
    .upsert(
      {
        org_id: orgId,
        stripe_customer_id: customer.id,
      },
      {
        onConflict: "org_id",
      }
    );

  return customer.id;
}

/**
 * Get APP_URL for portal return URL.
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
 * POST /api/billing/stripe/portal
 * 
 * Creates a Stripe Billing Portal session for the authenticated user's organization.
 * 
 * IMPORTANT: Subscription updates in Stripe Customer Portal must be disabled.
 * Plan changes happen via /api/billing/plan/change and DB-truth.
 * The portal is used only for:
 * - Payment method management
 * - Invoice viewing and payment
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
        { error: "Unauthorized" },
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
        { error: "Organization not found" },
        { status: 400 }
      );
    }

    // 3) Initialize Stripe client
    let stripe: Stripe;
    try {
      stripe = getStripeClient();
    } catch (stripeErr) {
      const errorMsg = stripeErr instanceof Error ? stripeErr.message : "Stripe initialization failed";
      logEvent({
        tag: "[BILLING][PORTAL][STRIPE_INIT_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          error: errorMsg,
        },
      });
      return NextResponse.json(
        { error: "Payment service unavailable" },
        { status: 500 }
      );
    }

    // 4) Ensure Stripe customer exists
    let stripeCustomerId: string;
    try {
      stripeCustomerId = await ensureStripeCustomer(stripe, org_id);
    } catch (customerErr) {
      const errorMsg = customerErr instanceof Error ? customerErr.message : "Customer creation failed";
      logEvent({
        tag: "[BILLING][PORTAL][CUSTOMER_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          error: errorMsg,
        },
      });
      return NextResponse.json(
        { error: "Failed to setup customer account" },
        { status: 500 }
      );
    }

    // 5) Get APP_URL for return URL
    const appUrl = getAppUrl(req);
    // Return URL: redirect back to billing page after portal session
    const returnUrl = `${appUrl}/dashboard/settings/workspace/billing?portal=1`;

    // 6) Create Stripe Billing Portal session
    let portalSession: Stripe.BillingPortal.Session;
    try {
      portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl,
      });
    } catch (portalErr) {
      const errorMsg = portalErr instanceof Error ? portalErr.message : "Portal session creation failed";
      logEvent({
        tag: "[BILLING][PORTAL][SESSION_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          error: errorMsg,
          stripe_customer_id: stripeCustomerId,
        },
      });
      return NextResponse.json(
        { error: "Failed to create portal session" },
        { status: 500 }
      );
    }

    // 7) Log success (only in non-production or when BILLING_DEBUG is enabled)
    if (process.env.NODE_ENV !== "production" || process.env.BILLING_DEBUG === "true") {
      logEvent({
        tag: "[BILLING][PORTAL][SESSION_CREATED]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "info",
        details: {
          stripe_customer_id: stripeCustomerId,
          return_url: returnUrl,
        },
      });
    }

    // 8) Return portal URL
    return NextResponse.json({
      url: portalSession.url,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logEvent({
      tag: "[BILLING][PORTAL][UNEXPECTED_ERROR]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "error",
      details: {
        error: errorMsg,
      },
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
