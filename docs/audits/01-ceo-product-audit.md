# Audit 01 — CEO / Product Audit

- **Date:** 2026-07-06 · **Findings current as of:** 2026-07-08
- **Lens:** CEO/CPO of a $100M ARR SaaS reviewing Denku purely as a product — conversion,
  activation, retention, trust, perceived value, usability, enterprise readiness. Code quality
  deliberately out of scope (see [Audit 00](00-technical-architecture-audit.md) for that).
- **Scope:** every customer-facing surface — marketing site, pricing, signup/verify, onboarding
  wizard, dashboard pages, settings, billing, modals, empty states, demo call.

> Living document (Rule 1). Finding labels C/H/M/L are local; `R-###` IDs in
> `docs/IMPLEMENTATION_ROADMAP.md` are canonical for status.

## Verdict

Denku has a genuinely magical core — talk to an AI on the landing page, buy a plan, and a phone
number starts answering calls with real tickets appearing in a dashboard. But the funnel
**over-promises before the sale and under-delivers after it**, the magic moment is buried behind
the paywall, and the product goes silent exactly when it should be proving its value. A customer
who signs up today hears a generic bot answer their number, receives zero notifications about what
it did, clicks into placeholder pages, and churns by day 10 — after being charged $149.

## Scorecard

| Dimension | Grade | One-line reason |
|---|---|---|
| Conversion | C+ | Great demo asset, but mislabeled CTAs and a fiction-heavy pricing page |
| Activation | C− | Magic moment exists but is behind the paywall and un-orchestrated |
| Retention | D | Agent knows nothing about the business; product never speaks to the customer |
| Trust | D+ | Pricing promises HIPAA/SLA/API that don't exist; silent service shutdowns possible |
| Perceived value | C | "Est. Savings" is the right instinct, wrong execution; value invisible between logins |
| Usability | B− | Clean wizard and dashboard, but dead ends, no pagination, no recordings |
| Enterprise readiness | F | Sold on the Scale tier; not present anywhere in the product |

## CRITICAL findings (trust and revenue breakers)

- **C1 [R-004] — The pricing page sells a product we don't have.** Growth promises "CRM
  integrations," "Advanced routing," "Multilingual routing," "Priority support"; Scale promises
  "HIPAA & audit logs," "SLA," "Account manager," "API access," "Unlimited knowledge base"
  (`web/src/components/marketing/pricing-data.ts`). None exist — the knowledge page is a
  placeholder, there are no API keys, no integrations, no SLA. The HIPAA claim is legal exposure;
  every bullet is a future refund conversation.
- **C2 [R-005] — The Annual toggle is decorative.** "Save 20%" with no annual prices defined and
  monthly-only checkout. A buyer selecting Annual is charged monthly. Ship annual billing or
  delete the toggle.
- **C3 [R-006] — Marketing/billing disagree on included phones.** Pricing page: "1 phone included"
  on all tiers; billing catalog: 1/2/5. Either under-selling or over-billing. Also "400 minutes
  (capacity bonus)" is internal jargon on a public page.
- **C4 [R-007] — Hero CTA is a bait-and-switch.** Primary button says "Book a demo" and links to
  `/signup`; the actual live demo (our best conversion asset) is a secondary button under the
  robot. Primary CTA should be "Talk to Denku now."
- **C5 [R-008] — The product is mute after the sale.** No email/SMS when the AI creates a ticket
  or appointment. "Never miss a call" is invisible unless the customer logs in. Highest-ROI
  retention fix available.
- **C6 [R-009] — We can silently stop answering a customer's phone.** Hard-cap overage pause
  unbinds their number with no warnings at 50/75/90% and no notification at pause. For a business,
  a dead phone line without warning is a catastrophic trust event.
- **C7 [R-010, R-011, R-012] — Broken basics that read as negligence.** Team invite throws an auth
  error (see Audit 00, R-010); no "Forgot password" (R-011); five reachable placeholder pages —
  Knowledge, Tools, Risk & Compliance, Activity, dashboard-level Billing — rendered "Placeholder
  page." (R-012). An enterprise evaluator clicking Risk & Compliance and seeing that is a lost deal.
  **Update 2026-07-08:** the five placeholder pages are **deleted (R-012 Completed, Task 7)**;
  R-010 (invites) and R-011 (forgot-password) remain open.

## HIGH findings (activation & retention engine)

- **H8 [R-013] — The agent knows nothing about the customer's business.** Post-onboarding, its
  entire knowledge is "You are the phone assistant for {company name}." The owner's first
  test-call — the moment that decides retention — meets a bot that can't state hours, services, or
  prices. Fix inside onboarding: three fields (hours, offerings, top caller questions) injected
  into the agent prompt. Days of work; transforms first-call quality.
- **H9 [R-014] — The magic moment is un-orchestrated.** Onboarding ends at "Go live" and drops the
  user onto empty charts. Should end with a full-screen "Call your new number now: (321) 555-0142"
  with the transcript streaming live, closing on "Your first ticket was just created."
- **H10 [R-015] — Nothing sells Denku-for-MY-business before the paywall.** Card required at
  wizard step 4 before the customer ever hears *their* agent. Options in preference order:
  pre-purchase in-browser call with their configured agent; 14-day trial; temporary shared number.
