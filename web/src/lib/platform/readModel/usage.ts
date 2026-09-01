import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_PRICING, type PlanCode } from "@/lib/billing/usageMath";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface MinuteUsageSummary {
  planCode: string;
  planName: string;
  usedMinutes: number;
  includedMinutes: number;
  remainingMinutes: number;
  overageMinutes: number;
  percentUsed: number;
  month: string;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function fallbackIncludedMinutes(planCode: string): number {
  return planCode in PLAN_PRICING ? PLAN_PRICING[planCode as PlanCode].includedMinutes : 0;
}

/**
 * Current voice allowance for the workspace. This deliberately reads the same invoice-preview
 * view as Billing: billable minutes round each call up independently, so summing raw call seconds
 * here would disagree with the customer's invoice.
 */
export async function getMinuteUsageSummary(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<MinuteUsageSummary | null> {
  if (!orgId) return null;

  const month = currentMonth();

  try {
    const [{ data: preview }, { data: limits }] = await Promise.all([
      db
        .from("org_monthly_invoice_preview")
        .select("plan_code,billable_minutes")
        .eq("org_id", orgId)
        .eq("month", month)
        .maybeSingle<{ plan_code: string | null; billable_minutes: number | null }>(),
      db
        .from("org_plan_limits")
        .select("plan_code")
        .eq("org_id", orgId)
        .maybeSingle<{ plan_code: string | null }>(),
    ]);

    const planCode = preview?.plan_code ?? limits?.plan_code;
    if (!planCode) return null;

    const { data: plan } = await db
      .from("billing_plan_catalog")
      .select("display_name,included_minutes")
      .eq("plan_code", planCode)
      .maybeSingle<{ display_name: string | null; included_minutes: number | null }>();

    const usedMinutes = Math.max(0, Number(preview?.billable_minutes ?? 0));
    const includedMinutes = Math.max(
      0,
      Number(plan?.included_minutes ?? fallbackIncludedMinutes(planCode))
    );
    const remainingMinutes = Math.max(includedMinutes - usedMinutes, 0);
    const overageMinutes = Math.max(usedMinutes - includedMinutes, 0);
    const percentUsed = includedMinutes > 0 ? Math.round((usedMinutes / includedMinutes) * 1000) / 10 : 0;

    return {
      planCode,
      planName: plan?.display_name?.trim() || `${planCode.charAt(0).toUpperCase()}${planCode.slice(1)}`,
      usedMinutes,
      includedMinutes,
      remainingMinutes,
      overageMinutes,
      percentUsed,
      month,
    };
  } catch {
    // Billing being temporarily unavailable must not take the operational dashboard down.
    return null;
  }
}
