/**
 * Billing usage math — golden-master TS mirror of the SQL billing views (R-075).
 *
 * SOURCE OF TRUTH: `supabase/migrations/20260723100000_baseline_billing_usage_views.sql`
 * (the live `org_daily_usage` → `org_monthly_overages` → `org_monthly_invoice_preview`
 * chain). This module reproduces that math in pure TS so it is reviewable and
 * unit-testable in CI (the SQL can't run in the mocked test harness). **If you change
 * the SQL, change this file + its tests, and vice-versa.**
 *
 * The one non-obvious, revenue-critical rule: billable minutes are computed PER CALL
 * as ceil(duration_seconds / 60) and then summed — every call rounds UP to a whole
 * minute. (Summing seconds first then dividing would bill materially less.)
 */

export type PlanCode = "starter" | "growth" | "scale";

export interface PlanPricing {
  monthlyFeeUsd: number;
  includedMinutes: number;
  overageRateUsdPerMin: number;
  concurrencyLimit: number;
}

/** Hardcoded plan constants — mirrors the `plan_pricing` + `org_plan_limits` views. */
export const PLAN_PRICING: Record<PlanCode, PlanPricing> = {
  starter: { monthlyFeeUsd: 149, includedMinutes: 400, overageRateUsdPerMin: 0.22, concurrencyLimit: 1 },
  growth: { monthlyFeeUsd: 399, includedMinutes: 1200, overageRateUsdPerMin: 0.18, concurrencyLimit: 4 },
  scale: { monthlyFeeUsd: 899, includedMinutes: 3600, overageRateUsdPerMin: 0.13, concurrencyLimit: 10 },
};

/** round to 2dp (mirrors SQL round(x, 2) for the non-negative billing amounts here). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Billable minutes for ONE call: ceil(seconds / 60). Null/≤0 → 0.
 * Mirrors `ceil(COALESCE(duration_seconds,0)/60)` inside `org_daily_usage`.
 */
export function billableMinutesForCall(durationSeconds: number | null | undefined): number {
  const s = durationSeconds ?? 0;
  if (s <= 0) return 0;
  return Math.ceil(s / 60);
}

/** Sum of per-call billable minutes — matches SQL `sum(ceil(sec/60))` (ceil PER call). */
export function billableMinutesForCalls(durationsSeconds: Array<number | null | undefined>): number {
  return durationsSeconds.reduce<number>((acc, s) => acc + billableMinutesForCall(s), 0);
}

/** overage_minutes = GREATEST(billable - included, 0). */
export function overageMinutes(billableMinutes: number, includedMinutes: number): number {
  return Math.max(billableMinutes - includedMinutes, 0);
}

/** estimated_overage_cost_usd = round(overage_minutes * rate, 2). */
export function estimatedOverageCostUsd(billableMinutes: number, plan: PlanPricing): number {
  return round2(overageMinutes(billableMinutes, plan.includedMinutes) * plan.overageRateUsdPerMin);
}

/** estimated_total_due_usd = round(monthly_fee + estimated_overage_cost, 2). */
export function estimatedTotalDueUsd(billableMinutes: number, plan: PlanPricing): number {
  return round2(plan.monthlyFeeUsd + estimatedOverageCostUsd(billableMinutes, plan));
}