- **H11 [R-016] — No call recordings.** A voice product whose call detail shows text only. Owners
  need to *hear* how the AI treated their customer.
- **H12 [R-017] — No weekly value digest.** "Your AI answered 34 calls, created 6 tickets, booked
  2 appointments, saved ~$410 in staff time" every Monday is the retention heartbeat.
- **H13 [R-018] — Dashboard numbers aren't honest.** "Est. Savings" leads with no methodology;
  the agent table maps 70–90% answer rate to a status labeled "Error" and reverse-engineers total
  calls from the answer rate (fabricated denominators); a widget says "Active Agents" violating
  our own "AI, not agent" rule.
- **H14 [R-019, R-020] — The booking promise is undelivered.** Nearly every call becomes a support
  ticket (intent stub — Audit 00, R-019); appointments are bare rows with no calendar connection
  or caller confirmation. Real intent handling + Google Calendar connect is the difference between
  "novelty receptionist" and "replaces a hire."

## MEDIUM findings (usability & completeness)

- **M15 [R-023]** Calls cap at 200 rows, no pagination/search/CSV export; tickets need saved
  filters and bulk actions.
- **M16 [R-024]** Billing self-service depth: invoice history in-app, proration preview on plan
  change, visible cancel path, usage meter with the overage threshold marked.
- **M17 [R-025]** Activation step shows a spinner and raw failure strings — needs staged progress
  and human recovery copy. Plan step lacks a "what happens next" preview.
- **M18 [R-026]** Empty states should teach ("No calls yet — call your Denku number: …"), not just
  state emptiness; the components exist but aren't deployed uniformly.
- **M19 [R-027]** Horizon template ghosts (repurposed revenue charts, "Approved/Disabled"
  statuses) make the dashboard read bought-not-built; one rename/re-skin pass.
- **M20 [R-028]** Mobile audit of the dashboard (owners live on phones).
- **M21 [R-029]** Demo call ends silently at 5 minutes — end with a spoken close and a "Want this
  on your own number?" CTA.

## LOW findings (polish & future bets)

- **L22 [R-038]** Voice picker with audio previews in onboarding (today "jennifer" is silently
  assigned).
- **L23 [R-039]** Real social proof — current "3× more leads booked / <1s response" stats are
  unsubstantiated; one named case study beats ten invented metrics.
- **L24 [R-040]** Dashboard dark mode: finish or strip the half-wired tokens.
- **L25 [R-041]** International numbers / non-English agents — only after the "20+ languages"
  claim is honored or removed (C1).
- **L26 [R-042]** Public changelog/roadmap page — converts the placeholder-page liability into a
  "watch us ship" asset.

## 90-day plan (as proposed)

1. **Days 1–14 — stop losing trust:** truth-align pricing (R-004/005/006), fix hero CTA (R-007),
   ship ticket/appointment + overage notifications (R-008/009), fix invites (R-010), add password
   reset (R-011), remove placeholder pages (R-012).
2. **Weeks 3–8 — win activation:** business-context onboarding (R-013), orchestrated first call
   (R-014), recordings (R-016), weekly digest (R-017); then the landing redesign — noting our
   conversion problem is honesty and sequencing, not aesthetics.
3. **Weeks 9–13 — earn expansion:** booking delivery (R-019/020), pre-paywall taste (R-015),
   dashboard truth pass (R-018), list ergonomics (R-023); only then start building the enterprise
   tier we already charge $899 for.

## Executive Summary

The engine is real, but we market a product two years ahead of the one we ship, and ship a product
that hides its own value. Two gaps to close: **honesty at the top of the funnel** (pricing claims,
CTAs, annual toggle) and **visible value after activation** (business-aware agent, orchestrated
first call, notifications, digests). Close them and this is a company; leave them open and every
paid signup is a future refund. Enterprise ambitions (Scale tier) must not be sold again until at
least recordings, audit-log coverage, and a real security story exist.

## Action Items

| # | Action | Roadmap ID | Priority |
|---|---|---|---|
| 1 | Rewrite pricing bullets to shipped reality; remove HIPAA/SLA/API claims | R-004 | Critical |
| 2 | Ship annual billing or remove the toggle | R-005 | Critical |
| 3 | Reconcile included-phone counts between marketing and billing | R-006 | Critical |
| 4 | Make the live demo the hero CTA; fix "Book a demo" mislabel | R-007 | Critical |
| 5 | Notification emails: new ticket/appointment | R-008 | Critical |
| 6 | Overage warnings at 50/75/90% + explicit pause-vs-bill choice | R-009 | Critical |
| 7 | Fix invites, add forgot-password, remove placeholder pages | R-010/011/012 | Critical |
| 8 | Business-context questions in onboarding feeding the agent prompt | R-013 | High |
| 9 | Orchestrated "call your number now" go-live moment | R-014 | High |
| 10 | Pre-paywall product taste (configured-agent web call or trial) | R-015 | High |
| 11 | Call recording playback on call detail | R-016 | High |
| 12 | Weekly value digest email | R-017 | High |
| 13 | Dashboard data-honesty pass | R-018 | High |
| 14 | Intent detection + calendar integration (booking promise) | R-019/020 | High |
