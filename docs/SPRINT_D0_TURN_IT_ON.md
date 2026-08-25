# D0 — "Turn It On" (Denku 2.0, Sprint 0)

> **Status: IN PROGRESS (opened 2026-08-25).** **D0-A is done** and **the honesty half of D0-D is
> done** — both were executable without an environment. **D0-B, D0-C and D0-E remain blocked on a
> staging env**, and the 2.0 program (D1–D8) beyond this sprint still awaits owner approval.
> Live status: [CURRENT_SPRINT.md](../CURRENT_SPRINT.md).
> First sprint of the **Denku 2.0 program** ([docs/denku-2.0/20-denku-roadmap.md](denku-2.0/20-denku-roadmap.md)).
> The 1.x sprint series ended at Sprint 14; 2.0 is a program, not a continuation — hence D-numbering.
> Category: **US LAUNCH / FOUNDATION**. Execution vehicle: [docs/LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md)
> (unchanged — D0 does not rewrite it, it *executes* it and adds four items the runbook predates).

## 0. The proposition in one paragraph

**Denku's product problem is not a product problem.** Six sprints (9–14) of authenticated-experience
work sit on an unmerged branch, and the product they built has never handled a production call.
The marketing site carried SOC 2 / HIPAA claims that were not true (fixed in D0-D).

> ### ⚠️ Corrected 2026-08-25 by direct inspection of the live production DB
>
> This plan originally inherited the `FIRST_PAYING_CUSTOMER_AUDIT` finding (2026-07-25) that **10 of
> 11 migrations were unapplied**, and treated a staging environment as the whole critical path. **Both
> are stale.** Queried against `kebqwsdguxxjsijahrox`:
>
> - **The schema is fully current — 44/44 migrations applied.** R-134 closed the gap on 2026-07-30
>   (40/40, zero one-sided rows), and `conversation_handling` + `contact_notes` landed 2026-08-24. So
>   **Phase 3 below is already done**, including `agent_business_context`, the whole Sprint 4.5
>   platform layer, `org_invites` and `employee_manifests`. The hardest, least reversible reason for
>   staging — pushing migrations into a drifted schema over nine partially-applied landmines — **no
>   longer exists.**
> - **`PLATFORM_MODEL_ENABLED` is OFF, proven by data, not inference:** 182 calls, **0**
>   `conversations`, **0** `calls.conversation_id`.
> - **There are no customers to protect.** 39 orgs are test debris: 16 profiles on a disposable-email
>   domain, 14 orgs with no user at all (the two-org-creation-paths landmine), 17 plans of which only
>   one ever placed a call. One workspace holds 181 of the 182 calls — the founder's own testing.
> - **No production call since 2026-02-20 — six months.** Intent classification (R-019) shipped
>   2026-07-23, so *every call in the database predates it*. This fully explains 93 tickets and **0
>   appointments**: the appointment path has never once run in production. It is not a bug; it is an
>   untested path. Everything built in Sprints 4–14 is likewise unvalidated against a real call.
>
> **Consequence for this sprint:** staging is a convenience, not the gate. The remaining prod-touching
> steps all have instant rollbacks (see §2), and there are no customers to disturb. **The gate is no
> longer "is there a staging env?" — it is "has one real call been made end-to-end?"** **D0 turns on what already exists — and writes no
new feature code at all.** Every prior audit (`FIRST_PAYING_CUSTOMER_AUDIT`, `RETROSPECTIVE`, doc 09 of
the 2.0 package) reaches the same conclusion independently: this unblocks more value than all remaining
code combined.

## 1. Objective and definition of done

**Objective:** the product a customer pays for actually functions in production, and is *observed*
functioning.

**Definition of Done** — a single recorded end-to-end run, on **prod**, by a real (test) account:

> signup → onboarding → live inbound call → the AI answers in the configured voice/language and
> references the business context → the call produces an **appointment** (not a generic ticket) with
> `[INTENT_DETECTED] source: llm` → the owner receives the notification email → the conversation and
> contact appear in the **new IA** (Home / Inbox / CRM / AI Team) → the invoice preview shows the
> correct billable minutes.

