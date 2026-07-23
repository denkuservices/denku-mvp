# CURRENT SPRINT — Systemic Security & Verifiability

> The active implementation sprint. Open this every morning to know what to build next. Finding
> detail lives in `docs/IMPLEMENTATION_ROADMAP.md`; safe-sequencing and verify-first rules in
> `docs/EXECUTION_PLAN.md` + `docs/RETROSPECTIVE.md`. Update task status here as you ship; mark the
> roadmap entry `Completed` (date + how) in the same change. Sprint lifecycle: `PROJECT_CHARTER.md`
> → Sprint Lifecycle.

**Sprint 3 · Started 2026-07-23 · Status: 🟢 `IN PROGRESS`**

> Sprint 2 closed 2026-07-23 (R-011, R-008, R-018 + partial R-034; R-009 deferred). Review:
> [`docs/SPRINT_2_REVIEW.md`](docs/SPRINT_2_REVIEW.md). Sprint 3 opened by owner direction with
> **R-080 as Task 1**, then "continue with the remaining Sprint 3 scope."

## Sprint Goal

Make the foundation *verifiable and consistent*: version-control the billing math so what customers
are charged can be reviewed and tested, add a tenant-isolation backstop, give platform admin a real
identity — and clean up the email-sender inconsistency that was masking broken auth-email delivery.

## Progress log

- **2026-07-23 — R-080 (centralized email senders) shipped in code.** New env-driven
  `lib/email/senders.ts#resolveSender(kind)`; **eliminated the sandbox `onboarding@resend.dev`**; all
  sends now on verified `denku.io` (`no-reply@` auth, `notifications@` notify, `hello@` welcome);
  removed dead `SENDER`/`WELCOME_FROM`/`NOTIFY_FROM` constants; added tracked `web/.env.example` (+
  `!.env.example` gitignore exception); updated the deployment skill. 5 new tests (**78 total green**),
  build passing. Roadmap R-080 → Completed.

- **2026-07-23 — R-033 (converge Supabase admin clients) shipped.** Migrated all 10 importers
  (all server-side; middleware included) from `@/lib/supabaseAdmin` → `@/lib/supabase/admin` and
  deleted the old module. Build confirms middleware compiles on the `server-only` client. 78 tests
  green. CLAUDE.md landmine #4 updated. Roadmap R-033 → Completed.

- **2026-07-23 — R-034 (delete dead weight) shipped.** Deleted the repo-root legacy MVP `src/`
  (13 files) + the 164KB `vercel_diff_report`; `*.tsbuildinfo` already gitignored. Marketing-component
  dedupe stays folded into R-022 (still live). 78 tests green. Roadmap R-034 → Completed; CLAUDE.md
  repo-layout note updated.

- **2026-07-23 — R-061 (dashboard error boundary) shipped.** Added shared on-brand
  `dashboard/error.tsx` (calm retry + back-to-dashboard, no raw-error leak, logs digest) inherited by
  all dashboard segments. Build green. Roadmap R-061 → Completed.

- **2026-07-23 — R-021 (safeErrorMessage) shipped.** Added pure `lib/errors/safeErrorMessage.ts`
  (maps safe categories, else generic fallback — never leaks raw provider strings). Applied to the 3
  named leak points: calls page (raw Supabase error), AddPhoneNumberModal (raw `data.error`),
  onboarding "Setup required" card (raw `error.message`). 7 new tests (85 total green); build green.
  Roadmap R-021 → Completed.

- **2026-07-23 — R-062 (toast system) shipped.** Dependency-free `ToastProvider`/`useToast`
  (auto-dismiss, portal, `aria-live` for SR announcements), mounted in `dashboard/layout.tsx`.
  Converted `InviteMemberForm` off the jarring `window.location.reload()` → `toast + router.refresh`
  with `safeErrorMessage`. Blanket per-mutation rollout is incremental. 85 tests; build green.
  Roadmap R-062 → Completed.

- **2026-07-23 — R-070 (a11y structural) shipped.** Skip-to-content link + `main#main-content`
  landmark/focus target in `HorizonShell`; mobile sidebar close `<span onClick>` → labeled
  `<button aria-label="Close menu">`; toast `aria-live` (from R-062). Modal focus-trap sweep is
  documented follow-on. Build green. Roadmap R-070 → Completed (structural core).

- **2026-07-23 — R-065 (terminology sweep) shipped.** Customer-facing "Agent"→"AI" across call
  detail (context/label/transcript-speaker/insights), ticket detail label, and the dashboard widget
  ("AI Performance" + "AI" column). Code identifiers + Settings/Advanced carve-out untouched. Rule
  strengthened in `skills/design-system.md`. `[Agent]` ticket-artifact headers remain R-055. Build
  green. Roadmap R-065 → Completed.

