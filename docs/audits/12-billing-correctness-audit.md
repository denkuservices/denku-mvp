# Audit 12 — Billing Correctness Audit

- **Date:** 2026-07-06 · **Findings current as of:** 2026-07-06
- **Lens:** revenue/billing engineer verifying the *money math* — does what a customer is charged
  correctly follow from what they used? (Audit 00 reviewed billing *architecture*, which is sound;
  this audits *correctness*.)
- **Scope:** the money path — call cost/duration → billable minutes → overage → invoice → Stripe —
  including rounding, boundary conditions, month-close, and margin.
- **Why this audit exists:** flagged as a dedicated deep-dive after Audit 03; for a usage-billed
  product, silent over-charging is an existential trust event and silent under-charging is a margin
  leak, and neither is currently testable.

> Living document (Rule 1). Canonical status: `docs/IMPLEMENTATION_ROADMAP.md`.

## The money path (as traced from code)

1. Per call, the Vapi webhook reconciles **`calls.cost_usd`** (what Vapi charges Denku) via the
   `reconcile_call_cost` RPC — idempotent, rounded to 6 decimals. ✅ verifiable, sound.
2. At invoice time, `close-month` / `create-draft-invoice` / `overage/collect-now` all read a
   **preview object** with fields `monthly_fee_usd`, `billable_minutes`, `overage_minutes`,
   `overage_rate_usd_per_min`, `estimated_overage_cost_usd`, `estimated_total_due_usd`,
   `max_billable_minutes_per_month`.
3. The code multiplies `estimated_overage_cost_usd * 100` → cents → Stripe invoice line item.

The problem is **step 2**: that preview object comes from a DB view/RPC (e.g.
`billing_invoice_preview`) that computes usage → minutes → overage. **That computation is not in the
repository** (base schema + views live only in the live Supabase project — the R-031 landmine), so
the single most important calculation in the business — how usage becomes money — cannot be read,
reviewed, or tested from the codebase.

## Findings

### [R-075 — NEW, High] The billing computation lives in an unversioned DB object and is untestable
Everything that turns usage into a charge — how `billable_minutes` is derived from call durations
(per-call `ceil` vs summed-then-rounded materially changes the bill), how `overage_minutes` nets
against included minutes, how `estimated_overage_cost_usd` and `estimated_total_due_usd` are
computed — happens inside a DB view/RPC that is **not in the repo**. Consequences:
- **Unverifiable:** no one can review the money math without querying prod; this document cannot
  confirm it's correct.
- **Untestable:** with no schema in-repo (R-031) and no tests (R-037), there is no regression guard
  on the calculation that generates revenue.
- **"Estimated" becomes real:** the field literally named `estimated_overage_cost_usd` /
  `estimated_total_due_usd` is what gets charged via Stripe — the naming signals a preview that was
  promoted to an invoice without a reconciliation/finalization step that recomputes from source.
*Direction:* pull the preview view/RPC into `supabase/migrations` (baseline it — R-031), document the
minute-derivation and rounding rules explicitly, add golden-master tests over representative usage
(R-037), and rename `estimated_*` to reflect that it's the billed figure once finalized.

### [R-076 — NEW, Medium] No reconciliation between Vapi cost (COGS) and customer minute-billing (revenue)
Denku **pays Vapi** per `calls.cost_usd` but **bills the customer** per `billable_minutes ×
overage_rate` (after included minutes). These are two independent numbers derived from the same
calls, and nothing reconciles them or checks that summed `billable_minutes` matches the durations
Vapi actually reported. Risks: (a) **margin blind spot** — if Vapi's cost rises or durations and
billed minutes diverge, margin erodes with no alert; (b) **correctness drift** — a bug in the
minutes derivation (R-075) is invisible because no cross-check exists against the cost that's known-
good. *Direction:* add a monthly reconciliation that compares Σ`cost_usd` (COGS) vs billed revenue
and Σ`duration_seconds` vs Σ`billable_minutes`, surfaced to ops with a variance threshold alert.

### Boundary conditions to verify (once R-075 is in-repo)
- Rounding rule for minutes (per-call vs monthly aggregate) — currently invisible.
- Included-minutes netting at exactly the plan boundary (400/1200/3600).
- Overage threshold ($100) and hard-cap ($250) transitions vs the collected-so-far state
  (`billing_overage_state`) — double-charge / missed-charge at the boundary.
- The `max_billable_minutes_per_month` guardrail in `create-draft-invoice` (a good safety cap) —
  confirm it fails safe and alerts rather than silently truncating revenue.
- Month-close idempotency under the **double trigger** (Vercel cron + GitHub Action) — lock tokens
  exist (sound), but verify no partial-invoice race.

## Money-Path Trace (verifiability map)

| Step | Source | Verifiable from repo? | R-ID |
|---|---|---|---|
| Call cost (COGS) | `reconcile_call_cost` RPC → `calls.cost_usd` | ✅ Yes (6-dp rounding, idempotent) | — |
| Usage → billable minutes | DB preview view/RPC | ❌ **No — not in repo** | R-075, R-031 |
| Included-minutes netting → overage minutes | DB preview view/RPC | ❌ No | R-075 |
| Overage cost (`estimated_overage_cost_usd`) | DB preview view/RPC | ❌ No | R-075 |
| Threshold/hard-cap state | `billing_overage_state` (in DB) | ⚠ Partial (table known, transitions untested) | R-075/R-037 |
| Invoice line items → Stripe | `close-month` / `create-draft-invoice` (in repo) | ✅ Yes (`Math.round($*100)`) | — |
| COGS vs revenue reconciliation | (none) | ❌ Does not exist | R-076 |

## Executive Summary

The billing *plumbing* is sound — cost reconciliation is idempotent and correct, Stripe line-item
construction is straightforward, month-close is lock-guarded — but the billing *brain* is invisible.
The calculation that turns usage into money lives in an unversioned DB view (R-075), so the most
revenue-critical logic in the company can't be reviewed or tested, and a field named "estimated" is
what customers are charged. Compounding it, nothing reconciles what Denku pays Vapi against what it
bills customers (R-076), so both over-charging (trust-fatal) and margin leakage (silent) are
possible and undetectable. Neither finding says the math is *wrong* — the point is that **no one can
currently prove it's right**, which for a usage-billed product is itself the finding. Fix order:
baseline the view into the repo (R-031), document + golden-master-test the math (R-037), then add the
COGS/revenue reconciliation (R-076). Until then, treat every invoice as unverified.

## Action Items

| # | Action | R-ID | Priority |
|---|---|---|---|
| 1 | Baseline the billing preview view/RPC into `supabase/migrations`; document minute/rounding rules | R-075, R-031 | High |
| 2 | Golden-master tests over representative usage (boundaries, rounding, threshold/cap) | R-075, R-037 | High |
| 3 | Monthly COGS-vs-revenue + duration-vs-billed reconciliation with variance alert | R-076 | Medium |
| 4 | Rename `estimated_*` billed fields; add explicit finalize-from-source step | R-075 | Medium |
