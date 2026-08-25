# 20 — Denku 2.0 Implementation Roadmap

> New numbering: **D0–D8** (the 1.x sprint series ended at Sprint 14; 2.0 is a program, not a
> continuation). Rules carried from the old roadmap: nothing new is built while shipped work is
> dark; every sprint updates IMPLEMENTATION_ROADMAP.md; "is it live?" outweighs "is it built?".
> Category tags: FOUNDATION · WEBSITE · PRODUCT · AI AGENTS · AI AUDIT · BILLING · US LAUNCH.
> (AI STUDIO and AUTOMATION are deliberately absent from the committed program — gated options,
> see doc 19 rows 18–20.)

---

## D0 — "Turn It On" · US LAUNCH / FOUNDATION · ~1 week, mostly operator
**Objective:** the product customers pay for actually functions in production.
**Business reason:** every prior audit agrees this unblocks more value than all remaining code.
- Work: provision staging → apply pending migrations → env + assistant reconcile → webhook
  `enforce` (R-001) + `CSP_MODE` → `BILLING_NOTIFICATIONS_ENABLED` + crons → live test-call
  acceptance → `/admin/readiness` green → flip `PLATFORM_MODEL_ENABLED`, verify dual-writes →
  flip `PLATFORM_UX_ENABLED` → merge the Sprint 9–14 branch → walk the full IA live.
- Also: PostHog + Sentry install; Upstash rate limiting on public endpoints (R-030); remove
  SOC2/HIPAA claims (F-012, with counsel — legal exposure, not polish).
- Dependencies: operator access (Vercel/Supabase/Vapi/Stripe). **Must NOT:** write any new
  feature code. Acceptance: a real signup → onboarding → live call → artifact → invoice preview,
  performed end-to-end and recorded. Testing: existing 300+ suite green + the runbook's live
  acceptance script. Complexity: S (code) / M (ops). Impact: existential.

## D1 — "Talk to Denku" · AI AGENTS / US LAUNCH · ~1 week
**Objective:** the product is experienceable before signup (wow W1) and Denku dogfoods itself.
- Backend: a dedicated demo org + employee on production; demo-line number; guardrailed persona;
  demo calls → leads in Denku's own CRM. Web-call button reusing the existing web test call.
- Frontend: minimal `/demo` page (pre-redesign) with number + web call + live transcript view.
- **Must NOT:** wait for the new site. Acceptance: a stranger can call/web-call and book a demo
  appointment that appears in Denku's own Inbox. Testing: abuse limits (rate caps, max duration,
  spend cap on the demo org). Impact: the acquisition centerpiece exists.

## D2 — Offer & Billing Honesty · BILLING · 1–2 weeks
**Objective:** the pricing ladder of doc 04 exists in product truth.
- Plans re-expressed (Solo/Team/Scale as employees×channels×minutes) in catalog copy (no price
  change); **minute-pack SKUs** with one-click Stripe Checkout; "We'll set it up" SKU; annual
  toggle; explainable-invoice block (F-007 worked example); usage alerts verified live (F-003).
- DB: pack ledger table (additive); catalog seeds. **Must NOT:** touch the 1,432-line billing
  page beyond the explainer block (R-131 stands); no metric changes to `usageMath` (golden
  master). Acceptance: buy a pack, see minutes credited, invoice explains itself. Testing:
  pack + overage interaction property tests. Impact: ARPU expansion + trust.

## D3 — Employee Templates & Hiring Onboarding · PRODUCT / AI AGENTS · 2–3 weeks
**Objective:** "hire in minutes" is real: 5 named templates, employee naming, test-call in-flow.
- Templates as manifest presets (Receptionist, Booking, Missed-Call Rescuer†, After-Hours,
  Support) — †SMS parts activate in D5; onboarding: template pick → name your employee → teach
  business (context) → **test call** → connect number → live; F-005 loading/error states;
  F-006 terminology sweep ("AI employee" everywhere).
- **Must NOT:** create per-template DB schemas (presets are manifest data, not migrations).
  Acceptance: fresh signup to working named employee < 10 min without support. Testing:
  onboarding E2E + manifest-preset unit tests. Impact: conversion + the brand story shipped.

