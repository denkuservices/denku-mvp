-- R-075 — Baseline the billing/usage view chain into the repo (2026-07-23)
--
-- These views ALREADY EXIST in the live Denku Supabase project
-- (kebqwsdguxxjsijahrox); they were never version-controlled, so the numbers
-- customers are billed could not be reviewed or tested from the repo. This file
-- captures their EXACT current definitions (read from prod via pg_get_viewdef) so
-- the money math is reviewable, diffable, and rebuildable.
--
-- ⚠️ This is a DOCUMENTATION/BASELINE migration — it is NOT applied to prod (the
-- views already exist there). All statements are CREATE OR REPLACE with the exact
-- live definitions, so applying to a fresh DB (after the base tables exist) rebuilds
-- the chain identically, and re-applying to prod is a no-op-equivalent.
--
-- Dependency order (bottom-up). Base TABLES they read (calls, orgs,
-- org_plan_overrides, call_concurrency_leases) are NOT (re)created here — see R-031
-- for the full base-schema baseline.
--
-- ── THE BILLING RULES, MADE EXPLICIT ─────────────────────────────────────────────
--  * billable_minutes are computed PER CALL as ceil(duration_seconds / 60) and then
--    summed — i.e. EVERY call is rounded UP to a whole minute (a 10s call = 1 min,
--    a 61s call = 2 min). This is a real revenue rule; it was never documented.
--  * Only calls with ended_at IS NOT NULL count. duration_seconds/cost_usd NULLs → 0.
--  * total_minutes_exact = sum(duration_seconds)/60 rounded to 4 dp (reporting only;
--    NOT what is billed).
--  * overage_minutes = GREATEST(billable_minutes - included_minutes, 0).
--  * estimated_overage_cost_usd = round(overage_minutes * overage_rate, 2).
--  * estimated_total_due_usd = round(monthly_fee + estimated_overage_cost_usd, 2).
--  * Plan constants (monthly_fee / included_minutes / overage_rate / concurrency) are
--    HARDCODED inside plan_pricing + org_plan_limits (starter 149/400/0.22/1,
--    growth 399/1200/0.18/4, scale 899/3600/0.13/10) — they are the source of truth
--    the app's billing_plan_catalog must stay consistent with.
--  * A golden-master TS mirror of this math lives in web/src/lib/billing/usageMath.ts
--    (unit-tested). If you change the SQL here, update that file + its tests.
-- ─────────────────────────────────────────────────────────────────────────────────

