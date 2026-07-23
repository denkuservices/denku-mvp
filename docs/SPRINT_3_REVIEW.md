# Sprint 3 Review & Retrospective — Systemic Security & Verifiability

- **Sprint:** 3 · **Window:** 2026-07-23 (single working session, two waves) · **Status:** living —
  most of the sprint shipped; a few items remain blocked on a staging env / an owner decision.
- **Goal (verbatim):** *Make the foundation verifiable and consistent: version-control the billing
  math so what customers are charged can be reviewed and tested, add a tenant-isolation backstop,
  give platform admin a real identity — and clean up the email-sender inconsistency.*
- **One-line verdict:** **19 commits, 13 items fully shipped + 2 substantial partials, 1 precisely
  blocked; 116 tests green (73 → 116), build green, zero prod mutations.** The billing-verifiability
  chain (R-075 → R-076) is complete and the money math is now reviewable/tested for the first time.

---

## 1. Two waves

**Wave A — repo-only (before live DB access).** Executed the owner's ordered list plus foundation
health: **R-080** (centralized verified email senders; sandbox eliminated), **R-033** (single Supabase
admin client), **R-034** (deleted the root legacy `src/`), **R-061** (dashboard error boundary),
**R-021** (`safeErrorMessage`), **R-062** (toast system w/ aria-live), **R-070** (a11y skip-link +
landmark), **R-065** (AI-not-agent sweep), **R-048** (loading skeletons), **R-053** (guardrail-misfire
fix), **R-067** (SEO: robots/sitemap/OG/JSON-LD/per-page metadata), plus the canonical-domain fix
(`siteConfig.url = https://www.denku.io`).

**Wave B — live read-only Supabase access.** The connected integration reaches Denku prod
(`kebqwsdguxxjsijahrox`, target explicitly by id; BondAI is the default — CLAUDE.md landmine #10
corrected). Used **for inspection/verification only — zero prod data/schema mutations**; all DB
changes are migration FILES for an operator to apply.

## 2. Completed / partial / blocked

**Fully completed (13):** R-080, R-033, R-034, R-061, R-021, R-062, R-070, R-065, R-048, R-053, R-067,
**R-075**, **R-076**.

- **R-075 (billing math baselined).** Read the live 8-view chain (`org_daily_concurrency_peak` →
  `org_daily_usage` → `org_monthly_usage` → `org_monthly_overages` → `org_monthly_invoice_preview`)
  via `pg_get_viewdef` and captured exact definitions into
  `supabase/migrations/20260723100000_baseline_billing_usage_views.sql`. **The rounding rule is now
  documented and proven:** `billable_minutes = Σ ceil(duration_seconds/60)` **per call**. Added a pure
  golden-master `lib/billing/usageMath.ts` + 15 boundary tests (incl. "three 10s calls bill 3 min").
- **R-076 (COGS↔revenue reconciliation).** Per-org-month margin from the baselined invoice-preview
  view; monthly cron logs `[BILLING][RECONCILE]` alerts on negative/thin margin. Completes R-075→R-076.

**Partial (2):**
- **R-060 (RLS backstop) — 7/10 tables.** Classified all 10 RLS-disabled tables by client access +
  view dependency (`pg_depend`); migration `20260723110000` enables RLS+deny-all on the 7
  service-role-only, view-free tables (zero app impact). **Deferred:** `orgs`, `audit_log_changes`,
  `org_plan_overrides` (anon-read / view-backed → need *tested* SELECT policies) + the `orgScoped`
  helper — not safe under read-only prod without a staging test (a wrong `orgs` policy blanks the
  dashboard).
- **R-009 (overage/pause alerts) — 3 of 4 pieces.** Shipped: pause **email** (transition-detected in
  `pauseOrgBilling`) + dashboard **banner** + proactive **50/75/90% usage warnings** (isolated daily
  cron reading `org_monthly_overages`, idempotent via `billing_usage_alerts`). All staged behind
  `BILLING_NOTIFICATIONS_ENABLED`. **Remaining:** the configurable **pause vs keep-billing** policy —
  needs the owner product decision (current behavior = pause, preserved).

**Blocked, precisely (1):**
- **R-057 (per-operator admin identity).** Owner decision recorded (Supabase Auth, no SSO, org
  membership + MFA readiness). Implementation blocked on a **staging environment**: swapping the
  `middleware.ts` Basic-Auth admin gate to Supabase-session is a critical edge-auth change that can't
  be verified under read-only prod (a bug locks out operators or opens `/admin`), with a chicken-and-egg
  operator/migration provisioning. Recommended safe rollout documented; left unbuilt to avoid
  half-wired auth.

## 3. Operator residuals (engineering-done ≠ live) — migration FILES, not applied

Live access was read-only; nothing was applied to prod. To activate:
1. Apply migrations: `20260723100000` (billing views — already live, a no-op baseline),
   `20260723110000` (RLS on 7 tables — **verify with the checklist in the file**),
   `20260723120000` (`billing_usage_alerts` table).
2. Register the two new crons (already in `vercel.json`): `usage-alerts` (daily), `reconcile` (monthly).
3. Set `BILLING_NOTIFICATIONS_ENABLED=true` after confirming `denku.io` deliverability (also gates R-008).
4. Carry-over from earlier sprints: the Sprint-1 operator handoff + R-008 activation.

## 4. Metrics

| Metric | Value |
|---|---|
| Commits (Sprint 3) | 19 |
| Items fully completed | 13 · **partial** 2 (R-060, R-009) · **blocked** 1 (R-057) |
| Roadmap | now **54 open / 1 in progress / 25 completed** (was ~67/13 at Sprint-2 close) |
| Tests | 73 → **116** (+43), all green |
| New migrations (files, operator-applied) | 3 (billing-views baseline, RLS backstop, usage-alerts) |
| New crons | 2 (usage-alerts, reconcile) |
| Prod mutations | **0** (read-only inspection only) |
| Regressions | 0 (build + tests green throughout) |

## 5. Lessons

- **The unversioned-truth hazard was finally closed at the source.** For three sprints the billing
  math was "inferred, never read" (RETROSPECTIVE §5.2). Read-only DB access turned it into a
  reviewed, tested, documented artifact — and surfaced the real, never-documented rule (per-call
  ceil). Baselining unversioned truth (R-031/R-075) is upstream of trusting everything it touches.
- **Read-only access is the right blast radius.** Inspect + write migration FILES + document a
  verification checklist; never mutate prod. It unblocked R-075/R-060/R-009/R-076 without risk.
- **A wrong RLS policy or admin-auth flip needs staging, and saying so is the honest move.** R-060's
  anon-read tables and R-057's middleware change were deferred *precisely* because they can't be
  verified read-only — not padded or half-shipped.
- **Reusing the just-built seams compounded.** R-008's sender/recipient infra powered R-009's three
  notification paths; R-075's views powered R-076. Small, composable pieces paid off.

## 6. Recommendations / what's next

1. **Provide a staging (or preview) env** → unblocks R-057 (admin identity) and R-060's anon-read
   policies — the two highest-value remaining security items.
2. **Make the R-009 hard-cap policy decision** (pause vs keep-billing) → closes R-009.
3. **Apply the 3 migrations + register crons + flip `BILLING_NOTIFICATIONS_ENABLED`** → the billing
   alerts and RLS backstop go live.
4. **R-031** (full-schema baseline) is now doable via live access and would complete the
   verifiability foundation (unblocks R-036); large/mechanical — a good focused next task.

---

*Living companion to the roadmap; update as R-009/R-060 finish and R-057 unblocks.*
