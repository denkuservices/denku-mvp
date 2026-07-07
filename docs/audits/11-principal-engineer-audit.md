# Audit 11 — Principal Engineer Audit

- **Date:** 2026-07-06 · **Findings current as of:** 2026-07-06
- **Lens:** principal engineer setting technical direction. Question: *is this codebase safe to
  change quickly, and in what order do we pay down the debt without regressing what works?*
- **Scope:** code craftsmanship — file size/complexity, type safety, duplication, error handling,
  test strategy, and the sequencing of refactors.
- **Relationship to prior audits:** most craftsmanship issues are already filed by Audit 00
  (R-043 monster files, R-033/034 duplication, R-021 error handling, R-032 debug artifacts, R-037
  tests). This audit adds the type-safety finding and, most importantly, the **Refactor Sequencing
  Plan** — the ordering that keeps the "do not regress" list intact.

> Living document (Rule 1). Canonical status: `docs/IMPLEMENTATION_ROADMAP.md`.

## Biggest Strengths (do not regress these)

1. **The operational core is genuinely well-engineered:** idempotency on natural keys, the
   compensation/rollback chain in phone-line purchase, resume-from-partial activation, advisory-lock
   concurrency leases with TTL + sweeper, cost reconciliation, and the deterministic artifact
   guarantee. This is the hard 20% and it's right — every refactor must preserve it.
2. **Structured logging discipline** — canonical bracket-tagged events (`[CALL_START]`,
   `[TOOL_CALLED]`, `[VAPI][BINDING]…`), never-throw-from-logging. Good observability instincts.
3. **Clear domain boundaries in `lib/`** (billing, concurrency, vapi, tickets, analytics) — the
   library layer is reasonably factored even where the routes that call it are not.
4. **Correct auth patterns where applied** (Audit 04): session + org-scoping, Stripe signature
   verification, IDOR-free `[lineId]` routes — patterns worth propagating.

## Biggest Weaknesses

1. **Monster files (R-043):** the Vapi webhook is 3,141 lines, onboarding `_actions.ts` 1,948, the
   billing settings page 1,432, `getDashboardOverview` 784 (and duplicated — see R-034), an agent
   configure component 849. These concentrate the highest-blast-radius logic in the hardest-to-review
   files.
2. **[R-074 — NEW, Medium] Type safety is eroded exactly where it matters most.** The Vapi webhook —
   the 3,141-line heart that processes money, artifacts, and tenancy — contains ~30 `any`/`as any`
   usages; payloads are threaded as `any` through extraction, merging, and DB writes. TypeScript
   provides near-zero protection on the one path where a wrong field or shape causes silent
   cross-tenant or billing errors. This compounds R-060 (no isolation backstop) and R-037 (no tests):
   the critical path has neither types, tests, nor RLS guarding it. *Direction:* define zod schemas /
   typed models for the Vapi payload shapes actually used, parse-once at the boundary, and thread
   typed objects inward; delete the `any` threading incrementally as the webhook is extracted.
3. **No tests, no CI (R-037)** — the single largest force-multiplier gap; makes every refactor below
   risky.
4. **Duplication (R-033/034):** two supabase-admin clients, two `getDashboardOverview`, duplicate
   legacy marketing components, quadruplicated rollback blocks in the purchase route.
5. **Debug artifacts + `any`-typed error handling (R-021/R-032):** raw error leakage, double
   `webhook_debug` writes, `TEMP DEBUG`/`### HIT ROUTE ###` in production paths (~29 TODO/FIXME/TEMP
   markers remain).

## Refactor Sequencing Plan

The ordering matters because the biggest files are also the most dangerous to touch and carry the
"do not regress" logic. Sequence:

1. **Safety net first — R-037 + R-060.** Before touching the monster files, write characterization
   tests around the behavior that must not change: webhook idempotency (same `vapi_call_id` twice →
   one artifact), lease acquire/release at limit, org-scoping on API routes, purchase rollback. Add
   RLS backstop policies in parallel. *You cannot safely refactor a 3,141-line untested file; make it
   tested first.*
2. **Converge duplicates — R-033/034 (low-risk, high-clarity).** Delete one supabase-admin client,
   one `getDashboardOverview`, dead root `src/`, and the duplicate marketing components. Mechanical,
   safe, shrinks surface before the hard work.
3. **Type the boundary — R-074.** Introduce zod-parsed typed models for the Vapi payload and Stripe/
   billing shapes; this makes the subsequent extraction safe by turning `any` runtime surprises into
   compile-time errors.
4. **Extract the webhook — R-043 (webhook first).** With tests (1) + types (3) in place, decompose
   `api/webhooks/vapi/route.ts` into modules (extraction, intent, artifacts, guardrails, leases,
   cost) — and while there, remove the double debug write (R-032) and fix R-050 via the shared
   assistant-config helper. Then onboarding `_actions.ts`, then the billing page (extract its private
   primitives to the design system, R-064).
5. **Sanitize errors — R-021.** Central `safeErrorMessage()`; strip debug artifacts (R-032). Cheap,
   do alongside (4).
6. **Standing rule:** new code follows the already-documented conventions (org-scoping, one admin
   client, zod at edges, no `any` on money/tenancy paths). Add a lint rule to forbid `any` in
   `api/webhooks/**` and `lib/billing/**` once R-074 lands.

## Executive Summary

This is a codebase with an excellent core wrapped in prototype-grade delivery: the distributed-
systems logic (idempotency, compensation, leases, reconciliation) is genuinely strong and must be
protected, while the *deliverability* — 3,000-line files, `any`-typed critical paths (R-074), zero
tests (R-037), and duplication (R-033/034) — makes changing it slow and risky. The one new finding
is that type safety is weakest exactly where blast radius is highest (the webhook). The core message
is about *order*, not scope: do not refactor the monster files until they're tested and typed
(steps 1→3), then extract webhook-first while fixing the correctness bugs (R-050) and debt (R-032)
that live inside it. Done in this sequence, the refactors pay down risk instead of adding it; done
out of order, they threaten the one part of Denku that's genuinely well-built.

## Action Items

| # | Action | R-ID | Priority |
|---|---|---|---|
| 1 | Characterization tests (webhook idempotency, leases, org-scoping, rollback) + CI | R-037 | Medium→High |
| 2 | RLS backstop for tenant isolation | R-060 | High |
| 3 | Type the Vapi/billing boundaries (zod), remove `any` threading | R-074 | Medium |
| 4 | Converge duplicate modules; delete dead code | R-033, R-034 | Medium |
| 5 | Extract monster files (webhook first) — carries R-050/R-032 fixes | R-043 | Low (opportunistic, post-tests) |
| 6 | Central error sanitization; strip debug artifacts | R-021, R-032 | Medium |
