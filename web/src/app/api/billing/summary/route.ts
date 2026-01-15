import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";

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
 * GET /api/billing/summary
 * 
 * Returns billing summary for authenticated user's organization.
 * Includes preview, invoice run, plan limits, pricing, and history.
 */
export async function GET(req: NextRequest) {
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

    // 3) Parse month query param (default to current month)
    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month");
    const month = monthParam && /^\d{4}-\d{2}-01$/.test(monthParam)
      ? monthParam
      : getCurrentMonthStart();

    // 4) Query org_monthly_invoice_preview
    const { data: preview } = await supabaseAdmin
      .from("org_monthly_invoice_preview")
      .select("*")
      .eq("org_id", org_id)
      .eq("month", month)
      .maybeSingle();

    // 5) Query billing_invoice_runs for current month
    const { data: invoiceRun } = await supabaseAdmin
      .from("billing_invoice_runs")
      .select("*")
      .eq("org_id", org_id)
      .eq("month", month)
      .maybeSingle();

    // 6) Query org_plan_limits
    const { data: planLimits } = await supabaseAdmin
      .from("org_plan_limits")
      .select("plan_code, concurrency_limit")
      .eq("org_id", org_id)
      .maybeSingle<{ plan_code: string | null; concurrency_limit: number | null }>();

    // 6a) Query organization_settings for workspace status
    const { data: orgSettings } = await supabaseAdmin
      .from("organization_settings")
      .select("workspace_status, paused_reason, paused_at")
      .eq("org_id", org_id)
      .maybeSingle<{
        workspace_status: "active" | "paused" | null;
        paused_reason: string | null;
        paused_at: string | null;
      }>();

    // 7) Query plan_pricing if plan_code exists
    let pricing: {
      monthly_fee_usd: number | null;
      included_minutes: number | null;
      overage_rate_usd_per_min: number | null;
    } | null = null;

    if (preview?.plan_code) {
      const { data: pricingRow } = await supabaseAdmin
        .from("plan_pricing")
        .select("monthly_fee_usd, included_minutes, overage_rate_usd_per_min")
        .eq("plan_code", preview.plan_code)
        .maybeSingle<{
          monthly_fee_usd: number | null;
          included_minutes: number | null;
          overage_rate_usd_per_min: number | null;
        }>();

      pricing = pricingRow;
    }

    // 8) Fetch plan catalog from billing_plan_catalog table (canonical source)
    const { data: plansData, error: plansError } = await supabaseAdmin
      .from("billing_plan_catalog")
      .select("plan_code, display_name, monthly_fee_usd, included_minutes, overage_rate_usd_per_min, concurrency_limit, included_phone_numbers")
      .order("plan_code");

    let plans: Array<{
      plan_code: string;
      display_name: string;
      monthly_fee_usd: number;
      included_minutes: number;
      overage_rate_usd_per_min: number;
      concurrency_limit: number;
      included_phone_numbers: number;
    }> = [];

    if (plansError) {
      logEvent({
        tag: "[BILLING][PLANS][FETCH_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "warn",
        details: {
          month: month,
          error: plansError.message,
        },
      });
    } else if (!plansData || plansData.length === 0) {
      logEvent({
        tag: "[BILLING][PLANS][EMPTY]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "info",
        details: {
          month: month,
          reason: "no_rows_found",
        },
      });
    } else {
      // Sort server-side: starter, growth, scale (correct order)
      const orderMap: Record<string, number> = { starter: 1, growth: 2, scale: 3 };
      plans = plansData
        .map((row) => ({
          plan_code: row.plan_code,
          display_name: row.display_name,
          monthly_fee_usd: Number(row.monthly_fee_usd),
          included_minutes: Number(row.included_minutes),
          overage_rate_usd_per_min: Number(row.overage_rate_usd_per_min),
          concurrency_limit: Number(row.concurrency_limit),
          included_phone_numbers: Number(row.included_phone_numbers),
        }))
        .sort((a, b) => {
          const orderA = orderMap[a.plan_code] || 999;
          const orderB = orderMap[b.plan_code] || 999;
          return orderA - orderB;
        });
    }

    // 8a) Optionally fetch billing_stripe_prices via supabaseAdmin (same pattern)
    const { data: stripePricesData, error: stripePricesError } = await supabaseAdmin
      .from("billing_stripe_prices")
      .select("plan_code, stripe_monthly_price_id, stripe_overage_price_id")
      .order("plan_code");

    let stripe_prices: Array<{
      plan_code: string;
      stripe_monthly_price_id: string | null;
      stripe_overage_price_id: string | null;
    }> = [];

    if (stripePricesError) {
      // Non-blocking: log but continue
      logEvent({
        tag: "[BILLING][STRIPE_PRICES][FETCH_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "warn",
        details: {
          month: month,
          error: stripePricesError.message,
        },
      });
    } else if (stripePricesData && stripePricesData.length > 0) {
      stripe_prices = stripePricesData.map((row) => ({
        plan_code: row.plan_code,
        stripe_monthly_price_id: row.stripe_monthly_price_id,
        stripe_overage_price_id: row.stripe_overage_price_id,
      }));
    }

    // 9) Query recent invoice history (last 6 months)
    const { data: history } = await supabaseAdmin
      .from("billing_invoice_runs")
      .select("month, status, stripe_invoice_id, estimated_total_due_usd")
      .eq("org_id", org_id)
      .order("month", { ascending: false })
      .limit(6);

    // 10) Log event (only in non-production or when BILLING_DEBUG is enabled)
    if (process.env.NODE_ENV !== "production" || process.env.BILLING_DEBUG === "true") {
      logEvent({
        tag: "[BILLING][SUMMARY]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "info",
        details: {
          month: month,
          has_preview: !!preview,
          has_invoice_run: !!invoiceRun,
        },
      });
    }

    // 11) Return response
    return NextResponse.json({
      ok: true,
      org_id,
      month,
      preview: preview || null,
      invoice_run: invoiceRun || null,
      plan_limits: planLimits || { plan_code: null, concurrency_limit: null },
      pricing: pricing || {
        monthly_fee_usd: null,
        included_minutes: null,
        overage_rate_usd_per_min: null,
      },
      plans: plans,
      stripe_prices: stripe_prices,
      history: (history || []).map((h) => ({
        month: h.month,
        status: h.status,
        stripe_invoice_id: h.stripe_invoice_id,
        estimated_total_due_usd: h.estimated_total_due_usd,
      })),
      billing_status: orgSettings?.workspace_status === "paused" && (orgSettings?.paused_reason === "past_due" || orgSettings?.paused_reason === "hard_cap")
        ? (orgSettings.paused_reason === "past_due" ? "past_due" : "paused")
        : "active",
      paused_reason: orgSettings?.paused_reason || null,
      paused_at: orgSettings?.paused_at || null,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    logEvent({
      tag: "[BILLING][SUMMARY][ERROR]",
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
