# Audit 00 — Technical Architecture Audit

- **Date:** 2026-07-06 · **Findings current as of:** 2026-07-07
- **Lens:** full-stack engineering review (architecture, security, data, integrations, code quality)
- **Scope:** entire repository — `web/` app, API routes, Supabase migrations, Vapi/Stripe/Resend
  integrations, middleware, frontend surfaces
- **Deep-dive companions:** the mechanics discovered by this audit are documented durably in
  `skills/*.md`; stable rules live in `CLAUDE.md`. This document records the *findings*.

> Living document (Rule 1). When a finding is resolved, update it here AND mark the matching
> `R-###` in `docs/IMPLEMENTATION_ROADMAP.md` as Completed.

## Overall assessment

A functional, operationally thoughtful early-production MVP with prototype-grade hygiene. The
billing/telephony/concurrency core shows real distributed-systems maturity (idempotency,
compensation flows, advisory-lock leases, cost reconciliation) — the hardest thing to retrofit,
and it already exists. The debt is concentrated in security seams, duplicated modules, giant
files, shipped debug artifacts, and a total absence of tests.

## Findings

### Security (Critical)

- **[R-001] Vapi webhook is unauthenticated.** `web/src/app/api/webhooks/vapi/route.ts` accepts
  any POST — no signature or secret. Forged events can create tickets/leads in any org (assistant
  IDs are discoverable), exhaust concurrency leases (inbound-call DoS), and pollute call/billing
  data. The single most serious issue in the codebase.
- **[R-002] Public debug endpoints leak admin material.** `api/debug/basic-auth` and
  `api/debug/headers` return `ADMIN_USER` plaintext, password length, and env details; both sit
  outside the middleware matcher, i.e. publicly reachable in production.
- **[R-003] PII response headers.** Middleware sets `x-auth-user` / `x-auth-email` /
  `x-auth-confirmed` on every dashboard response.

### Broken behavior (High)

- **[R-010] Member invites broken by namespace collision.** `InviteMemberForm` calls
  `/api/admin/members/invite` from the browser; middleware demands HTTP Basic Auth for all
  `/api/admin/*` → customers get 401. Root cause: two "admin" concepts (platform Basic Auth vs
  workspace roles) share one URL namespace. Cross-ref: product impact in
  [Audit 01](01-ceo-product-audit.md) (C7).
- **[R-011] No password-reset flow.** Email template exists (`lib/email/templates.ts`); no page or
  route uses it. Cross-ref: Audit 01 (C7).
- **[R-019] Intent detection is a stub.** `detectCallIntent` always returns `"other"`, so every
  call becomes a support ticket and the deterministic-appointment path is unreachable except via
  explicit LLM tool calls. Cross-ref: Audit 01 (H14) — this stub blocks the "booking" promise.
- **[R-021] Raw upstream error strings shown to users** (calls page, purchase modal, onboarding
  activation) — Supabase/Vapi messages leak verbatim into UI.

### Architecture & data risks (Medium)

- **[R-030] Rate limiter is a no-op on Vercel** — `lib/rateLimit.ts` is an in-memory Map; each
  serverless invocation starts empty. Nothing security-relevant may depend on it.
- **[R-031] Schema drift / schema not in repo.** Base schema exists only in the live Supabase DB;
  `supabase/migrations/` is incremental with several unnumbered files; RPCs `reconcile_call_cost`
  and the TABLE-returning `acquire_org_concurrency_lease` exist only in prod. Reconstruction of
  the environment from the repo is impossible today. (Also: the workspace's Supabase MCP points at
  the wrong project — see `skills/database-schema.md`.)
- **[R-033] Duplicate service-role clients** — `lib/supabaseAdmin.ts` (~10 imports, incl.
  middleware) vs `lib/supabase/admin.ts` (~53). One must win.
- **[R-036] Half-finished org migration** — `orgs` + `organizations_legacy` dual-writes +
  read-only `organizations` VIEW; two disagreeing org-creation paths (`signupAction` random UUID
  vs `ensureDefaultOrgForUser` orgId = userId).