Plus: `/admin/readiness` **green** on prod (no required `fail`), and the Sprint 9–14 work merged to
`main` and deployed.

**Success is binary and observable.** "Code-complete" is not a D0 outcome — the standing rule for the
whole 2.0 program is that **deployment is part of every sprint's Definition of Done**; the
"inert until migrated" pattern is banned for customer-facing work.

## 2. Staging: downgraded from gate to convenience (corrected 2026-08-25)

`SPRINT_6_PROPOSAL.md` (2026-07-24), Launch Runbook Phase 0 and doc 09 all name a staging environment
as the #1 gate. **That was true when migrations were pending. It is no longer.**

Every remaining prod-touching step has a safe path or an instant rollback:

| Step | Rollback / safe path |
|---|---|
| Secrets & env | Change and redeploy |
| Vapi reconcile | Idempotent — re-runnable |
| Webhook `enforce` | Runbook verifies `[…][OK]` **in observe mode on a real call first** |
| `CSP_MODE=enforce` | Report-only first; review `/api/csp-report` |
| Notification flags | `false` + redeploy |
| **`PLATFORM_UX_ENABLED` / `PLATFORM_MODEL_ENABLED`** | **Unset the env var** — the legacy nav and bodies are still compiled in (Sprint 14 kept them deliberately, with tests asserting they remain) |

What staging would still genuinely buy: a place to rehearse the **paid** signup flow (Stripe
subscription + a real Vapi number purchase) without spending money or adding rows to prod. That is
worth having — but it is not a reason to delay turning the product on, and with zero customers there is
nothing on prod to protect.

> **Revised gate:** not "is there a staging env?" but **"has one real call gone end-to-end?"** — the
> Definition of Done in §1. Six months without a production call is the actual risk; a staging
> environment does not reduce it, and waiting for one has already cost a month.

## 3. Scope — five workstreams

### D0-A · Get the work out of the drawer — ✅ **DONE 2026-08-25** — **NEW, not in the runbook**

The runbook predates Sprints 9–14 and does not mention them. Verified 2026-08-25:

- `feat/sprint-9-one-product` is **6 commits ahead of `main` and has no upstream** — Sprints 9–14 exist
  **only on this machine**. An SSD failure loses the entire Phase-2 IA. **Push first, before anything
  else in this sprint.**
- **No `SPRINT_9..14_REVIEW.md` exists** and `CURRENT_SPRINT.md` still describes **Sprint 8.5** — the
  sprint-closing ritual was skipped for six sprints. The roadmap's "Last updated" is 2026-07-25 and its
  highest ID is R-133, so **R-134 (the 2026-07-30 migration/RLS correction recorded in CLAUDE.md) was
  never filed**.

**Done:** branch **pushed to origin** → [docs/SPRINT_9-14_REVIEW.md](SPRINT_9-14_REVIEW.md) written (one
document for the arc, not six) → `IMPLEMENTATION_ROADMAP.md` reconciled (**R-134 retro-filed**;
**R-135 filed** — `resolveLanguage` gives non-English employees an English voice, found in Sprint 10 and
deliberately not fixed there; **R-133 retired**, never assigned; next free ID **R-136**) →
`CURRENT_SPRINT.md` points at D0. Also corrected in the 2.0 package: doc 20 cited rate limiting as
"R-008" — R-008 is artifact notifications; the finding is **R-030** (fixed in docs 09, 12 and 20).
**Verified: 520 tests pass, exit 0.**

**Merge to `main` happens in D0-E**, after the branch has been walked live on staging — not here.

### D0-B · Execute the Launch Runbook (operator-led, engineer on call)

Straight execution of [docs/LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md) Phases 1–8, unchanged. Summarised
here for sequencing only — **the runbook is the authority, this is not a second copy**:

