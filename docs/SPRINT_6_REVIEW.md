# Sprint 6 Review & Retrospective — Launch Readiness

- **Sprint:** 6 · **Window:** 2026-07-24 · **Status:** **code-complete; DoD = "launch-ready, pending
  staging env"** (the standing P0 blocker)
- **Goal (verbatim):** For first paying customers, make the ~5 sprints of built-but-dark work real,
  secure, and trustworthy — engineering that turns a sprawling activation into a safe, push-button
  launch, plus the trust-surface fixes that are pure code. Not more features.
- **One-line verdict:** **Denku is now launch-ready pending an environment.** A single preflight answers
  "safe to take a paying customer?"; every activation step is one ordered runbook; the Critical webhook
  exposure is a verified one-flip; member invites and support actually work; and the marketing over-claims
  (incl. compliance) are drafted honestly for counsel. **8 commits, 220 tests green, build green.**

---

## 1. What shipped (L1–L5)

| Item | Delivered | Roadmap |
|---|---|---|
| **L1 Preflight** | `/admin/readiness` + `GET /api/admin/readiness` (operator, Basic-Auth-gated): pure env checks (Core/Security/Voice/Email/Billing) + live DB probes; `ready` = no required failure. Flags R-001/R-077/R-080/R-047/CSP. 10 tests. | **R-098 DONE** |
| **L2 Runbook** | `docs/LAUNCH_RUNBOOK.md` — one ordered activation guide merging Sprints 1–6 (staging → preflight → secrets → migrations → reconcile → enforce → notifications → live acceptance → platform flags) with per-phase rollback, keyed to the preflight. | — |
| **L3 Enforce-readiness** | Audit confirmed the webhook is enforce-ready at the code level (route rejects on shouldReject; assistant config sends `x-vapi-secret`; no internal caller; tested). New: env-driven **`CSP_MODE`** so CSP-enforce is a redeploy-only flip; preflight `csp_mode`. | **R-001** (still In Progress — operator flip) |
| **L4 Trust fixes** | **Member invites** repaired: session-authed `/api/members/invite` (customer-reachable), additive `org_invites`, real invite email, signup **acceptance**, dead admin route removed, pending list. **Support** works: `mailto:` to `NEXT_PUBLIC_SUPPORT_EMAIL` in the dashboard + the `/contact` form actually emails now. 9 tests. | **R-010 DONE · R-047 DONE** |
| **L5 Honesty draft** | `docs/MARKETING_HONESTY_DRAFT.md` — over-claims catalog + honest replacements for review; S1 = SOC 2/HIPAA claims we don't hold (legal). Not shipped. | **R-004** (draft; awaiting counsel) |

## 2. The reframe that defined the sprint

A first-paying-customers lens (not "close roadmap items") found that **shipping more dark-launched
features was negative leverage** — the product had a Critical open security exposure (R-001), broken
day-one trust surfaces (R-010/R-047), compliance over-claims (R-004), and ~5 sprints of unverified,
flag-gated work, all blocked by the absence of a staging env. Sprint 6 built the *readiness* for that
work instead: the preflight is the go/no-go, the runbook is the order, and the trust fixes are the
pure-code gaps a paying customer hits immediately.

## 3. Design decisions

- **Preflight = pure engine + live probes.** `evaluateReadiness(env)` is deterministic and fully
  unit-tested; DB probes are best-effort (never throw, degrade to warn). `required` checks gate launch.
- **Env-driven flips over code edits.** `CSP_MODE` (new) makes CSP-enforce a redeploy, not a risky
  code change at go-live — matching the webhook's `VAPI_WEBHOOK_AUTH_MODE`.
- **Honest degradation over fake success.** The invite route reports "not enabled" if the `org_invites`
  migration isn't applied, rather than the old Potemkin "success". Every new path degrades truthfully.
- **Additive + reversible.** New table (`org_invites`, RLS-locked, documented rollback), new env vars
  (default-safe), new routes. Zero change to existing behavior; the signup acceptance only triggers when
  a pending invite exists.
- **Draft, don't ship, compliance copy.** R-004's SOC 2/HIPAA claims are a legal matter — drafted for
  counsel, not edited live (per the locked decision).

## 4. The hard constraint (why "code-complete", not "launched")

**No staging environment** — the standing P0 blocker across every sprint. Migrations, the `enforce`
flips, and the platform flags can't be verified without a place to test, so the go-live stays operator-
gated. Sprint 6's deliverables are exactly what makes that go-live safe and push-button *when the env
exists*: run the preflight, follow the runbook, flip with confidence.

## 5. Metrics

| Metric | Value |
|---|---|
| Commits | 8 (L1 preflight · L3 enforce/CSP · L4 trust · L2+L5 docs · review/roadmap) |
| New routes | `/admin/readiness`, `/api/admin/readiness`, `/api/members/invite` |
| New migration | `20260724200000_org_invites` (additive, RLS-locked) |
| New env | `CSP_MODE`, `NEXT_PUBLIC_SUPPORT_EMAIL` (+ documented `VAPI_WEBHOOK_*`) |
| Removed | dead Potemkin `/api/admin/members/invite` |
| Tests | 211 → **220** (+ preflight, invites, support), all green |
| Build | passes |
| Breaking changes | **0** (additive; flag/env-gated; honest degradation) |
| Roadmap | R-098/R-010/R-047 done; R-001 enforce-ready (flip pending); R-004 draft; 42 completed / 54 open |

## 6. Lessons

- **Readiness is a product, not a checklist.** Turning five scattered activation docs into one live
  preflight + one runbook converts "did we remember everything?" into a green/red signal — the single
  highest-leverage launch artifact.
- **The Critical item was already fixed — the risk was verification.** R-001's code has been enforce-
  ready since R-050/R-077; the exposure persists only because no one has flipped + verified it. Naming
  that precisely (vs "rewrite the webhook") kept the work honest and small.
- **A trust bug is often a reachability/honesty bug.** Invites weren't missing logic — they were behind
  the wrong auth namespace and faked success. Support wasn't missing a page — the form silently no-op'd.
  The fix was making them *reachable and honest*, not building features.
- **Some fixes must wait for a human.** Compliance claims (R-004) are a legal decision; drafting honestly
  and stopping there is the right move, not shipping a guess.

## 7. What remains / did not ship

- **The go-live itself** (operator + staging): apply migrations, set env, reconcile, flip enforce/CSP,
  run live acceptance, flip platform flags. All teed up in `docs/LAUNCH_RUNBOOK.md`.
- **R-004 marketing copy** — awaits owner/counsel review of the draft, then a single reviewed PR.
- **R-001** stays In Progress until the operator flips `VAPI_WEBHOOK_AUTH_MODE=enforce` and verifies.
- Deferred (Sprint 7+): platform UX depth (R-094–097), R-020 calendar, R-066 instrumentation, read
  cutover (R-085), backfill (R-081), new channels.

## 8. Is Sprint 6 code-complete?

**Yes — code-complete.** All five approved items (L1–L5) are delivered, tested, and committed; the DoD
was explicitly "launch-ready, pending staging env," and that is met: the preflight, runbook, enforce-
readiness, trust fixes, and honesty draft are done. The only remaining work is the operator go-live,
which is blocked on provisioning a staging environment (the standing, owner-level dependency) and, for
R-004, counsel review.

---

*Living companion to the roadmap. Sprint 6 is done-in-code; operationally launched when the runbook is
executed and the preflight is green on prod.*
