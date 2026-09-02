import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "../../stripe/create-draft-invoice-helpers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import { readCompletedCheckout } from "@/lib/billing/completedCheckout";
import { hasAnyPaidPlan } from "@/lib/billing/planState";
import { recordChatPurchase } from "@/lib/billing/chatEntitlement";

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

    /**
     * What did this session buy? One reader, shared by all four activation paths, so they cannot
     * drift apart — see lib/billing/completedCheckout.ts.
     */
    const purchase = readCompletedCheckout(session.metadata);
    const orgId = purchase.orgId;
    const planCode = purchase.voicePlanCode;

    if (!orgId || (!purchase.ok && purchase.reason !== "invalid_plan")) {
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

    // A plan code we do not recognise. The shared reader already told us; refusing here keeps
    // the same log and the same status this path has always returned.
    if (purchase.reason === "invalid_plan") {
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

    // A session carrying `chat_addon_key` bought a chat TIER — alone, or alongside a voice
    // plan. Same write the other three paths do, idempotent on (org_id, addon_key).
    const chatAddonKey = purchase.chatAddonKey;
    if (chatAddonKey) {
      await recordChatPurchase(orgId, chatAddonKey);
    }

    /**
     * Only a VOICE purchase writes a plan.
     *
     * A chat purchase leaves `org_plan_limits.plan_code` null, which is now simply the truth: the
     * workspace has no phone service. It used to write `chat_only` here so that something would
     * be in the column, and everything downstream then had to know that one of the plans was not
     * really a plan.
     */
    const { error: overrideError } = planCode
      ? await supabaseAdmin
          .from("org_plan_overrides")
          .upsert(
            {
              org_id: orgId,
              plan_code: planCode,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "org_id" }
          )
      : { error: null };

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

    // Did the purchase land? Asked of what was actually bought — a chat purchase has no voice
    // plan to verify, and checking for one would report every chat sale as a failure.
    const isPlanActive = await hasAnyPaidPlan(orgId);

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
