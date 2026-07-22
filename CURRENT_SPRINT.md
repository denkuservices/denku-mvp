# CURRENT SPRINT — Trust & Value Made Visible

> The active implementation sprint. Open this every morning to know what to build next. Finding
> detail lives in `docs/IMPLEMENTATION_ROADMAP.md`; safe-sequencing and verify-first rules in
> `docs/EXECUTION_PLAN.md` + `docs/RETROSPECTIVE.md`. Update task status here as you ship; mark the
> roadmap entry `Completed` (date + how) in the same change. Sprint lifecycle: `PROJECT_CHARTER.md`
> → Sprint Lifecycle.

**Sprint 2 · Prepared 2026-07-08 · Status: 🟡 `PROPOSED — awaiting approval`**

> ℹ️ **Sprint 1.5 (Instagram Foundation) CLOSED 2026-07-22** (shipped 2026-07-08) — an inserted
> infrastructure sprint (Instagram OAuth + per-tenant encrypted creds + receive-only webhook +
> dashboard + Meta compliance callbacks + `/subscribed_apps`), **code-complete, architecturally
> sound, CI-green (58 tests)**. Review + Closure addendum: [`docs/SPRINT_1.5_REVIEW.md`](docs/SPRINT_1.5_REVIEW.md);
> mechanics: `skills/instagram-integration.md`; setup: `docs/INSTAGRAM_SETUP.md`; App Review dossier:
> [`docs/META_APP_REVIEW_PACKAGE.md`](docs/META_APP_REVIEW_PACKAGE.md).
>
> **Operationally verified (2026-07-22):** the receive pipeline was confirmed **in production** via
> Meta's signed **Test** webhook — delivery → `X-Hub-Signature-256` verify → persist → 200, observed
> in the prod DB + Vercel logs. **Authoritative Meta rule (corrects an earlier note):** while the app
> is **unpublished (Dev Mode)** Meta delivers **only dashboard Test events** — NO real production data,
> incl. from Testers, until the app is **published (Live)**. So real Instagram DM delivery is gated on
> **Business Verification + App Review (Advanced Access) + Live Mode** — an **external Meta platform
> dependency, not a Denku defect**, and the receive-only foundation is also not a strong App-Review
> submission for the messaging permission yet (no messaging UI). Follow-ups filed: **R-078** (remove
> TEMP subscribe button), **R-079** (store granted scopes).
> It did **not** change the Voice roadmap or introduce a generic multi-channel abstraction.
> **Sprint 2 below is unchanged and remains the proposed next sprint.**

> ⚠️ **This sprint is PREPARED, not started.** It was drafted automatically from the roadmap after
> Sprint 1 closed (per the charter's Sprint Lifecycle ritual). **No implementation begins until the
> owner explicitly approves** — and may adjust scope first. Sprint 1 (Security & Trust Foundation)
> is closed code-complete; its review is **[`docs/SPRINT_1_REVIEW.md`](docs/SPRINT_1_REVIEW.md)**.

## Sprint Goal

Sprint 1 made Denku **safe and honest**. Sprint 2 makes its **value visible and its trust surfaces
truthful**: the business sees what the AI did for it between logins, is never surprised by cost or a
service cut, can recover access, and reads marketing that matches the product. When this sprint
ends, a completed call reaches the owner promptly, overage never shocks, a locked-out customer can
get back in, and no marketing page oversells.

## Prerequisite — Task 0: finalize Sprint 1 (operator handoff)

**Do first.** These close Sprint 1's DoD and de-risk Task 2 (don't email on a forgeable webhook).
All are operator/env actions, not code — see `docs/SPRINT_1_REVIEW.md` §3:

1. Rotate `ADMIN_USER`/`ADMIN_PASS` in Vercel (R-002 follow-up).
2. Set `VAPI_WEBHOOK_BASE_URL`; run `POST /api/internal/reconcile-vapi-assistants` (R-050/R-077).
3. Place a **live test call** → confirm ticket (+ appointment for booking intent) end-to-end.
4. Confirm `[VAPI][WEBHOOK][AUTH][OK]` → set `VAPI_WEBHOOK_AUTH_MODE=enforce` (closes R-001).
5. Watch CSP reports → flip CSP to enforcing (R-056 follow-up).

