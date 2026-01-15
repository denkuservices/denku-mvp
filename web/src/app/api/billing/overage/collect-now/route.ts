import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import { getStripeClient, ensureStripeCustomer } from "../../stripe/create-draft-invoice-helpers";
import { pauseOrgBilling } from "@/lib/billing/pause";

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
 * Get plan-based threshold and hardcap defaults.
 */
function getPlanDefaults(planCode: string | null): { threshold: number; hardcap: number } {
  switch (planCode) {
    case "starter":
      return { threshold: 100, hardcap: 250 };
    case "growth":
      return { threshold: 100, hardcap: 750 };
    case "scale":
      return { threshold: 250, hardcap: 2000 };
    default:
      // Default to starter values
      return { threshold: 100, hardcap: 250 };
  }
}

/**
 * POST /api/billing/overage/collect-now
 * 
 * Collects overage charges when threshold is reached.
 * Idempotent: safe to call multiple times.
 */
export async function POST(req: NextRequest) {
  try {
    // 1) Authenticate user and resolve org_id
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

    // 3) Determine month (default current month, optional query/body param)
    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const monthParam = searchParams.get("month") || body.month;
    const month =
      monthParam && /^\d{4}-\d{2}-01$/.test(monthParam)
        ? monthParam
        : getCurrentMonthStart();

    // 4) Read current overage_usd from org_monthly_invoice_preview
    const { data: preview } = await supabaseAdmin
      .from("org_monthly_invoice_preview")
      .select("plan_code, estimated_overage_cost_usd")
      .eq("org_id", org_id)
      .eq("month", month)
      .maybeSingle<{
        plan_code: string | null;
        estimated_overage_cost_usd: number | null;
      }>();

    if (!preview) {
      return NextResponse.json(
        { ok: false, error: "No invoice preview found for this month" },
        { status: 400 }
      );
    }

    const overageUsd = Number(preview.estimated_overage_cost_usd || 0);

    // 5) Get or create billing_overage_state with plan-based defaults
    const planDefaults = getPlanDefaults(preview.plan_code);
    const { data: overageState } = await supabaseAdmin
      .from("billing_overage_state")
      .select("*")
      .eq("org_id", org_id)
      .eq("month", month)
      .maybeSingle();

    let thresholdUsd = planDefaults.threshold;
    let hardCapUsd = planDefaults.hardcap;
    let lastCollectedOverageUsd = 0;
    let nextCollectAtOverageUsd = planDefaults.threshold;

    if (overageState) {
      thresholdUsd = Number(overageState.threshold_usd);
      hardCapUsd = Number(overageState.hard_cap_usd);
      lastCollectedOverageUsd = Number(overageState.last_collected_overage_usd || 0);
      nextCollectAtOverageUsd = Number(overageState.next_collect_at_overage_usd || planDefaults.threshold);
    } else {
      // Create initial state
      await supabaseAdmin
        .from("billing_overage_state")
        .upsert(
          {
            org_id: org_id,
            month: month,
            threshold_usd: thresholdUsd,
            hard_cap_usd: hardCapUsd,
            last_collected_overage_usd: 0,
            next_collect_at_overage_usd: thresholdUsd,
          },
          { onConflict: "org_id,month" }
        );
    }

    // 6) Check hard cap - block if exceeded
    if (overageUsd >= hardCapUsd) {
      await pauseOrgBilling(org_id, "hard_cap", {
        month: month,
        overage_usd: overageUsd,
        hard_cap_usd: hardCapUsd,
      });

      logEvent({
        tag: "[BILLING][OVERAGE][HARD_CAP_BLOCKED]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "warn",
        details: {
          month: month,
          overage_usd: overageUsd,
          hard_cap_usd: hardCapUsd,
        },
      });

      return NextResponse.json({
        ok: true,
        blocked: true,
        reason: "hard_cap",
        overage_usd: overageUsd,
        hard_cap_usd: hardCapUsd,
      });
    }

    // 7) Check if we should skip (idempotent check)
    if (overageUsd < nextCollectAtOverageUsd) {
      logEvent({
        tag: "[BILLING][OVERAGE][COLLECT_SKIPPED]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "info",
        details: {
          month: month,
          overage_usd: overageUsd,
          next_collect_at_overage_usd: nextCollectAtOverageUsd,
        },
      });

      return NextResponse.json({
        ok: true,
        skipped: true,
        overage_usd: overageUsd,
        next_collect_at_overage_usd: nextCollectAtOverageUsd,
      });
    }

    // 8) Calculate delta (amount to collect)
    const deltaUsd = Math.max(0, overageUsd - lastCollectedOverageUsd);

    if (deltaUsd <= 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "no_delta",
        overage_usd: overageUsd,
        last_collected_overage_usd: lastCollectedOverageUsd,
      });
    }

    // 9) Initialize Stripe
    const stripe = getStripeClient();
    const customerId = await ensureStripeCustomer(stripe, org_id);

    // 10) Create out-of-cycle Stripe invoice
    try {
      // Create invoice item for delta
      await stripe.invoiceItems.create({
        customer: customerId,
        amount: Math.round(deltaUsd * 100), // Convert to cents
        currency: "usd",
        description: `Overage threshold collection (${deltaUsd.toFixed(2)} USD)`,
      });

      // Create and finalize invoice immediately
      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: "charge_automatically",
        auto_advance: true, // Automatically finalize and attempt payment
        metadata: {
          kind: "overage_threshold",
          org_id: org_id,
          month: month,
          overage_usd_snapshot: overageUsd.toFixed(2),
          threshold_usd: thresholdUsd.toFixed(2),
          delta_usd: deltaUsd.toFixed(2),
        },
      });

      // Finalize invoice (will attempt payment immediately)
      await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: true });

      // 11) Update billing_overage_state
      await supabaseAdmin
        .from("billing_overage_state")
        .upsert(
          {
            org_id: org_id,
            month: month,
            last_collect_attempt_at: new Date().toISOString(),
            last_collect_invoice_id: invoice.id,
            last_collect_status: "pending",
          },
          { onConflict: "org_id,month" }
        );

      logEvent({
        tag: "[BILLING][OVERAGE][COLLECT_INITIATED]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "info",
        details: {
          month: month,
          overage_usd: overageUsd,
          delta_usd: deltaUsd,
          stripe_invoice_id: invoice.id,
          threshold_usd: thresholdUsd,
        },
      });

      return NextResponse.json({
        ok: true,
        collected: true,
        stripe_invoice_id: invoice.id,
        delta_usd: deltaUsd,
        overage_usd: overageUsd,
      });
    } catch (stripeErr) {
      const errorMsg = stripeErr instanceof Error ? stripeErr.message : "Failed to create invoice";

      logEvent({
        tag: "[BILLING][OVERAGE][COLLECT_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          month: month,
          error: errorMsg,
        },
      });

      return NextResponse.json(
        { ok: false, error: errorMsg },
        { status: 500 }
      );
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logEvent({
      tag: "[BILLING][OVERAGE][COLLECT_UNEXPECTED_ERROR]",
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