| Phase | What | Preflight checks it flips |
|---|---|---|
| 1 | Baseline `/admin/readiness` — record every `fail`/`warn` | (baseline) |
| 2 | Secrets & env in Vercel (staging → prod); **rotate** `ADMIN_USER`/`ADMIN_PASS`; `VAPI_WEBHOOK_BASE_URL` = canonical HTTPS prod URL (never localhost — R-077) | Core / Security / Voice / Email / Billing |
| 3 | ~~Apply the pending migrations~~ — ✅ **ALREADY DONE.** 44/44 applied (R-134 on 2026-07-30, plus `conversation_handling` + `contact_notes` on 2026-08-24). Verify only: `supabase migration list` shows zero one-sided rows | `billing_views`, `platform_migrations` (expect pass) |
| 4 | `POST /api/internal/reconcile-vapi-assistants` — every live assistant gets the prod `server.url` + `x-vapi-secret` | (precondition for Phase 5) |
| 5 | Webhook: confirm `[VAPI][WEBHOOK][AUTH][…][OK]` in observe mode on a **real call**, *then* `VAPI_WEBHOOK_AUTH_MODE=enforce` (**R-001**, Critical) → review `/api/csp-report` → `CSP_MODE=enforce` | `webhook_enforce`, `csp_mode` |
| 6 | Billing crons with `CRON_SECRET` → `BILLING_NOTIFICATIONS_ENABLED=true` (R-009) → `ARTIFACT_NOTIFICATIONS_ENABLED=true` (R-008, **only after** enforce) → Supabase password-reset redirect allowlist (R-011) | `billing_notifications` |
| 7 | Live acceptance: voice/language, business context, appointment intent, recording playback, 15-min cap, 30-s silence, notification email, usage-threshold alert | (the DoD run) |
| 8 | `PLATFORM_MODEL_ENABLED` → verify dual-writes; **independently** `PLATFORM_UX_ENABLED` → walk the IA. The two flags have **no dependency on each other** (corrected 2026-08-24); `/admin/readiness` renders this gate live | platform cutover section |

⚠️ **Migration landmines — historical, but do not undo them.** The nine partially-applied migrations
were **completed** on 2026-07-30 (28/28 missing objects now exist, including the three CHECK
constraints, so `workspace_status` / `paused_reason` are now enforced by the database and not only by
application code — `CLAUDE.md` still says otherwise and is stale on that point). `20250126000000`
remains **destructive if re-run**: its `relkind='r'` guard must never be removed. Full history:
[docs/MIGRATION_DEPENDENCY_GRAPH.md](MIGRATION_DEPENDENCY_GRAPH.md).

### D0-C · Observability before acquisition (engineer, ~1 day)

Denku is currently **flying blind on the funnel** — required before a dollar is spent on acquisition,
and required to know whether D1's demo line works.

- **PostHog** (product + marketing funnel) and **Sentry** (errors; neither Denku nor the benchmark has
  client RUM — cheap edge). Both free-tier, `BUY` verdicts in doc 12.
- **CSP:** both are new external origins. Add them to the `next.config.ts` CSP allowlist **before**
  Phase 5 flips `CSP_MODE=enforce`, or the enforce flip will break them.

### D0-D · Close two live exposures (engineer + counsel)

1. **F-012 / R-004 — remove the SOC 2 / HIPAA claims.** ✅ **DONE 2026-08-25.** Severity 1 + 2 of
   `docs/MARKETING_HONESTY_DRAFT.md` applied in full, plus the two unambiguous Severity 3 over-claims;
   10 edits across 9 files, guarded by `web/test/marketing-honesty.test.ts` (6 assertions).
   **527 tests green.** Two instances the draft had missed were found by enumerating the source — a
   pricing **comparison-table row selling "HIPAA compliance ✓" on Scale**, and "SOC 2-ready" in the
   security FAQ. Shipped without waiting for counsel because every change is a *removal or negation*
   of a claim Denku cannot back: leaving it up is the exposure, deleting it cannot create one.
   **Counsel review is still owed** on the replacement wording and the security page as a whole.
   Left deliberately: `OutcomesStrip`'s "Instant call summaries … sent to your inbox" is
   state-dependent and becomes true at Phase 6 — re-check at the go-live checklist.
