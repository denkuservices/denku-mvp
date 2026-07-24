# Sprint 6 — Proposal: Launch Readiness (first paying customers)

> **Status: PROPOSED — awaiting approval. No implementation code until approved.**
> A fresh product-level prioritization for Denku's **first real paying customers**. The lens is not
> "close roadmap items" — it's "what makes the product work, stay secure, and earn trust when real
> money and real customer calls are on the line." References: whole repo, `docs/IMPLEMENTATION_ROADMAP.md`,
> `docs/audits/*`, all `SPRINT_*_REVIEW.md`, `docs/PROJECT_VISION.md` / `PROJECT_CHARTER.md`.

## 1. The uncomfortable finding (why this is the sprint)

**Denku has ~5 sprints of code-complete work that has never been turned on or verified — and there is
no environment in which to verify it.** Every recent sprint ends "code-complete; operator activation
pending":

- **Security is not actually on.** The Vapi webhook (the 3,100-line heart of the product) still runs in
  **observe-only** auth mode — **R-001 (Critical, In Progress)**: it *processes forged requests* until an
  operator sets the secret and flips `VAPI_WEBHOOK_AUTH_MODE=enforce`. CSP is report-only. RLS on
  anon-read tables (R-060 remainder) and per-operator admin identity (R-057) are written but unapplied.
- **The money path is staged, not proven.** Billing/RLS migrations (Sprint 3), usage alerts + pause
  (R-009), artifact notifications (R-008) are all built and gated OFF pending activation. First paying
  customers = real invoices, overage, and pausing — none verified end-to-end.
- **The core promise has never been verified on a live call.** Voice/language, business context,
  **real appointment booking** (R-019), recording (R-016) are code-complete (Sprint 4) with an unrun
  **live acceptance checklist**.
- **The whole platform (Sprints 4.5/5/5.5)** — shared model + AI-Employees IA + dashboard/contacts/
  analytics — sits behind `PLATFORM_MODEL_ENABLED` / `PLATFORM_UX_ENABLED`, **dark and unverified**.
- **Trust surfaces a paying customer hits on day one are broken:** member invites (**R-010** — a paying
  business *will* add teammates), the dashboard support path dead-ends (**R-047**), and marketing
  **over-claims** what the product does (**R-004**, also legal exposure).
- **The systemic blocker behind all of it: there is no staging/preview environment.** The roadmap itself
  says prod-writing changes "need a staging/preview env to verify — don't ship them blind." Read-only
  prod means nothing above can be safely activated today.

**Conclusion:** for first paying customers, shipping *more* dark-launched features (the previously-
sketched Sprint-6 platform-UX depth: settings reorg / onboarding reframe / UX polish) is **negative
leverage** — it's polish on a product not yet proven to work or be secure. The highest-leverage work is
to **make what we've built real, secure, and trustworthy** — and to build the tooling that makes going
live *safe* rather than a 5-sprint operator scavenger hunt.

## 2. What customer problem Sprint 6 solves

A first paying customer needs, in order: **(1) it works** — their phone is answered and calls become
tickets/appointments they can see; **(2) it's secure** — their data and their callers' data aren't
exposed; **(3) it's trustworthy with money** — correct billing, honest limits, no silent overage;
**(4) it feels finished** — they can add a teammate, get support, and everything the site promised is
real. None of these is a new feature; all are *turn it on and prove it*, plus close the trust gaps.
Sprint 6 delivers the engineering that makes (1)–(4) true and verifiable.

## 3. Proposed Sprint 6 scope — "Launch Readiness"

Split honestly into **engineering deliverables** (this sprint builds them) and the **operator go-live**
(the sprint makes it safe + push-button; the operator, with a staging env, executes).

### Engineering deliverables (build in Sprint 6)

- **L1 — Production Readiness Preflight (NEW, R-098).** One programmatic "are we ready for a paying
  customer?" check surfaced to operators (admin page + `/api/internal/readiness`): verifies required
  env vars present, **webhook auth mode = enforce**, `VAPI_WEBHOOK_BASE_URL` is not localhost, sender
  domains verified, flag states (`PLATFORM_MODEL/UX_ENABLED`, notification flags), and a live probe that
  the platform migrations are applied. Converts 5 scattered runbooks into one live go/no-go signal. **The
  single highest-leverage launch item.**
- **L2 — Consolidated Launch Runbook.** One ordered activation guide merging every pending step from
  Sprints 1–5.5 (migrations → env → reconcile assistants → enforce → flag flips → live test call), with
  dependencies, verification, and rollback. Replaces the scattered `SPRINT_*_ACTIVATION`/`MIGRATION` docs
  with a single source of truth.