-- 1) Per-day peak concurrency from lease intervals (sweep-line over acquired/released).
CREATE OR REPLACE VIEW public.org_daily_concurrency_peak AS
 WITH bounds AS (
         SELECT call_concurrency_leases.org_id,
            min(call_concurrency_leases.acquired_at)::date AS min_day,
            max(COALESCE(call_concurrency_leases.released_at, call_concurrency_leases.expires_at))::date AS max_day
           FROM call_concurrency_leases
          GROUP BY call_concurrency_leases.org_id
        ), days AS (
         SELECT b_1.org_id,
            d.d::date AS day,
            d.d::date::timestamp with time zone AS day_start,
            (d.d::date + 1)::timestamp with time zone AS day_end
           FROM bounds b_1
             CROSS JOIN LATERAL generate_series(b_1.min_day::timestamp with time zone, b_1.max_day::timestamp with time zone, '1 day'::interval) d(d)
        ), lease_overlaps AS (
         SELECT dy_1.org_id,
            dy_1.day,
            dy_1.day_start,
            dy_1.day_end,
            l.acquired_at,
            COALESCE(l.released_at, l.expires_at) AS end_at,
            GREATEST(l.acquired_at, dy_1.day_start) AS clip_start,
            LEAST(COALESCE(l.released_at, l.expires_at), dy_1.day_end) AS clip_end
           FROM days dy_1
             JOIN call_concurrency_leases l ON l.org_id = dy_1.org_id AND l.acquired_at < dy_1.day_end AND COALESCE(l.released_at, l.expires_at) > dy_1.day_start
        ), base AS (
         SELECT dy_1.org_id,
            dy_1.day,
            count(l.*)::integer AS base_active
           FROM days dy_1
             LEFT JOIN call_concurrency_leases l ON l.org_id = dy_1.org_id AND l.acquired_at < dy_1.day_start AND COALESCE(l.released_at, l.expires_at) > dy_1.day_start
          GROUP BY dy_1.org_id, dy_1.day
        ), events AS (
         SELECT lease_overlaps.org_id,
            lease_overlaps.day,
            lease_overlaps.clip_start AS ts,
            1 AS delta
           FROM lease_overlaps
        UNION ALL
         SELECT lease_overlaps.org_id,
            lease_overlaps.day,
            lease_overlaps.clip_end AS ts,
            '-1'::integer AS delta
           FROM lease_overlaps
        ), scan AS (
         SELECT e.org_id,
            e.day,
            e.ts,
            e.delta,
            b_1.base_active,
            (b_1.base_active + sum(e.delta) OVER (PARTITION BY e.org_id, e.day ORDER BY e.ts, e.delta ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))::integer AS concurrent_now
           FROM events e
             JOIN base b_1 USING (org_id, day)
        )
 SELECT dy.org_id,
    dy.day,
    COALESCE(max(s.concurrent_now), b.base_active, 0) AS peak_concurrent_calls
   FROM days dy
     LEFT JOIN base b ON b.org_id = dy.org_id AND b.day = dy.day
     LEFT JOIN scan s ON s.org_id = dy.org_id AND s.day = dy.day
  GROUP BY dy.org_id, dy.day, b.base_active;

-- 2) Per-day usage: PER-CALL ceil(seconds/60) billable minutes (the core rule).
CREATE OR REPLACE VIEW public.org_daily_usage AS
 WITH call_daily AS (
         SELECT calls.org_id,
            date_trunc('day'::text, calls.ended_at)::date AS day,
            count(*)::integer AS total_calls,
            sum(COALESCE(calls.duration_seconds, 0))::integer AS total_duration_seconds,
            round(sum(COALESCE(calls.duration_seconds, 0))::numeric / 60::numeric, 4) AS total_minutes_exact,
            sum(ceil(COALESCE(calls.duration_seconds, 0)::numeric / 60::numeric))::integer AS billable_minutes,
            round(sum(COALESCE(calls.cost_usd, 0::numeric)), 6) AS total_cost_usd
           FROM calls
          WHERE calls.ended_at IS NOT NULL
          GROUP BY calls.org_id, (date_trunc('day'::text, calls.ended_at)::date)
        )
 SELECT d.org_id,
    d.day,
    d.total_calls,
    d.total_duration_seconds,
    d.total_minutes_exact,
    d.billable_minutes,
    d.total_cost_usd,
    COALESCE(p.peak_concurrent_calls, 0) AS peak_concurrent_calls
   FROM call_daily d
     LEFT JOIN org_daily_concurrency_peak p ON p.org_id = d.org_id AND p.day = d.day;

-- 3) Per-month rollup of daily usage.
CREATE OR REPLACE VIEW public.org_monthly_usage AS
 SELECT org_id,
    date_trunc('month'::text, day::timestamp with time zone)::date AS month,
    sum(total_calls)::integer AS total_calls,
    sum(total_duration_seconds)::integer AS total_duration_seconds,
    round(sum(total_minutes_exact), 4) AS total_minutes_exact,
    sum(billable_minutes)::integer AS billable_minutes,
    round(sum(total_cost_usd), 6) AS total_cost_usd,
    max(peak_concurrent_calls) AS peak_concurrent_calls
   FROM org_daily_usage
  GROUP BY org_id, (date_trunc('month'::text, day::timestamp with time zone)::date);

