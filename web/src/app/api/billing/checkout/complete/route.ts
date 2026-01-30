import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "../../stripe/create-draft-invoice-helpers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";

/**
 * POST /api/billing/checkout/complete
 * 
 * Handles Stripe checkout success by fetching session and activating plan.
 * This is a fallback if webhook is delayed - ensures deterministic UX.
 * 
 * Reuses the same logic as onboarding's handleCheckoutSuccess.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.session_id) {
      return NextResponse.json(
        { ok: false, error: "Missing session_id" },
        { status: 400 }
      );
    }

    const { session_id } = body;

    const stripe = getStripeClient();
    
    // Retrieve session from Stripe with subscription expanded
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription"],
    });

    // Only handle subscription mode checkouts
    if (session.mode !== "subscription") {
      return NextResponse.json(
        { ok: false, error: "Checkout session is not subscription mode" },
        { status: 400 }
      );
    }

    // Extract metadata
    const orgId = session.metadata?.org_id;
    const planCode = session.metadata?.plan_code?.toLowerCase();

    if (!orgId || !planCode) {
      logEvent({
        tag: "[BILLING][CHECKOUT_COMPLETE][MISSING_METADATA]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId || "unknown",
        severity: "warn",
        details: {
          session_id: session_id,
          has_org_id: !!orgId,
          has_plan_code: !!planCode,
        },
      });
      return NextResponse.json(
        { ok: false, error: "Checkout session missing metadata" },
        { status: 400 }
      );
    }

    // Validate plan_code
    if (!["starter", "growth", "scale"].includes(planCode)) {
      logEvent({
        tag: "[BILLING][CHECKOUT_COMPLETE][INVALID_PLAN]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId,
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

    // Upsert org_plan_overrides (idempotent - safe to run multiple times)
    const { error: overrideError } = await supabaseAdmin
      .from("org_plan_overrides")
      .upsert(
        {
          org_id: orgId,
          plan_code: planCode,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" }
      );

    if (overrideError) {
      logEvent({
        tag: "[BILLING][CHECKOUT_COMPLETE][UPSERT_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId,
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

    // Verify plan is now active by checking org_plan_limits
    const { data: planLimits } = await supabaseAdmin
      .from("org_plan_limits")
      .select("plan_code")
      .eq("org_id", orgId)
      .maybeSingle<{ plan_code: string | null }>();

    const isPlanActive = !!planLimits?.plan_code;

    if (isPlanActive) {
      logEvent({
        tag: "[BILLING][CHECKOUT_COMPLETE][SUCCESS]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId,
        severity: "info",
        details: {
          session_id: session_id,
          plan_code: planCode,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      isPlanActive,
      plan_code: planCode,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logEvent({
      tag: "[BILLING][CHECKOUT_COMPLETE][ERROR]",
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
