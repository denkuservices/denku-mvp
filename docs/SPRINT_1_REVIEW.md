# Sprint 1 Review & Retrospective — Security & Trust Foundation

- **Sprint:** 1 · **Window:** 2026-07-07 → 2026-07-08 · **Reviewed:** 2026-07-08
- **Goal (verbatim):** *Close the critical security holes and remove every in-product falsehood, so
  Denku is safe to run and honest to look at. When this sprint ends, no forged request can write to
  a tenant, no screen shows fabricated data, and the core call → artifact loop provably works.*
- **One-line verdict:** **Code-complete and shipped — all 8 tasks landed, CI-green and deployed —
  but the sprint's Definition of Done is NOT fully signed off.** Several closures depend on
  operator/external actions that cannot be done from the repo (rotate credentials, set env vars, run
  a reconcile, place a live test call, flip enforcement). Those are enumerated below as a handoff
  checklist. This is an honesty call, not a shortfall in the work: the engineering is done; the
  operational verification is pending.

---

## 1. Planned vs delivered

| # | Task (planned) | Roadmap | Delivered | Commit |
|---|---|---|---|---|
| 1 | **[VERIFY]** live Vapi `toolIds` state before touching config | R-050 | ✅ Read-only live inspection; **no manual config at risk**; filed **R-077** (localhost `serverUrl`) | `1deb3d8` |
| 2 | **[VERIFY]** webhook reachable/unauth in prod | R-001 | ✅ Confirmed unauth by benign probe; found `VAPI_WEBHOOK_SECRET` unused in code; R-077 refined to *latent* (test account, 0 calls) | `283d2ae` |
| 3 | Test harness + CI (3 characterization suites) | R-037 | ✅ vitest + GitHub Actions; leases / webhook-artifact idempotency / org-scoping | `858bd6d` |
| 4 | Delete `/api/debug/*`; remove `x-auth-*` PII headers | R-002, R-003 | ✅ Both done; **discovery:** debug routes were gitignored/local-only (never in prod — corrects the audit's "reachable in production") | `fed2a1a` |
| 5 | Authenticate the webhook; stage the rollout | R-001 | ⚠️ **Code shipped, staged (observe-only default).** Reuses the `x-vapi-secret` header Vapi already sends. **Not yet enforcing** → R-001 stays *In Progress* | `f248e83` |
| 6 | Shared assistant-config helper (tools + serverUrl) + reconcile | R-050, R-077 | ✅ **Code complete** — one helper wired into all 3 paths; reconcile endpoint added. Existing assistants + live test call are operator-gated | `3c51091` |
| 7 | Remove fabricated + placeholder in-product screens | R-046, R-049, R-012 | ✅ All removed (fake keys, fake integration health, no-op danger zone, 5 stub routes + dead `QuickActionsCard`) | `c3dd601` |
| 8 | Security headers + CSP report-only | R-056 | ✅ 5 headers enforced + CSP report-only + `/api/csp-report` collector; verified live on `www.denku.io` | `31fd78a` |

**Scope discipline:** no scope creep. Two adjacent-but-separate concerns were explicitly *not*
pulled in: R-004 (marketing-surface truth pass — needs legal counsel) and R-051/R-052 (voice/
duration config — the new helper is where they'll land next).

## 2. Completed roadmap IDs

**Completed (9):** R-002, R-003, R-012, R-037, R-046, R-049, R-050, R-056, R-077.
**In Progress (1):** R-001 (staged auth shipped; enforcement is an operator flip).
**New finding filed during the sprint (1):** R-077 (surfaced by the Task 1 verification).

Roadmap status moved from **77 open / 0 done** at sprint start to **67 open / 1 in progress / 9
completed**.

## 3. Remaining external / operator tasks (the DoD residuals)

None of these are code — they need Vercel / Vapi dashboard access or a phone, and they are what
stands between "shipped" and "DoD fully green." Ordered by leverage:

1. **Rotate `ADMIN_USER` / `ADMIN_PASS`** in Vercel (R-002 follow-up; lower urgency now the leak is
   confirmed local-only, but it also shrinks R-057's blast radius).
2. **Reconcile existing assistants (R-050/R-077):** set `VAPI_WEBHOOK_BASE_URL` in Vercel to the
   canonical prod origin, then run `POST /api/internal/reconcile-vapi-assistants` (Basic Auth,
   idempotent).
3. **Place a live test call** (Audit 03 protocol scenarios 1–2) to prove the call → ticket /
   appointment loop end-to-end — the one DoD item that requires a human. (Appointment path also
   needs R-019 intent detection, a later sprint.)
4. **Enforce webhook auth (R-001):** confirm `VAPI_WEBHOOK_SECRET` is set in Vercel and matches the
   Vapi `x-vapi-secret` value → verify a real call logs `[VAPI][WEBHOOK][AUTH][OK]` → set
   `VAPI_WEBHOOK_AUTH_MODE=enforce`.
5. **Enforce CSP (R-056):** watch `[CSP][REPORT_ONLY][VIOLATION]` logs on real traffic, tune the
   allowlist, then switch to enforcing `Content-Security-Policy` (ideally with a per-request nonce).

## 4. Regressions

**None found.** The "do not regress" core (deterministic artifacts, concurrency leases,
compensation/rollback, pause enforcement, idempotent month-close) was preserved:

- No behavioral edits to `ensureTicketForCall` / `ensureAppointmentForCall`, the lease RPCs, the
  pause path, or month-close.
- Task 6 added a **non-fatal** `ensureAssistantConfig` step to the purchase flow that does not alter
  the existing compensation/rollback chain; the deterministic fallback is untouched.
- Task 5's webhook auth runs **before** body parse and defaults to observe-only, so it cannot drop
  ingestion.
- Characterization tests now guard lease limits, webhook-artifact idempotency, and org-scoping (42
  tests green in CI on every push).

*Caveat (honest):* "no regression" is verified by code review + green tests + green builds, **not**
by a live call — the same operator step (#3 above) that would confirm the forward fixes would also
confirm zero core regression in production.

## 5. Metrics

| Metric | Value |
|---|---|
| Tasks planned / shipped | 8 / 8 (code) |
| Roadmap IDs completed | 9 (+1 In Progress, +1 newly filed) |
| Task commits | 8 (`1deb3d8` → `31fd78a`), each CI-green + Vercel READY |
| Sprint-task diff | 47 files, +3,107 / −679 |
| New source modules | 4 (`vapi/webhookAuth.ts`, `vapi/assistantConfig.ts`, `api/csp-report`, `api/internal/reconcile-vapi-assistants`) |
| Files deleted (fabrication/placeholder cleanup) | 10 |
| Test suite | 0 → **42 tests / 5 files**, all green; first CI pipeline stood up |
| CI pass rate this sprint | 8/8 commits green |
| Prod deploys | 8 READY (all on `denku-mvp.vercel.app` / `www.denku.io`) |
| Regressions | 0 |

*(Metrics are engineering-process metrics. The charter's outcome KPIs — outcome-capture rate,
time-to-first-value, etc. — remain uninstrumented until R-066; this sprint did not change that.)*

## 6. Lessons learned

**What worked**
- **Verify-before-write paid for itself.** Tasks 1–2 (read-only checks) turned two "dangerous
  unknowns" into facts and *surfaced R-077*, which would otherwise have shipped silently. The Task 6
  fix was safe precisely because Task 1 proved no manual config was at risk.
- **The audit's static-read misses were caught by running things.** R-002's "publicly reachable in
  production" was wrong (routes were gitignored — the prod 404 in Task 2 explained it); R-049's
  danger zone was already orphaned. Both corrected in the docs. Confirms Retrospective §1's thesis:
  static analysis is strong on "is this honest?" and weak on "what does prod actually do?"
- **Staging over big-bang.** R-001 (observe-only default) and R-056 (CSP report-only) both shipped
  the mechanism without risk, deferring the risky flip to a verified operator step. This is the
  right shape for anything touching live ingestion or the browser.
- **Small, single-finding commits** kept every push independently CI-green and Vercel-verifiable,
  and made the docs-with-the-change rule easy to honor.
- **Extracting pure cores made the untestable testable.** `webhookAuth` and `assistantConfig` split
  pure assembly logic (unit-tested) from I/O, so the R-050 "personalize must not drop tools"
  regression is now locked by a test without refactoring the monster files.

**What was constrained / to watch**
- **The DoD assumed operator access this cadence didn't have.** Several DoD items are inherently
  external (Vercel env, Vapi dashboard, a live call). Future sprint DoDs should separate
  *engineering-done* from *operationally-verified* so "done" is unambiguous.
- **The local env can't reach prod state.** The `.env.local` Supabase project is dead (DNS
  ENOTFOUND) and `GET /org` is 401 for the API key, so the prod DB and org-level Vapi config were
  never observable from here. This capped end-to-end verification and is why R-077's ingestion
  question stayed partly open. Baselining schema (R-031) + real dashboard access would remove it.
- **Lint debt is real and deferred.** CI runs lint non-blocking (~216 pre-existing errors). Fine for
  now, but it means the test gate is the only blocking signal; the lint backlog (R-074 and general)
  should get a dedicated pass before lint can become a gate.
- **"Do not regress" is only as strong as its verification.** We asserted it via tests+review; a
  live smoke test would make it a fact. Pair the reconcile run with a scripted call check.

## 7. Recommendations for Sprint 2

1. **Open Sprint 2 with the operator handoff (§3), not new code.** A ~30-minute ops session
   (rotate creds, set `VAPI_WEBHOOK_BASE_URL`, run reconcile, place one test call, then flip webhook
   enforce) converts three "In Progress / code-complete" items into fully-closed and validates the
   whole call loop. Highest leverage available.
2. **Then the planned Sprint 2 theme — "Trust & Value Made Visible":** R-004 truth-pass (once
   counsel signs off), then the retention lifeline R-008 (ticket/appointment notifications) and
   R-009 (overage warnings + hard-cap choice), plus R-011 (forgot-password).
3. **Sequence R-066 (analytics) early.** Every product bet after this is unmeasurable without it, and
   this sprint reconfirmed we're flying blind on outcomes.
4. **Keep the systemic-security neighbors queued:** R-057 (admin identity/MFA) and R-060 (RLS
   backstop) — now cheaper to do safely with the test foundation in place.
5. **Consider a small "verification enablement" investment:** real prod dashboard access or a
   staging env the agent can reach, so future sprints can close DoD end-to-end instead of handing
   off. R-031 (schema baseline) is the repo-side half of this.

---

*Living document companion to the roadmap. Sprint 2's review will be `docs/SPRINT_2_REVIEW.md`.*