## Prioritized Tasks (proposed — confirm/trim on approval)

**Do in order. Verify-first + stage-then-enforce discipline carries over from Sprint 1.**

1. **R-011 — Forgot-password flow.** Code-only win; the login link currently dead-loops
   (`/login?forgot=1`). Build `/forgot-password` → Supabase `resetPasswordForEmail` → reset form via
   `/auth/callback`; repoint the dead link. Template already exists in `lib/email/templates.ts`.
2. **R-008 — Ticket/appointment notifications** (the #1 retention lifeline — makes value visible).
   Hook Resend into the deterministic artifact path in the Vapi webhook, idempotent (guard like the
   welcome email); per-event email to the owner with summary + deep link. *Dep: Resend domain
   (`denku.io`) verified; Task 0 webhook `enforce` first (don't email on forgeable events).*
3. **R-009 — Overage warnings + hard-cap pause/bill choice** (bill-shock prevention). Emails at
   50/75/90% of included minutes and before threshold charge; explicit customer setting "at hard
   cap: pause vs keep billing"; loud banner on pause. *Dep: R-008 email infra + a product decision
   on the hard-cap policy.*
4. **R-004 — Marketing truth-pass** (pricing/docs/support/security) — parallel **decision track**.
   Rewrite to shipped capabilities only; move aspirations to a public roadmap. *Dep: **legal
   counsel** sign-off on which compliance/feature claims are honest — implementation is trivial copy
   once decided.*
5. **R-066 — Conversion analytics** (recommended to start early so value/funnel become measurable).
   Add a client+server analytics layer + funnel event schema. *Dep: provider choice (privacy posture
   matters — transcripts are PII).*

## Roadmap IDs Covered (proposed)

R-011, R-008, R-009, R-004, R-066. *(Plus Task 0 finalizes Sprint 1's R-001/R-002/R-050/R-056/R-077
operator items.)*

## Decisions needed before/within this sprint (Category B)

- **R-004:** which compliance/feature claims are honest? — **Founder + legal counsel**.
- **R-009:** hard-cap policy — pause vs keep-billing — **Product**.
- **R-066:** analytics provider (privacy-first; transcripts are PII) — **Growth/Eng**.

## External dependencies (Category C)

- **Resend** sending domain (`denku.io`) verified — blocks R-008/R-009 emails (note the
  `denku.io` vs `denku.ai` inconsistency).
- **Analytics provider** integrated — blocks R-066.
- **Task 0** operator/env actions (Vercel + Vapi dashboard).

## Risks

- **Emailing on a forgeable webhook** (R-008 before R-001 enforce) would let an attacker spam a
  customer's inbox. → Task 0 webhook `enforce` precedes R-008 shipping.
- **R-004 without counsel** = shipping new copy that's still wrong, or legal exposure. → Decision
  track; don't ship claims until signed off.
- **Scope:** 5 substantial items + a decision track is ambitious. → On approval, likely trim to a
  core (Task 0 + R-011 + R-008 + R-009) and run R-004/R-066 as tracks or defer.
- **R-066 privacy:** transcripts are PII — pick a provider/config that never ingests them.

## Definition of Done (carried forward, with the Sprint-1 honesty split)

Every task shipped + roadmap `Completed` (date + how); CI green; docs synchronized; assumptions
graduated from `RETROSPECTIVE.md`. **Separate engineering-done from operationally-verified** — e.g.
R-008 is done only when a real artifact is observed to send an email; R-011 when a reset works end
to end. Task 0's operator items are tracked explicitly, not silently assumed.

## Next Sprint Preview (Sprint 3 — tentative)

Systemic security + verifiability now the foundation exists: **R-057** (per-operator admin identity
+ MFA), **R-060** (RLS backstop), and the billing-verifiability chain **R-031 → R-075 → R-076**
(schema in repo → prove the math → reconcile COGS vs revenue). Plus opportunistic code health
(R-034 dead-code delete, R-033 client converge) and the go-live magic moment (R-014).