-- 4) Plan pricing constants (hardcoded source of truth).
CREATE OR REPLACE VIEW public.plan_pricing AS
 SELECT plan_code,
        CASE plan_code
            WHEN 'starter'::text THEN 149
            WHEN 'growth'::text THEN 399
            WHEN 'scale'::text THEN 899
            ELSE 0
        END::numeric AS monthly_fee_usd,
        CASE plan_code
            WHEN 'starter'::text THEN 400
            WHEN 'growth'::text THEN 1200
            WHEN 'scale'::text THEN 3600
            ELSE 0
        END AS included_minutes,
        CASE plan_code
            WHEN 'starter'::text THEN 0.22
            WHEN 'growth'::text THEN 0.18
            WHEN 'scale'::text THEN 0.13
            ELSE 0::numeric
        END AS overage_rate_usd_per_min
   FROM ( VALUES ('starter'::text), ('growth'::text), ('scale'::text)) v(plan_code);

-- 5) Per-org plan code + concurrency limit (from org_plan_overrides).
CREATE OR REPLACE VIEW public.org_plan_limits AS
 SELECT o.id AS org_id,
    ov.plan_code,
        CASE lower(ov.plan_code)
            WHEN 'starter'::text THEN 1
            WHEN 'growth'::text THEN 4
            WHEN 'scale'::text THEN 10
            ELSE NULL::integer
        END AS concurrency_limit
   FROM orgs o
     LEFT JOIN org_plan_overrides ov ON ov.org_id = o.id;

-- 6) Monthly overage minutes + estimated overage cost.
CREATE OR REPLACE VIEW public.org_monthly_overages AS
 SELECT mu.org_id,
    mu.month,
    pl.plan_code,
    pp.included_minutes,
    mu.billable_minutes,
    GREATEST(mu.billable_minutes - pp.included_minutes, 0) AS overage_minutes,
    pp.overage_rate_usd_per_min,
    round(GREATEST(mu.billable_minutes - pp.included_minutes, 0)::numeric * pp.overage_rate_usd_per_min, 2) AS estimated_overage_cost_usd,
    mu.total_cost_usd,
    mu.total_minutes_exact
   FROM org_monthly_usage mu
     JOIN org_plan_limits pl ON pl.org_id = mu.org_id
     JOIN plan_pricing pp ON pp.plan_code = pl.plan_code;

-- 7) Monthly concurrency compliance vs plan limit.
CREATE OR REPLACE VIEW public.org_monthly_concurrency_compliance AS
 SELECT mu.org_id,
    mu.month,
    pl.plan_code,
    pl.concurrency_limit,
    mu.peak_concurrent_calls,
    mu.peak_concurrent_calls > pl.concurrency_limit AS is_over_limit,
    GREATEST(mu.peak_concurrent_calls - pl.concurrency_limit, 0) AS over_by
   FROM org_monthly_usage mu
     JOIN org_plan_limits pl ON pl.org_id = mu.org_id;

-- 8) The invoice preview the app reads (estimated_total_due_usd is what gets billed).
CREATE OR REPLACE VIEW public.org_monthly_invoice_preview AS
 SELECT o.org_id,
    o.month,
    o.plan_code,
    pp.monthly_fee_usd,
    o.included_minutes,
    o.billable_minutes,
    o.overage_minutes,
    o.overage_rate_usd_per_min,
    o.estimated_overage_cost_usd,
    round(pp.monthly_fee_usd + o.estimated_overage_cost_usd, 2) AS estimated_total_due_usd,
    o.total_cost_usd,
    o.total_minutes_exact,
    cc.peak_concurrent_calls,
    cc.concurrency_limit,
    cc.is_over_limit,
    cc.over_by
   FROM org_monthly_overages o
     JOIN plan_pricing pp ON pp.plan_code = o.plan_code
     JOIN org_monthly_concurrency_compliance cc ON cc.org_id = o.org_id AND cc.month = o.month;
