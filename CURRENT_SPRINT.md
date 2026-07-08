# CURRENT SPRINT — Security & Trust Foundation

> The active implementation sprint. Open this every morning to know what to build next. Finding
> detail lives in `docs/IMPLEMENTATION_ROADMAP.md`; safe-sequencing and verify-first rules in
> `docs/EXECUTION_PLAN.md` + `docs/RETROSPECTIVE.md`. Update task status here as you ship; mark the
> roadmap entry `Completed` (date + how) in the same change.

**Sprint 1 · Started 2026-07-07 · Target 2 weeks**

## Sprint Goal

Close the critical security holes and remove every in-product falsehood, so Denku is safe to run
and honest to look at. When this sprint ends, no forged request can write to a tenant, no screen
shows fabricated data, and the core call → artifact loop provably works.

## Why This Sprint Exists

Denku's engine is sound but its perimeter and its honesty are not: the call-ingestion webhook
accepts unauthenticated requests, debug endpoints leak admin info, the AI's tools are missing or
silently stripped on most lines (so the product's core promise quietly fails), and several screens
display fake data. These are the highest-consequence, mostly code-only fixes — and they directly
serve the vision's non-negotiables: **truth, tenant isolation, and the never-dead-end guarantee.**
Nothing else should be built until these hold.

## Success Criteria

- The Vapi webhook rejects any request lacking a valid secret; forged events cannot create data.
- No public endpoint exposes admin credentials or user PII.
- Every phone line's AI can actually create tickets and appointments (verified on a live call),
  and personalizing an agent no longer strips its tools.
- No screen in the product shows hardcoded, fake, or fabricated data or status.
- A test suite exists and proves webhook idempotency, lease limits, and org-scoping.

## Deliverables

1. Authenticated Vapi webhook (secret/HMAC), staged so live call ingestion never drops. ✅ **Code
   shipped staged (Task 5, R-001)** — default observe-only; enforcement is an ops flip.
2. Debug/PII exposure removed; admin credentials rotated.
3. Shared assistant-config helper guaranteeing tool attachment on all creation + sync paths.
4. Fabricated screens removed (fake API keys, fake integration statuses, no-op danger zone,
   placeholder pages).
5. Security headers (CSP report-only → enforce plan).
6. Test harness + CI with the three foundational suites. ✅ **Done (Task 3, R-037).**

## Prioritized Tasks

**Do in order. Verify-first tasks are prerequisites, not optional (Retrospective §7).**

1. **[VERIFY] R-050** — ✅ **Done 2026-07-07** (read-only API read of live state). No manual tool
   config at risk — all tool attachments came from `runActivation`'s merge; both purchase-path
   lines are live with NO tools (R-050(a) confirmed in prod); the settings-sync strip (b) has not
   fired yet. **Task 6 unblocked.** Verification filed **R-077** (live assistants'
   `serverUrl` = `http://localhost:3000/api/tools`).
2. **[VERIFY] R-001** — ✅ **Done 2026-07-07** (benign prod probe). Confirmed unauthenticated &
   reachable: `POST /api/webhooks/vapi` returns `200 ignored:no_call_id` with no secret and with a
   bogus secret alike — no 401, no edge shield. **Task 5 unblocked.** Fix input: an unused
   `VAPI_WEBHOOK_SECRET` already exists in env (never read by code). **R-077 sub-check:** Vapi
   account has **zero call history** (test/staging account) → R-077 is latent, not actively
   dropping traffic; prod DB not inspectable from here (local Supabase project dead). Per user
   decision, R-077 is fixed via Task 6, not emergency-remediated.
3. **R-037** — ✅ **Done 2026-07-07.** vitest + `.github/workflows/ci.yml` (test blocking, lint
   non-blocking, Vercel = build gate); 3 seed suites under `web/test/` (19 tests green):
   leases (acquire-at-limit/release), webhook artifact idempotency (check-then-insert path),
   org-scoping (read/write/update). *Foundation for tasks 5–6.* See roadmap R-037 for honest scope
   (route-level webhook integration test deferred to R-043/R-074).
4. **R-002 + R-003** — ✅ **Done 2026-07-08.** Deleted `web/src/app/api/debug/` (both routes) +
   removed the `.gitignore` rule that hid them (they were gitignored/local-only — never deployed,
   which explains the Task 2 prod-404); removed all `x-auth-*` PII response headers from
   `middleware.ts` (behavior-preserving). **⚠ Still external/pending:** rotate
   `ADMIN_USER`/`ADMIN_PASS` in Vercel (Category C — not code).
5. **R-001** — ✅ **Code shipped 2026-07-08 (staged).** `lib/vapi/webhookAuth.ts` verifies the
   `x-vapi-secret` header against `VAPI_WEBHOOK_SECRET`, wired into the webhook before body parse.
   Confirmed the demo assistant already sends that header (reused, no new secret). Deployed in
   observe-only `log` mode by default (canary logs, never rejects) so ingestion can't drop.
   **⚠ Enforcement pending (ops/Category C):** set `VAPI_WEBHOOK_SECRET` in Vercel, verify
   `[VAPI][WEBHOOK][AUTH][OK]` on a real call, then set `VAPI_WEBHOOK_AUTH_MODE=enforce`. Until
   then the webhook still processes forged requests — R-001 stays **In Progress**. **Task 6 must
   also set the `x-vapi-secret` header when it repoints customer `serverUrl`s (R-077).**
6. **R-050 + R-077** — Shared assistant-config helper: always GET→merge→PATCH with `toolIds`
   present, on both creation paths and the settings sync; set the canonical webhook `serverUrl`
   from explicit env (R-077); reconcile existing assistants (tools + serverUrl in one pass).
7. **R-046 + R-049 + R-012** — Remove fake API-keys screen, fabricated integration statuses,
   no-op "Disable workspace" control, and unreachable placeholder pages.
8. **R-056** — Add security headers; ship CSP report-only.

## Roadmap IDs Covered

R-001, R-002, R-003, R-012, R-037, R-046, R-049, R-050, R-056, R-077. *(R-057 admin identity and
R-060 RLS backstop are acknowledged neighbors but out of scope this sprint — see Deferred.)*

## Dependencies

- **External confirmations before shipping (Category C):** live Vapi dashboard access (tasks 1, 6),
  prod reachability check (task 2), Vercel access to rotate admin credentials (task 4).
- **Sequencing:** task 3 (tests) precedes 5 and 6; tasks 1–2 (verify) precede 6 and 5 respectively.
- **CSP inventory:** task 8 needs the allowed-origin list (Spline, Vapi, Supabase, Stripe, fonts).
- **No product/legal decision blocks this sprint** — the R-004 truth-pass (needs counsel) is
  intentionally *not* here; it runs as a parallel decision track for next sprint.

## Risks

- **R-050 config wipe:** retired 2026-07-07 — task 1 verification found no manually-configured
  tools on any bound assistant; task 6 is safe to implement.
- **R-077 ingestion:** partially resolved 2026-07-07 — Vapi has zero call history (test/staging
  account), so nothing is being dropped today; the localhost `serverUrl` is a latent defect fixed
  by task 6. Still unproven end-to-end (prod DB unreachable from local env; org-level Server URL
  unknown) — the call→artifact loop must be verified with a live test call during task 6.
- **Webhook auth drops ingestion:** a bad rollout silently loses live calls. → Stage with logging; verify on a test call before enforcing.
- **Test coverage on a 3,141-line untyped webhook is hard.** → Characterization tests around behavior only; do not refactor the file this sprint (that's gated on R-074/R-043 later).
- **CSP over-blocks** third-party origins (Spline/Vapi). → Report-only first; enforce after clean reports.

## Validation Checklist

- [~] Forged webhook POST (no/invalid secret) is rejected; a valid one still processes. *(Auth
  mechanism shipped staged, Task 5 — but rejection only happens once `VAPI_WEBHOOK_AUTH_MODE=enforce`
  is set after a verified test call. Not yet enforcing in prod.)*
- [ ] A real test call produces a ticket **and** (for booking intent) an appointment — verified end to end.
- [ ] Personalizing an agent in Settings does **not** remove its tools (re-check live `toolIds`).
- [x] `/api/debug/*` removed; responses carry no `x-auth-*` headers *(Task 4, R-002/R-003)*. ⚠ Admin
  creds rotation still pending (external/Vercel).
- [ ] No screen shows placeholder/fake/hardcoded data (keys, statuses, danger zone, stub pages).
- [x] CI runs on every push; the three foundational suites pass. *(Done — Task 3, R-037.)*
- [ ] Security headers present; CSP in report-only with a clean report.
- [ ] No regression to the "do not regress" core (deterministic artifacts, leases, compensation, pause).

## Definition of Done

Every Prioritized Task shipped and its roadmap entry marked `Completed` (date + how); the
Validation Checklist fully green (incl. the live test-call verification); CI green; and any
assumption confirmed during verification graduated out of `RETROSPECTIVE.md` §3/§7. A change is not
done until docs are synchronized.

## Deferred Work

Explicitly **not** this sprint (tracked in the roadmap):

- **R-004 truth-pass** on marketing pages — gated on legal/product review; runs as a parallel
  decision track, ships next sprint.
- **R-057** (per-operator admin identity + MFA), **R-060** (RLS backstop) — high-value systemic
  security, but larger; sequence right after this sprint with the test foundation now in place.
- **R-008/R-009** (notifications + overage warnings) — the retention/bill-shock lifeline; top of
  the *next* sprint.
- Monster-file refactors (R-043), typing (R-074), analytics instrumentation (R-066), billing
  verifiability (R-031→R-075→R-076) — later sprints.

## Next Sprint Preview

**Sprint 2 · Trust & Value Made Visible.** Ship the R-004 truth-pass copy (once counsel signs off),
then the retention lifeline: ticket/appointment notifications (R-008) and overage warnings +
hard-cap choice (R-009), plus the forgot-password flow (R-011). Theme: after this sprint makes the
product *safe and honest*, the next makes its *value visible* — the two things the audits found
most damaging to retention and trust.