- **Tenant isolation is discipline-based.** Nearly all queries use the service role with manual
  `.eq("org_id", …)`; RLS is patchy. One missed filter = cross-tenant leak; no tests to catch it.
  (Tracked under [R-037] test-suite foundation; the rule itself is codified in `CLAUDE.md`.)
- **Internal HTTP self-calls** (purchase → addons/update with forwarded cookies; webhook → tools
  routes with shared secret) are fragile and non-atomic. (Tracked under [R-043] refactors.)

### Hygiene (Medium/Low)

- **[R-032] Debug artifacts shipped to prod:** `### HIT ROUTE ###` markers, `TEMP DEBUG` logs,
  double `webhook_debug` insert per webhook, `DEBUG time filter` logs, `console.log` throughout.
- **[R-034] Dead weight committed:** legacy root `src/` MVP, `vercel_diff_report_*.txt` (165 KB),
  `tsconfig.tsbuildinfo`, duplicate legacy marketing components.
- **[R-035] Stripe checkout uses inline `price_data`** instead of catalog Prices — plan changes /
  prorations / annual billing get harder the longer this lasts (blocks Audit 01's R-005).
- **[R-037] ~~Zero automated tests, no CI~~ — RESOLVED (foundation) 2026-07-07.** Beyond the
  billing-cron Action there were no tests/CI. Sprint 1 Task 3 added vitest (`web/test/`, 19 tests,
  Supabase mocked) with the three highest-value seed suites — org-scoping, webhook-artifact
  idempotency, lease acquire/release at limit — and `.github/workflows/ci.yml` (test blocking,
  lint non-blocking; Vercel = build gate). Foundation to expand; a route-level webhook integration
  test awaits the testability refactor (R-043/R-074). See roadmap R-037.
- **[R-043] Monster files:** Vapi webhook 3,142 lines; onboarding `_actions.ts` 1,948; billing
  settings page 1,432 (client component with private primitives). Refactor opportunistically.
- **[R-044] Middleware runs 2–3 DB queries per dashboard request** (profile + settings) — latency
  tax; fail-open policy masks outages.

### Positives worth preserving (do not regress)

- Deterministic artifact guarantee (`ensureTicketForCall` / `ensureAppointmentForCall`).
- Compensation/rollback chain in phone-line purchase; resume-from-partial activation.
- Advisory-lock concurrency leases with TTL + sweeper; cost reconciliation RPC.
- Pause enforcement that actually unbinds Vapi numbers; effective-limits computed live.
- Stripe webhook signature verification; `DENKU_TOOL_SECRET` on tool routes; cron secret.
- Idempotent, guarded month-close (lock tokens) surviving double triggers (Vercel cron + GH Action).

## Executive Summary

Denku's engine (calls → artifacts → billing) is real and unusually robust for its stage; its
perimeter is not. Three same-day security fixes (R-001/002/003) remove most of the existential
risk. The next tier is fixing user-visible breakage (R-010/011/021) and the intent stub (R-019)
that blocks the product's core "booking" promise. Structural debt (schema-in-repo R-031, module
duplication R-033, tests R-037) should be paid down alongside feature work, not as a big-bang.

## Action Items

| # | Action | Roadmap ID | Priority |
|---|---|---|---|
| 1 | Add secret/signature verification to the Vapi webhook | R-001 | Critical |
| 2 | Delete or protect `/api/debug/*` endpoints | R-002 | Critical |
| 3 | Remove `x-auth-*` response headers from middleware | R-003 | Critical |
| 4 | Move member invite off `/api/admin/*` (session auth + role check) | R-010 | High |
| 5 | Build forgot-password flow (template already exists) | R-011 | High |
| 6 | Implement real intent detection (transcript/tool-based) | R-019 | High |
| 7 | Sanitize user-facing error messages | R-021 | High |
| 8 | Snapshot live DB into a baseline migration; number all migrations | R-031 | Medium |
| 9 | Converge on `lib/supabase/admin.ts`; delete duplicate client | R-033 | Medium |
| 10 | Strip debug logging/artifacts from production paths | R-032 | Medium |
| 11 | First tests: org-scoping, webhook idempotency, lease limits | R-037 | Medium |