## D4 — Website 2.0 · WEBSITE · 4–6 weeks (parallel-safe with D5)
**Objective:** the new front door (docs 15/17/18): homepage, 5 employee pages, 4 industry pages,
pricing, demo, product×3, trust, about; new visual system (tokens, Fraunces/Inter, Employee
Card, Thread, real-UI frames); GSAP scroll stories; live truth counter (W3); reduced-motion;
LCP<2s, JS<200KB.
- **Must NOT:** fabricate any number (sample data labeled); leak dark-theme into dashboard
  unreviewed; keep the Spline robot (retire); block on photography.
- Acceptance: Lighthouse ≥95 perf/a11y on key pages; every CTA instrumented; demo + counter live
  on home. Testing: visual regression on 3 breakpoints; link contract test (pattern exists from
  Settings). Impact: the brand exists in the market.

## D5 — SMS & Missed-Call Rescue · AI AGENTS / PRODUCT · 3–4 weeks
**Objective:** the US killer feature: every missed call gets a text in seconds; two-way SMS
threads in the Inbox.
- Backend: Twilio adapter via `ingestInboundMessage` (the architecture's proof case); missed-call
  trigger from the Vapi webhook; guided A2P 10DLC registration; STOP/HELP compliance; quiet
  hours. Frontend: SMS thread renderer; channel card; template activation.
- DB: `sms_connections` (additive, RLS, per-tenant). Billing: message metering into existing
  usage pipeline + message packs.
- **Must NOT:** any outbound marketing/bulk SMS (TCPA); no cold outreach features.
- Acceptance: missed call → text-back < 30s → reply thread in Inbox → booking artifact.
  Testing: adapter contract tests (channel suite exists); 10DLC sandbox E2E; idempotent webhook
  replays. Impact: highest-demand feature in the category; upsell engine.

## D6 — Real Bookings (R-020) · PRODUCT · 3–5 weeks
**Objective:** appointments become calendar-backed bookings buyers can verify.
- Google Calendar OAuth (per-org), availability read, slot write, reschedule/cancel flows;
  Booking artifact + provenance; voice + SMS booking paths; Bookings view in CRM.
- **Must NOT:** build a scheduling product (no staff rosters/resources v1); no Microsoft yet.
- Acceptance: live call books a real Google Calendar slot; conflict-safe under double-fire
  (idempotency-first rule). Testing: mocked-API suite + one live-sandbox E2E. Impact: closes the
  gap every "AI receptionist" comparison checks first.

## D7 — Instant AI Audit · AI AUDIT / WEBSITE · 3–4 weeks
**Objective:** the automated lead magnet (W2): URL+phone → readiness report → pre-filled hire.
- Engine: site crawl + heuristics + LLM synthesis; sourced benchmark math; optional automated
  test-call scoring; shareable `/audit/r/{id}`; report→onboarding prefill of business context.
- **Must NOT:** unsourced $ claims; no auto-calling without explicit consent (the visitor
  initiates). Acceptance: audit completes < 90s, COGS < $0.50, share pages indexed-safe.
  Testing: crawler fixtures; scoring-rubric snapshots. Impact: compounding top-of-funnel.

## D8 — Web Chat Channel + Growth Engine · PRODUCT / WEBSITE · 3–4 weeks
**Objective:** same employee on the website; acquisition compounding.
- Embeddable widget (thin, themable — widget studio lite) over the existing webchat registry
  entry + ingest pipeline; Denku's own site runs it (dogfood). Growth: SEO/AEO industry-page
  engine scale-out; Zapier directory listing; G2/Capterra profiles; weekly outcome digest email
  (W7 v1).
- Acceptance: widget < 30KB, one-snippet install (shown on-page, Creato-style); digest ships
  Mondays. Impact: channel breadth + organic engine.

---

## Sequencing & gates

```
D0 → D1 → D2 → D3 ─┬→ D4 (website, parallel) 
                   └→ D5 → D6 → D7 → D8
Gate A (after D3): first paying customer attempt — actively sell; learnings may reorder D5–D8.
Gate B (after D6): revisit IG (Meta), pipeline/scoring, marketplace listings.
Gate C (post-revenue): partner program (R-132 prerequisite) · Studio packs (≥20 requests) ·
                        outbound reactivation (legal review) — none enter the program without
                        their gate condition.
```

**Standing rules for the whole program:** additive migrations only; every feature ships *live*
(the "inert until migrated" pattern is banned for customer-facing work — deployment is part of
each sprint's DoD); truthful counts; org-scoping on every query; the sprint-closing ritual
(review doc → roadmap update → commit) continues.
