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
