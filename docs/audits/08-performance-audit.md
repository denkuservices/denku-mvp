# Audit 08 — Performance Audit

- **Date:** 2026-07-06 · **Findings current as of:** 2026-07-06
- **Lens:** performance engineer. Question: *what will be slow or expensive — for the user (latency,
  bundle) and for us (Vercel/Supabase spend) — today and as data grows?*
- **Scope:** client bundle weight, server data-fetching efficiency, query shape/row caps, per-request
  overhead, write amplification. No profiling harness is available in-session, so numbers in the
  Performance Budget are **reasoned estimates** flagged as such; a Lighthouse/`next build --analyze`
  run should confirm them.
- **Relationship to prior audits:** references R-044 (middleware per-request queries), R-023
  (unpaginated 200-row lists), R-032 (webhook double-writes). Adds the analytics over-fetch and
  client-bundle findings.

> Living document (Rule 1). Canonical status: `docs/IMPLEMENTATION_ROADMAP.md`.

## Findings

### [R-068 — NEW, Medium (grows to High)] Analytics over-fetches: full `raw_payload` per call, no row cap, in-memory aggregation
`lib/analytics/queries.ts#fetchCalls` selects `raw_payload` — the **entire Vapi call report**
(full transcript + every event) as a JSONB blob — for *every* call in the selected range, with
**no `.limit()`**, and the analytics page then computes summaries, daily trends, by-agent, and
outcome breakdowns **in memory** across both the current and comparison periods. Consequences that
worsen linearly with call volume:
- **Transfer + memory:** a busy org on a 90-day range pulls thousands of rows each carrying a heavy
  JSONB payload the analytics computation never uses (it needs `duration_seconds`, `cost_usd`,
  `outcome`, `agent_id`, `started_at` — not the transcript). This is multi-MB of wasted transfer
  per page load and proportional server memory.
- **Unbounded:** unlike the calls *list* (capped at 200, R-023), analytics has no ceiling — the
  page gets slower forever as the org accumulates history, with no pagination or cap to save it.
- **Cost:** Supabase egress + function memory/time scale with the blob, not the metric.
This is the single heaviest page in the app and the one most certain to degrade with success.
*Direction:* select only the columns the aggregation uses (drop `raw_payload`); push counts/sums to
SQL (RPC or `count`/aggregate queries) instead of fetching rows to reduce in JS; add a range cap or
pre-aggregated rollups for long windows.

### [R-069 — NEW, Medium] Client bundle weight: Spline WebGL + two animation libraries + ApexCharts
- **Spline** (`@splinetool/react-spline`, WebGL scene) renders the landing hero robot — a multi-MB
  runtime + scene download that lands on the highest-traffic, first-impression page and directly
  taxes LCP and mobile data. It's correctly `ssr:false`/dynamic, but it's still the dominant weight
  on the page a first-time visitor loads (ties to conversion, Audit 07).
- **Two animation libraries ship simultaneously:** `gsap` **and** `framer-motion` are both
  dependencies and both imported — redundant capability, doubled animation-runtime weight. One
  should go.
- **ApexCharts** (`apexcharts` + `react-apexcharts`) is a heavy charting lib loaded on the
  dashboard; it's client-only (correctly dynamic-imported) but weighs on dashboard TTI.
*Direction:* lazy-load/defer Spline below the fold or gate it to capable devices with a lightweight
poster fallback; consolidate to a single animation library; confirm ApexCharts is code-split per
chart. Verify all three with `next build` bundle analysis (the `@next/bundle-analyzer` is already
wired via `ANALYZE=true`).

### Referenced (already filed — performance dimension noted)
- **R-044** middleware runs 2–3 DB queries (profile + settings) on *every* dashboard request →
  per-navigation latency tax and Supabase load; fail-open masks outages but not cost.
- **R-023** list pages cap at 200 rows with no pagination — bounds the query but also silently caps
  history; the real fix (pagination) must not regress into fetching everything.
- **R-032** the Vapi webhook inserts into `webhook_debug` **twice per event** and stores the full
  `raw_payload` on both `webhook_debug` and `calls` → write amplification + unbounded storage
  growth (no retention). Compounds R-068 (the same heavy blob is stored and later re-fetched).

## Performance Budget (estimates — confirm with Lighthouse / bundle analyzer)

| Surface | Metric | Current (est.) | Target | R-ID |
|---|---|---|---|---|
| Landing hero | LCP (mobile) | Poor — Spline WebGL is the LCP element / blocks paint | < 2.5s; poster fallback, defer Spline | R-069 |
| Landing | First-load JS | Heavy — Spline + gsap + framer-motion + marketing | Drop one animation lib; lazy Spline | R-069 |
| Analytics (90d, busy org) | Data transferred / page | Multi-MB — all calls × full `raw_payload`, uncapped | Minimal columns + SQL aggregation; ~10–50× smaller | R-068 |
| Analytics | Server memory/time | Scales with call volume (in-JS reduce) | Constant-ish via SQL aggregation | R-068 |
| Calls / tickets list | Rows / query | 200 cap, no pagination | Cursor pagination, page size ~25–50 | R-023 |
| Every dashboard nav | Extra DB round-trips | 2–3 middleware queries/request | 0–1 (JWT claim / short-TTL cache) | R-044 |
| Vapi webhook | Writes per event | 2× `webhook_debug` insert + full blob ×2 tables | 1 gated debug write; retention policy | R-032 |
| Dashboard TTI | Chart JS | ApexCharts (heavy), dynamic | Confirm per-chart code-split | R-069 |

## Executive Summary

Denku's performance is fine at today's scale and will bite precisely where success concentrates:
the **analytics page over-fetches catastrophically** (every call's full transcript blob, uncapped,
reduced in JavaScript — R-068), so the more a customer uses the product, the slower and more
expensive their most-used report becomes. The **landing page carries avoidable first-impression
weight** (Spline WebGL plus two redundant animation libraries — R-069) on the exact page the Growth
audit needs to convert. Neither is a rewrite: R-068 is "select the five columns you actually use and
aggregate in SQL," R-069 is "defer Spline and delete one animation library." Alongside the filed
items — middleware per-request queries (R-044), unpaginated lists (R-023), and webhook write
amplification (R-032, which stores the very blob R-068 re-fetches) — the theme is **stop moving heavy
data you don't need**: don't store the full payload twice, don't ship two animation engines, and
don't fetch transcripts to count calls. Confirm the estimates with `ANALYZE=true next build` and a
Lighthouse run, then fix R-068 first (highest cost-per-success).

## Action Items

| # | Action | R-ID | Priority |
|---|---|---|---|
| 1 | Analytics: drop `raw_payload`, aggregate in SQL, cap/rollup long ranges | R-068 | Medium (grows to High) |
| 2 | Defer/gate Spline; consolidate to one animation library; verify chart code-split | R-069 | Medium |
| 3 | Reduce middleware per-request DB queries (JWT claim / cache) | R-044 | Low |
| 4 | Cursor pagination on lists (without fetch-everything) | R-023 | Medium |
| 5 | Single gated `webhook_debug` write + retention policy | R-032 | Medium |
| 6 | Run `ANALYZE=true next build` + Lighthouse to confirm this budget | — | (verification) |
