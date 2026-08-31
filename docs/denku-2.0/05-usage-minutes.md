# Usage / remaining-minutes chart (on the dashboard HOME)

Goal: show the customer their remaining minutes for the month with a graph. **Placement decision:
dashboard HOME** (not analytics) — "how many minutes do I have left" is an at-a-glance status
question home is for; analytics is a call/ticket drill-down and adding billing there mixes concerns.
Both surfaces need the same new read, so analytics offers no implementation saving.

## The data already exists — only a read + a widget are missing
- `lib/billing/usageMath.ts` — `PLAN_PRICING.includedMinutes` (starter 400 / growth 1200 / scale 3600)
  and `billableMinutes = Σ ceil(duration_seconds/60)` per call. Use this so "used" matches the invoice exactly.
- `org_daily_usage` view (`migrations/20260723100000_baseline_billing_usage_views.sql`) already holds
  **per-day billable_minutes** — today read only by the draft-invoice route (`create-draft-invoice/route.ts:541-545`), never in UI.
- `/api/billing/summary` returns MONTHLY totals only (`route.ts:65-70`) → backs the existing flat bar,
  not a time-series.
- Existing UI: the billing page section `id="usage"` draws a single-value `<Meter>` bar + "N minutes
  left before overage starts" (`settings/workspace/billing/page.tsx:785-800`).
- Charting is idiomatic via ApexCharts: `TrendChart.tsx` (area; takes `labels[]`+`values[]`),
  `HorizonLineChart.tsx`, `ReactApexChartClient` (`ssr:false`).

## Build order
1. **Data (the only real gap, M).** Add an org-scoped read of `org_daily_usage` for the current month
   (`select day, billable_minutes` `.eq('org_id', orgId)` via `supabaseAdmin`). Expose via a small
   server read used by the home component, or extend `/api/billing/summary` with a `daily[]` array.
   Compute a **cumulative running total** in JS (burn-down shape); derive
   `remaining = includedMinutes − usedMinutes` from `usageMath.ts` so the number matches the invoice/bell.
2. **Chart (S).** Reuse `TrendChart.tsx` (area, x=day, y=cumulative minutes); annotate the plan's
   `includedMinutes` as the ceiling so "burn toward the limit" is visible. No new dependency.
3. **Home widget (M).** On the currently-live home (`DashboardClient.tsx`, next to "Est. Savings"),
   add a card: "X of Y minutes used · Z left" + the mini chart, linking to
   `/dashboard/settings/workspace/billing#usage`. Mirror into `PlatformDashboard.tsx` for when
   `PLATFORM_UX_ENABLED` flips.
4. **(optional)** Add the same chart to the billing page's existing Meter section.

**Guardrails:** read `org_daily_usage` with mandatory `.eq('org_id', orgId)`; source the displayed
"used" from `billable_minutes` (ceil-per-call) so home never disagrees with the invoice, the
notifications bell (`lib/platform/readModel/attention.ts:105-133`), or the cron alerts
(`lib/billing/usageAlerts.ts`).

**Key files:** `settings/workspace/billing/page.tsx`, `api/billing/summary/route.ts`,
`lib/billing/usageMath.ts`, `org_daily_usage` view, `_platform/charts/TrendChart.tsx`,
`DashboardClient.tsx`, `lib/dashboard/getDashboardOverview.ts`, `_platform/home/PlatformDashboard.tsx`.
