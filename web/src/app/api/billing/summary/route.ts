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

    // 8) Query recent invoice history (last 6 months)
    const { data: history } = await supabaseAdmin
      .from("billing_invoice_runs")
      .select("month, status, stripe_invoice_id, estimated_total_due_usd")
      .eq("org_id", org_id)
      .order("month", { ascending: false })
      .limit(6);

    // 9) Log event
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

    // 10) Return response
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
      history: (history || []).map((h) => ({
        month: h.month,
        status: h.status,
        stripe_invoice_id: h.stripe_invoice_id,
        estimated_total_due_usd: h.estimated_total_due_usd,
      })),
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