- **L3 — Security enforce-readiness (R-001 Critical).** Verify every Vapi-POST path sends
  `x-vapi-secret`; make `enforce` a safe, documented one-flip change; same preflight for CSP-enforce.
  Close the Critical exposure at the code level so the flip is trivial and safe.
- **L4 — Trust-surface fixes (pure code, customer-facing):** **R-010** member invites (repair the broken
  flow — customer browser must not call `/api/admin/*`), **R-047** dashboard support path (a real,
  reachable support affordance). These break trust on day one and are fixable without operator/staging.
- **L5 — Marketing honesty pass (R-004).** Draft truthful copy (Voice = real; Instagram = receive-only;
  do **not** claim WhatsApp/Email; no unverifiable metrics). Flag for legal/counsel review. Prevents
  selling what we can't back — the fastest way to lose a first customer's trust (and invite liability).

### Operator go-live (Sprint 6 makes safe; operator executes)

**Prerequisite (P0, the critical unblock): stand up a staging/preview environment.** Everything below is
verified there first. Then, guided by L1/L2: apply all migrations → set env (`OPENAI_API_KEY`,
`VAPI_WEBHOOK_BASE_URL`, secrets) → reconcile Vapi assistants → **flip webhook to enforce + CSP enforce**
→ run the **Sprint-4 live test-call acceptance** → enable notifications/billing flags → flip
`PLATFORM_MODEL_ENABLED` then `PLATFORM_UX_ENABLED` and walk the IA. Preflight (L1) is green before a
paying customer is onboarded.

## 4. Why this beats the remaining roadmap items

| Remaining item | Why it waits |
|---|---|
| Platform UX depth (R-094 settings, R-095 onboarding, R-096 UX, R-097 nav) | Polish on an unverified product. A paying customer doesn't need reorganized settings; they need the phone answered. **Sprint 7+.** |
| Read cutover (R-085), backfill (R-081) | Only meaningful once dual-writes are trusted **in prod** — which requires activation first. **After launch.** |
| New channels — WhatsApp/Email | Voice must be proven with paying customers before adding channels. **Later.** |
| Voice depth — calendar sync (R-020), hours (R-054), go-live (R-014) | Retention/depth features; strong Sprint-7 candidates once acquisition of first customers works. Note **R-020 (calendar)** is the strongest — the last mile of "books appointments for real." |
| Product analytics instrumentation (R-066) | Measuring first customers matters, but the Sprint-5.5 presentation analytics covers the immediate need; event instrumentation is Sprint 7. |
| a11y/UI-cohesion remainder (R-071/R-064/R-027), schema baseline (R-031) | Opportunistic; not launch-blocking. |

The through-line: **every remaining item assumes a working, verified, secure base.** Sprint 6 builds
that base's readiness. It is the prerequisite to all of them mattering.

## 5. What intentionally waits for Sprint 7+

- **Sprint 7 (post-first-customer product depth):** R-020 calendar sync (finish "books appointments for
  real"), R-066 analytics instrumentation (measure activation/retention), then platform UX depth
  (R-094–097) once the flags are live and verified.
- **Sprint 8+:** read cutover (R-085) + backfill (R-081); then new channels (WhatsApp/Email) on the
  proven model; voice depth (hours R-054, go-live R-014).

## 6. The honest constraint (and why the sprint is still worth it)

Much of go-live is **operator work I cannot perform** (provision staging, apply migrations, set secrets,
flip flags, place a live call). Sprint 6's engineering — the **preflight system, consolidated runbook,
enforce-readiness, trust fixes, honesty copy** — is exactly the work that turns a risky, sprawling
activation into a **safe, verifiable, push-button launch**, and closes the customer-facing gaps that are
pure code. It is the highest-leverage *engineering* possible ahead of first paying customers.

## 7. Risks

- **No staging env** remains the gating dependency — L1/L2 make activation safe but cannot replace a
  place to verify. If staging isn't provisioned, launch stays blocked (surface this to the owner now).
- **Scope temptation** — resist folding platform UX depth back in; that dilutes the launch focus.
- **Marketing/legal** — R-004 copy needs counsel; draft honestly, don't ship claims without review.
- **Enforce flips are real** — webhook `enforce` / CSP-enforce must be verified on staging first (L1
  gates them) so we don't drop live ingestion.

## 8. Open questions for the owner

1. **Is a staging/preview environment going to be provisioned?** It is the critical prerequisite — the
   answer shapes whether Sprint 6 can end in an actual launch or "launch-ready, pending env."
2. **Sprint 6 = Launch Readiness (recommended)** or proceed with the previously-proposed platform-UX
   depth (R-094–097)?
3. **Trust fixes scope:** all of R-010 + R-047 + R-004 this sprint, or a subset?
4. **Marketing copy (R-004):** draft honest copy now for counsel review, or defer until a launch date is set?
