import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";

/**
 * R-076 — reconcile COGS (what we pay Vapi, `calls.cost_usd` → `total_cost_usd`)
 * against revenue (what the customer is billed, `estimated_total_due_usd`) per
 * org-month, so margin erosion / an underpriced plan surfaces instead of leaking
 * silently. Reads the baselined `org_monthly_invoice_preview` view (R-075). Read-only
 * + logs structured alerts; never throws. Run monthly via cron.
 */

/** Below this margin % a positive-but-thin month is flagged for review. */
export const THIN_MARGIN_PCT = 25;

export type MarginVerdict = "negative" | "thin" | "ok";

/** Pure: margin in USD + % of revenue. */
export function computeMargin(revenueUsd: number, cogsUsd: number): { marginUsd: number; marginPct: number } {
  const marginUsd = Math.round((revenueUsd - cogsUsd + Number.EPSILON) * 100) / 100;
  const marginPct = revenueUsd > 0 ? Math.round(((marginUsd / revenueUsd) * 100 + Number.EPSILON) * 10) / 10 : 0;
  return { marginUsd, marginPct };
}

/** Pure: classify a month's margin. */
export function classifyMargin(marginUsd: number, marginPct: number): MarginVerdict {
  if (marginUsd < 0) return "negative";
  if (marginPct < THIN_MARGIN_PCT) return "thin";
  return "ok";
}

function currentMonthStartUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

interface ReconcileResult {
  ok: boolean;
  month: string;
  orgsChecked: number;
  negative: number;
  thin: number;
}

export async function runBillingReconciliation(month?: string): Promise<ReconcileResult> {
  const m = month ?? currentMonthStartUtc();
  let orgsChecked = 0;
  let negative = 0;
  let thin = 0;

  const { data: rows, error } = await supabaseAdmin
    .from("org_monthly_invoice_preview")
    .select("org_id, total_cost_usd, estimated_total_due_usd, billable_minutes, total_minutes_exact")
    .eq("month", m);

  if (error) {
    console.error("[BILLING][RECONCILE] Failed to read invoice preview", error.message);
    return { ok: false, month: m, orgsChecked: 0, negative: 0, thin: 0 };
  }

  for (const row of rows ?? []) {
    orgsChecked++;
    const cogs = Number(row.total_cost_usd ?? 0);
    const revenue = Number(row.estimated_total_due_usd ?? 0);
    const { marginUsd, marginPct } = computeMargin(revenue, cogs);
    const verdict = classifyMargin(marginUsd, marginPct);

    if (verdict !== "ok") {
      if (verdict === "negative") negative++;
      else thin++;
      logEvent({
        tag: verdict === "negative" ? "[BILLING][RECONCILE][NEGATIVE_MARGIN]" : "[BILLING][RECONCILE][THIN_MARGIN]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: row.org_id,
        severity: "warn",
        details: { month: m, cogs_usd: cogs, revenue_usd: revenue, margin_usd: marginUsd, margin_pct: marginPct },
      });
    }
  }

  logEvent({
    tag: "[BILLING][RECONCILE][SUMMARY]",
    ts: Date.now(),
    stage: "COST",
    source: "system",
    severity: negative > 0 ? "warn" : "info",
    details: { month: m, orgs_checked: orgsChecked, negative_margin_orgs: negative, thin_margin_orgs: thin },
  });

  return { ok: true, month: m, orgsChecked, negative, thin };
}
