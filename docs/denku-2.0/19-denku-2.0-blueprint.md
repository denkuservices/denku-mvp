# 19 — Denku 2.0 Blueprint

> The consolidated answer: *if Denku were rebuilt from zero today, what exactly would we build?*
> — with the crucial caveat the research proved: **most of it exists; 2.0 is a harvest + wrap,
> not a rebuild.** Prioritized opportunity matrix at the end (mission §24).

## 1. Brand architecture (doc 14)
One masterbrand (Denku). Category: **AI Employee** platform. Idea: "Hire your first AI
employee." Differentiator line: "It never forgets a customer." Honesty as brand law. Customers
name their employee (default "Denku").

## 2. Product architecture (doc 13)
- **Objects:** Employee (control, versioned manifests) · Channel · Conversation · Contact ·
  Artifact (+Booking) · Outcome.
- **Surfaces:** Home / Inbox / CRM / AI Team / Analytics / Billing / Settings (Phase-2 IA, kept).
- **Templates:** Receptionist · Booking Assistant · Missed-Call Rescuer · After-Hours · Support.
- **Channels v1:** Voice (live) → **SMS** (new, US wedge) → **Web chat** (new) → IG (Meta-gated)
  → Email (P3). WhatsApp/Telegram: not for US v1.
- **Boundaries:** SaaS only. No agency services, no outbound sales AI, no Studio product, no
  enterprise custom until evidence demands.

## 3. Technical architecture (doc 12)
Keep: Next.js/Supabase/Stripe/Vercel/Resend + Vapi (abstracted via manifests/R-108), adapters +
one ingest pipeline, RLS + org-scoping discipline, golden-master billing math. Add: Twilio SMS
(A2P 10DLC guided), Google Calendar OAuth, multi-LLM gateway (internal tiers), audit engine,
PostHog+Sentry, Upstash rate limiting, embeddable chat widget. Never: monolith admin in public
bundles, second admin clients, channel bolt-ons.

## 4. Website architecture (doc 15)
Small surface, deep funnel: home / employees×5 / industries×4 / pricing / demo / audit /
product×3 / trust / about / legal. Homepage: hero → proof strip → live demo → how hiring works →
templates → workday scroll story → memory → pricing → audit → honest FAQ → CTA.

## 5. Dashboard architecture (doc 16)
Keep Phase-2 IA; gap work only: SMS/web-chat renderers, Bookings (R-020), AI contact summary,
manifest-history UI, template picker, explainable invoice, audit-prefilled onboarding, digest.

## 6. Visual system (doc 17)
"Warm employee in a dark suit": teal-black canvas `#0A1414`, bone ink `#F7F5F1`, copper
signature `#C89468`, Fraunces display + Inter, bone-glass cards, Employee Card + Thread + real-UI
frames as signatures. One dual-mode system ends the four-dialect era. GSAP marketing motion,
reduced-motion mandatory.

## 7. Pricing architecture (doc 04)
Printed, self-serve, month-to-month: **Solo $149 / Team $399 ★ / Scale $899** re-expressed as
employees × channels × minutes; minute/message packs; "We'll set it up" SKU; annual −15–20%;
enterprise quiet-quote; the honest-billing block as a feature. Overage keeps caps + pause.

## 8. Business model & customer journey (doc 05)
Self-serve SaaS with demonstrable-proof acquisition:
**See ad/search/marketplace → call the demo line or run the audit → trial/signup ($149) →
audit-prefilled onboarding (hire, teach, test-call, connect number) → first outcomes within 24h
→ Monday digest → pack top-ups / plan growth / second employee → (phase 3) partner reselling.**
North-star metric: weekly booked-or-resolved outcomes per customer. Phase-3 expansions:
partner/white-label program, deeper vertical packs, marketplace distribution (Zapier, HighLevel,
Shopify if e-com template earns it).

## 9. Prioritized opportunity matrix (scores 1–10; Effort/Risk: lower = better)

| # | Opportunity | Impact | Revenue | Cust. value | Diff. | US-rel | Effort | Risk | Time to MVP | Depends on |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Deploy & flip the built product** | 10 | 9 | 10 | 6 | 10 | 2 | 2 | days | staging env (standing P0) |
| 2 | **Live demo line + web call on site** (W1) | 9 | 8 | 8 | 9 | 10 | 2 | 2 | days | #1 |
| 3 | **New marketing site + pricing ladder** (docs 15/17) | 9 | 8 | 7 | 8 | 10 | 5 | 3 | 4–6 wks | #2 (embeds demo) |
| 4 | **SMS + missed-call-text-back** | 9 | 9 | 10 | 7 | 10 | 4 | 4 | 2–4 wks | #1; A2P 10DLC |
| 5 | **Calendar booking (R-020)** | 9 | 8 | 10 | 6 | 10 | 5 | 4 | 3–5 wks | #1 |
| 6 | **Instant AI Audit** (W2) | 8 | 6 | 7 | 9 | 9 | 4 | 3 | 3–4 wks | #3 |
| 7 | Employee templates ×5 + audit-prefilled onboarding | 8 | 7 | 8 | 7 | 10 | 3 | 2 | 2–3 wks | #1 |
| 8 | Minute/message packs + explainable billing | 7 | 7 | 8 | 6 | 9 | 3 | 2 | 1–2 wks | #1 |
| 9 | Weekly outcome digest | 7 | 6 | 8 | 7 | 9 | 2 | 1 | 1 wk | #1 |
| 10 | Web-chat widget + studio | 7 | 7 | 8 | 5 | 9 | 5 | 3 | 3–4 wks | #1 |
| 11 | Trust page + honesty compliance sweep (F-012) | 6 | 4 | 6 | 6 | 10 | 2 | 1 | days | counsel |
| 12 | SEO/AEO industry-page engine | 7 | 7 | 5 | 5 | 10 | 5 | 3 | ongoing | #3 |
| 13 | CRM pipeline + outcome scoring | 6 | 6 | 7 | 7 | 8 | 5 | 3 | 3–4 wks | #1 |
| 14 | Multi-LLM gateway (E-002) + model tiers | 5 | 4 | 5 | 4 | 6 | 5 | 4 | 2–3 wks | — |
| 15 | Marketplace listings (Zapier/GHL/…) | 6 | 6 | 5 | 5 | 9 | 4 | 3 | 2–3 wks | #4/#10 |
| 16 | Partner/white-label program | 7 | 8 | 5 | 6 | 8 | 8 | 6 | 8–12 wks | R-132, traction |
| 17 | IG DMs completion | 5 | 4 | 6 | 5 | 6 | 3 | 5 (Meta) | external | Meta review |
| 18 | AI Studio packs | 4 | 5 | 5 | 3 | 7 | 6 | 5 | 6–10 wks | ≥20 customers asking |
| 19 | Outbound/reactivation campaigns | 4 | 6 | 5 | 5 | 5 | 6 | 8 (TCPA) | — | legal review |
| 20 | E-commerce actions (orders/coupons) | 4 | 5 | 6 | 5 | 7 | 7 | 4 | — | e-com template traction |

## 10. The blueprint in one paragraph

Turn on the product that exists (1); make it experienceable before signup (2); wrap it in an
honest, original, template-led website and pricing ladder (3, 6–9, 11); close the two feature
gaps US buyers verify — texting back and real bookings (4–5); then widen through web chat, SEO,
and marketplaces (10, 12, 15); and only after paying customers, scale through partners and
adjacencies (16–20). Everything Creato does well is either already inside this plan
(templates, packs, audit, partner phase, dogfooding) or deliberately rejected with reasons
(services arm, contact-sales pricing, fake proof, Studio-first).
