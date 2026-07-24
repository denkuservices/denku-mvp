# CURRENT SPRINT — Launch Readiness (Sprint 6)

> The active implementation sprint. Proposal: `docs/SPRINT_6_PROPOSAL.md`; runbook:
> `docs/LAUNCH_RUNBOOK.md`; review: `docs/SPRINT_6_REVIEW.md`; preflight: `/admin/readiness`.

**Sprint 6 · Started 2026-07-24 · Status: ✅ CODE-COMPLETE 2026-07-24 — "launch-ready, pending staging env"**

> First-paying-customers reframe: made the ~5 sprints of built-but-dark work real, secure, and
> trustworthy. Engineering that turns a sprawling activation into a safe, push-button launch + the
> trust-surface fixes that are pure code. **NOT** more features. 220 tests green; build green.

## Owner decisions (locked 2026-07-24)
Sprint 6 = **Launch Readiness** (platform UX depth R-094–097 → Sprint 7+) · **no staging env near-term**
→ DoD = "launch-ready, pending env" (all items verifiable without staging; operator go-live blocked on
env — the #1 risk) · all 3 trust fixes (R-010/R-047/R-004) · R-004 copy **drafted for review, not shipped**.

## What shipped (L1–L5)

### L1 — Production Readiness Preflight (R-098)  ·  ✅ DONE
`lib/launch/checks.ts` (pure `evaluateReadiness(env)` + `summarizeReadiness`) + `readiness.ts` (env +
best-effort DB probes) + `/admin/readiness` page + `/api/admin/readiness` (operator, Basic-Auth-gated).
One go/no-go: `ready` = no required check failing. Flags R-001/R-077/R-080/R-047/CSP. 10 tests.

### L2 — Consolidated Launch Runbook  ·  ✅ DONE
`docs/LAUNCH_RUNBOOK.md` — one ordered guide merging Sprints 1–6 activation (staging → preflight →
secrets → migrations → reconcile → security enforce → notifications → live acceptance → platform flags),
per-phase rollback, keyed to the preflight. Supersedes the scattered `SPRINT_*_ACTIVATION` docs.

### L3 — Webhook enforce-readiness (R-001)  ·  ✅ DONE (code); operator flip pending
Audit confirmed enforce-ready (route rejects on shouldReject; assistant sends `x-vapi-secret`; no
internal caller; tested). New env-driven **`CSP_MODE`** → CSP-enforce is a redeploy-only flip; preflight
`csp_mode`. R-001 stays In Progress until the operator flips + verifies.

### L4 — Trust-surface fixes  ·  ✅ DONE (R-010, R-047)
**Invites:** session-authed `/api/members/invite` (customer-reachable), additive RLS-locked
`org_invites`, real email, **signup acceptance** (invited email joins the org), dead admin route removed,
pending list. **Support:** working `mailto:` (`NEXT_PUBLIC_SUPPORT_EMAIL`) in the dashboard + the
`/contact` form actually emails now. 9 tests.

### L5 — Marketing honesty draft (R-004)  ·  ✅ DRAFTED (not shipped)
`docs/MARKETING_HONESTY_DRAFT.md` — over-claims + honest replacements for owner/counsel. S1 = SOC 2/
HIPAA claims we don't hold (legal); S2 = fabricated metrics; S3 = channel/absolute over-claims.

## Definition of Done — met ("launch-ready, pending env")
Preflight green-capable; runbook is one ordered source of truth; the enforce flips are safe one-liners;
invites + support work; honest copy drafted. CI (220 tests) + build green; docs synced. The operator
go-live is teed up push-button for when a staging env exists.

## Explicitly OUT of scope (→ Sprint 7+)
Platform UX depth (R-094–097) · R-020 calendar · R-066 instrumentation · read cutover (R-085) · backfill
(R-081) · new channels. **The operator go-live** (needs staging) is out of this sprint by design.

## Next
Operator: provision a staging env, then run `docs/LAUNCH_RUNBOOK.md` (preflight green → live acceptance
→ prod). Owner/counsel: review `docs/MARKETING_HONESTY_DRAFT.md`. Then Sprint 7 (product depth).