- **2026-07-23 — R-048 (loading/skeleton cleanup) shipped.** Added reusable `Skeleton` primitives
  (`Skeleton`/`TableSkeleton`/`StatCardsSkeleton`, a11y `role=status`). Replaced the sterile
  phone-lines `Loading…` debug leftover; upgraded `dashboard/loading.tsx` + `appointments/loading.tsx`
  from bare spinners to structure-preserving skeletons. Sterile `error.tsx` boundaries left to a
  live-verified pass. Build green. Roadmap R-048 → Completed.

- **2026-07-23 — R-053 (guardrail misfire fix) shipped.** GR-1 now counts phone/email asks in
  AGENT-attributed transcript segments only (2+ agent asks to trigger), so a caller answering no
  longer force-marks a healthy call "partial". Removed `'how to make'` demo-abuse keyword. Replaced
  the buggy-behavior characterization test with 2 regression tests. 86 tests green; build green.
  Roadmap R-053 → Completed.

- **2026-07-23 — R-067 (SEO foundation) shipped.** `robots.ts` + `sitemap.ts`; root metadata enriched
  (metadataBase + OG/Twitter cards + robots + canonical); Organization/WebSite JSON-LD in marketing
  layout; per-page title/description/canonical on pricing (route layout), security, use-cases, docs,
  support, about, company. URLs derive from `siteConfig.url`, now set to canonical
  `https://www.denku.io` (owner decision — resolves the denku.io/denku.ai inconsistency). Build emits
  `/robots.txt` + `/sitemap.xml`; 86 tests green. Roadmap R-067 → Completed.

**✅ All 7 owner-ordered repo-only items complete (R-021, R-062, R-070, R-065, R-048, R-053, R-067),
plus R-080/R-033/R-034/R-061 earlier this sprint.** The remaining Sprint-3 items are external-blocked
(see the task table / status below) — awaiting live Supabase access for R-075/R-060/R-009.

- **2026-07-23 — LIVE READ ACCESS CONFIRMED to Denku prod Supabase** (`kebqwsdguxxjsijahrox`, via the
  connected Supabase integration — target it explicitly by id; BondAI is the default). Read-only by
  policy: inspection/verification only, never mutate prod data/schema; write migration FILES for an
  operator to apply. **This unblocks R-075/R-060/R-009.** CLAUDE.md landmine #10 corrected.
- **2026-07-23 — R-075 (billing math baselined) shipped.** Read the live 8-view billing chain with
  `pg_get_viewdef` and captured exact definitions into
  `supabase/migrations/20260723100000_baseline_billing_usage_views.sql` (baseline of existing prod
  objects — NOT applied to prod). Documented the rule `billable_minutes = Σ ceil(sec/60)` **per call**
  + overage/total formulas. Added golden-master `lib/billing/usageMath.ts` + 15 boundary tests
  (101 total green). `skills/database-schema.md` updated. Roadmap R-075 → Completed. **Next: R-060.**

- **2026-07-23 — R-060 (RLS backstop) PARTIAL.** Classified the 10 RLS-disabled tables by client
  access + view dependency (live `pg_depend`). Wrote
  `supabase/migrations/20260723110000_rls_backstop_service_role_tables.sql` enabling RLS+deny-all on
  the **7 service-role-only, view-free** tables (webhook_debug, personas, persona_tools,
  onboarding_activation_lock, billing_stripe_{customers,prices}, billing_invoice_runs) — zero app
  impact. **NOT applied to prod** (operator applies + verifies; reversible). Deferred: `orgs`,
  `audit_log_changes`, `org_plan_overrides` (anon-read/view-backed → need tested SELECT policies, not
  safe under read-only prod access) + the `orgScoped` helper. R-060 stays Open. **Next: R-009.**

- **2026-07-23 — R-009 (overage/pause alerts) PARTIAL.** Shipped the "loud email + banner on pause"
  half: `notifyWorkspacePaused` emails the owner on the active→paused transition (hooked in
  `pauseOrgBilling`, once per pause event; hard_cap + past_due), reusing R-008's verified sender + a
  shared recipient resolver; staged OFF behind `BILLING_NOTIFICATIONS_ENABLED`; never throws. Added a
  dashboard `PausedBanner`. 4 new tests (105 total green); build green. **Still open:** proactive
  50/75/90% minute warnings (needs a per-usage trigger) + the configurable pause-vs-keep-billing
  policy (needs the owner decision; current = pause). R-009 stays Open.