2. **R-030 — real rate limiting** (Upstash Redis / Vercel KV). `lib/rateLimit.ts` is an in-memory Map,
   a **no-op on Vercel**. Must land before D1 exposes a public demo endpoint to strangers.
   *(Correction: doc 20 of the 2.0 package cites this as "R-008" — R-008 is artifact notifications.
   The rate-limiting finding is **R-030**. Doc 20 should be amended.)*

### D0-E · Merge, deploy, walk (engineer + operator)

Merge `feat/sprint-9-one-product` → `main` (branch first per repo rule; PR, not a direct push), deploy,
and walk the full IA live: Home, Inbox, CRM, AI Team, Analytics, Billing, Settings — including every
legacy redirect. Record the DoD run (§1) as a screen recording; it doubles as D1/D4 marketing material.

## 4. Explicitly OUT of scope

- **Any new feature code.** No SMS (D5), no calendar (D6), no audit engine (D7), no templates (D3), no
  website work (D4). If a gap is found, it is **filed as an `R-###`, not fixed here.**
- The demo line (**D1**) — it depends on D0 being green, and is a sprint of its own.
- The 1,432-line billing page (**R-131** stands), the webhook monolith (R-043), `usageMath` changes
  (golden master — untouchable).
- Backfill (**R-081**) and read cutover (**R-085**) — deliberately later, reviewed steps.
- Instagram DM completion — external, blocked on Meta review; `feat/instagram-app-review` stays parked.

## 5. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Six months with no production call** — every path built in Sprints 4–14 is unvalidated, and the appointment path has *never* run in prod | The product may not do the thing it is sold for | This is what the §1 DoD run exists to answer. Do it before a customer does |
| ~~Staging env never provisioned~~ | ~~Blocks the program~~ | **Downgraded 2026-08-25** — see §2. Migrations are applied, rollbacks are instant, no customers to protect |
| **Sprint 9–14 exist only on one local disk** | Total loss of 6 sprints | ✅ Resolved — pushed in D0-A |
| ~~Partially-applied migrations mishandled~~ | — | ✅ Resolved 2026-07-30; do not undo the `relkind` guard |
| `CSP_MODE=enforce` breaks the new PostHog/Sentry origins | Broken prod telemetry | D0-C lands the allowlist entries *before* Phase 5 |
| `enforce` flip drops live calls (assistants not reconciled) | Dropped customer calls | Phase 4 precedes Phase 5; observe-mode `[…][OK]` on a real call is the gate |
| Flipping `PLATFORM_UX_ENABLED` reveals a regression at scale | Customer-visible | Staging walk first; rollback is unsetting the variable (legacy nav still built) |
| Six sprints of unreviewed work merge at once | Hidden defects | 300+ suite green + the live IA walk + consolidated review doc as the reading pass |

## 6. Testing

No new test code is expected. Gates: the existing **300+ vitest suite green**; `npm run test --
platform-cutover conversation-filters` (functional-parity, before the UX flip); the runbook's live
acceptance script (Phase 7); `/admin/readiness` as the machine-checked go/no-go.

## 7. Effort

| Workstream | Owner | Effort |
|---|---|---|
| D0-A push + review doc + roadmap reconcile | engineer | ~0.5 day |
| D0-B runbook phases 1–8 | **operator** (engineer on call) | ~2 days *once staging exists* |
| D0-C PostHog + Sentry + CSP allowlist | engineer | ~1 day |
| D0-D honesty copy + R-030 rate limiting | engineer (+ counsel review) | ~1 day |
| D0-E merge, deploy, live IA walk | both | ~0.5 day |

**Complexity: S (code) / M (ops). Calendar: ~1 week of work, gated entirely on the staging env.
Impact: existential.**

## 8. Gate out of D0 → D1

D0 is done when the DoD run (§1) is recorded and the preflight is green on prod. **D1 ("Talk to Denku"
— the public demo line) may not start before that**, because the demo line runs a real employee on the
real production pipeline: if D0 is not green, the first thing a stranger experiences is the broken
product.

---

*Standing rules for the 2.0 program: additive migrations only · every feature ships live · truthful
counts · `org_id` on every tenant query · the sprint-closing ritual (review doc → roadmap update →
commit) resumes with this sprint.*
