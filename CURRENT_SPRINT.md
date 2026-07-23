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

## Prioritized tasks (with blocked/unblocked reality)

| # | Item | State | Note |
|---|---|---|---|
| 1 | **R-080** email senders | ✅ **Done (code)** | See progress log |
| — | **R-075** version-control billing math | ⛔ **Blocked (external)** | The invoice-preview view/RPC lives only in the live Supabase DB; needs DB/dashboard access to pull into `supabase/migrations`. Prereq for R-009 + R-076 |
| — | **R-009** overage warnings | ⛔ **Blocked** | Depends on R-075 + a hard-cap policy decision |
| — | **R-060** RLS backstop | ⛔ **Blocked (external)** | Needs live DB to add + test RLS policies (10 tables confirmed RLS-disabled) |
| — | **R-057** per-operator admin identity | 🟡 **Needs decision** | Architecture choice (SSO vs Supabase admin-org + MFA) before build |
| — | **Operator handoff** (Sprint 1 Task 0) | ⛔ **Operator-only** | Rotate creds, `VAPI_WEBHOOK_BASE_URL` + reconcile, live test call, webhook enforce, CSP enforce; also gates R-008 activation |

**Unblocked code-only candidates** (if the blocked items above can't proceed): R-033 (converge
supabase-admin clients), R-034 (delete root `src/` legacy MVP), R-061 (dashboard error boundary),
R-021 (`safeErrorMessage`), R-062 (toast system), R-065 (terminology sweep).

## Reality check (raised to owner 2026-07-23)

The stated Sprint 3 theme (R-075 → R-009, R-060, R-057) is **dominated by items that need live
Supabase/Vercel access or an architecture decision** — none of which this workspace can perform, and
which must not be built on inference (billing math / tenant isolation are the two areas the
`EXECUTION_PLAN`/`RETROSPECTIVE` most explicitly forbid touching blind). **Awaiting owner steer:**
(a) provide DB/dashboard access (or a baseline dump) to unblock R-075/R-060, and/or make the R-057
decision; or (b) redirect Sprint 3's remaining capacity to the unblocked code-health/reliability
items above. R-080 (Task 1) is done regardless.

## Definition of Done

Per-task: shipped + roadmap `Completed` (date + how); CI green; docs synchronized; engineering-done
separated from operationally-verified. Sprint review + retrospective §12 at close.