- **2026-07-23 — R-009 proactive %-warnings done.** Isolated daily cron `api/billing/cron/usage-alerts`
  (CRON_SECRET, `vercel.json` `0 8 * * *`) reads `org_monthly_overages` (R-075) and emails the highest
  newly-crossed 50/75/90% threshold per org; idempotent via new `billing_usage_alerts` table; staged
  OFF. 110 tests green. **R-009 now only needs the pause-vs-keep-billing policy decision (owner).**

- **2026-07-23 — R-057 (admin identity) documented as BLOCKED (staging, not decision).** Owner
  decision recorded (Supabase Auth, no SSO, org membership + MFA readiness). But swapping the
  `middleware.ts` Basic-Auth admin gate to Supabase-session is a critical edge-auth change that can't
  be verified under read-only prod + no staging (a bug locks out operators or opens the admin
  surface), plus a chicken-and-egg operator/migration provisioning. Recommended safe rollout captured
  in the roadmap. Left unbuilt to avoid half-wired auth. **Next unblocked: R-076.**

- **2026-07-23 — R-076 (COGS↔revenue reconciliation) shipped.** `lib/billing/reconciliation.ts`
  computes per-org-month margin from the baselined invoice-preview view (R-075); monthly cron
  `api/billing/cron/reconcile` logs `[BILLING][RECONCILE][…]` alerts on negative/thin margin. Pure
  margin math unit-tested (116 total green). Completes the billing-verifiability chain R-075→R-076.
  Roadmap R-076 → Completed. Follow-on: ops email/dashboard surfacing.

## Prioritized tasks (with blocked/unblocked reality)

| # | Item | State | Note |
|---|---|---|---|
| 1 | **R-080** email senders | ✅ **Done** | Commit `ef1ca94` |
| 2 | **R-033** converge admin clients | ✅ **Done** | Commit `1ee218d` |
| 3 | **R-034** delete dead weight | ✅ **Done** | Commit `ccfae74` |
| 4 | **R-061** dashboard error boundary | ✅ **Done** | Commit `abbeeb0` |
| — | **R-075** version-control billing math | ⛔ **Blocked (external)** | Invoice-preview view/RPC lives only in the live Supabase DB; needs DB access to pull into `supabase/migrations`. Prereq for R-009 + R-076. **Owner deferred until access provided.** |
| — | **R-009** overage warnings | ⛔ **Blocked** | Depends on R-075 + hard-cap policy decision. **Owner deferred.** |
| — | **R-060** RLS backstop | ⛔ **Blocked (external)** | Needs live DB to add + test RLS policies (10 tables RLS-disabled). **Owner deferred.** |
| — | **R-057** per-operator admin identity | ⛔ **Blocked (schema + live verify)** | **Decision made (owner, 2026-07-23): Supabase Auth as canonical IdP, NO SSO, build around org membership with MFA readiness.** But the build needs a platform-admin membership model (DB schema) + live verification of the `/admin` + `/api/admin` + `/api/internal` surfaces — both skipped per the repo-only constraint. Ready to build once schema access is provided. |
| — | **Operator handoff** (Sprint 1 Task 0) | ⛔ **Operator-only** | Rotate creds, `VAPI_WEBHOOK_BASE_URL` + reconcile, live test call, webhook enforce, CSP enforce; also gates R-008 activation |

**Remaining fully-repo-implementable items** (off the security/verifiability theme — code-health/UX;
available if the owner wants them pulled into this sprint): **R-021** (`safeErrorMessage`, pairs with
R-061), **R-067** (SEO: robots/sitemap/per-page metadata — self-contained), **R-048** (skeletons +
remove the sterile phone-lines loading/error leftovers), **R-053** (guardrail misfire — code-only,
touches call-guardrail logic + its characterization test), **R-062** (toast system), **R-065**
(terminology sweep), **R-070** (a11y structural).

## Status (2026-07-23) — paused at the external-blocker wall

**Every Sprint 3 item on the sprint's own theme (security + verifiability: R-075, R-009, R-060,
R-057) is now external-blocked** — they need live Supabase schema/DB access or the operator handoff,
all of which the owner instructed me to skip, and which must never be built on inference (billing
math / tenant isolation). The four unblocked, in-scope foundation/health items are **done and
committed** (R-080, R-033, R-034, R-061). **Per the owner's "stop and report the blocker + next best
unblocked task" instruction, work pauses here.** Next best unblocked task: **R-021** (central
`safeErrorMessage`, natural follow-on to R-061) — awaiting owner go to pull it (and/or the other
repo-only items above) into Sprint 3, or to provide DB access / close the sprint.

## Definition of Done

Per-task: shipped + roadmap `Completed` (date + how); CI green; docs synchronized; engineering-done
separated from operationally-verified. Sprint review + retrospective §12 at close.
