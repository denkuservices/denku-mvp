# 13 — Denku Product Strategy

> The answer to "what should Denku become, rebuilt from zero today?" — grounded in docs 01–12.
> Includes the AI Studio and AI Audit investigations (mission §13–14).

## 1. The thesis

> **Denku is the AI employee platform for US service businesses: hire an AI employee in minutes,
> connect your phone/text/web-chat, and every conversation becomes a booked job, a resolved
> request, or a captured lead — remembered forever in a CRM that is your team's shared memory.**

This is not a pivot. It is the repo's existing north star (PROJECT_VISION, platform audit,
REDESIGN_PROPOSAL) *finally expressed as a business*. The research validates it three ways:
Creato's own login page sells "unified customer memory"; no US SMB competitor owns the
receptionist+memory intersection (doc 11 §3); and the built product already implements it.

## 2. What Denku is NOT (boundaries, from evidence)

- **Not an agency.** No custom software, no RPA projects, no training workshops (Creato's
  services engine requires headcount Denku doesn't have; the US self-serve motion is the
  advantage, not a compromise).
- **Not a creative studio (v1).** See §6 verdict.
- **Not an outbound sales AI.** Artisan/11x own that category; TCPA risk; different buyer.
- **Not an enterprise agent platform.** Sierra/Decagon/Fin play at $50k+ ACV; Denku's honest
  wedge is $149–899/mo self-serve.
- **Not a dev tool.** Vapi/Retell are suppliers; Denku never exposes "prompts and models" as the
  product — it exposes *employees and outcomes*.

## 3. Product architecture (the four nouns, unchanged; one addition)

| Plane | Object | Surface | Status |
|---|---|---|---|
| Control | **AI Employee** (manifest, versioned; persona templates) | AI Team | built (dark) |
| Control | **Channel** (phone, SMS*, web chat*, IG, email*) | Channels (in AI Team/Settings) | phone+IG built; * = 2.0 additions |
| Data | **Conversation** (all channels, one inbox, human takeover) | Inbox | built (dark) |
| Data | **Contact** (timeline, lifecycle, notes, AI summary) | CRM | built (dark) |
| Data | **Artifact** (ticket/appointment/lead → *Requests*; + **Booking** once calendar lands) | CRM/Requests | built (dark); booking = new |
| NEW | **Outcome** (answered, booked, resolved, captured, $-saved) | Home + weekly digest | savings model built dark; digest = new |

**Hierarchy for the customer:** *You hire Employees → they work Channels → work appears in the
Inbox → customers accumulate in the CRM → Outcomes show up on Home and in your inbox every
Monday.* Every nav item is one noun; the story is one sentence. (This is exactly the Phase-2 IA
already on the branch: Home / Inbox / CRM / AI Team.)

## 4. Named employee templates (the packaging Creato has and Denku lacks)

Ship 5 US-tuned templates (persona + prompt + intents + artifact defaults + channel defaults):

1. **Receptionist** — answers, routes, takes messages, captures every caller as a lead.
2. **Booking Assistant** — appointment-led verticals (clinics, salons, contractors); calendar
   write access when R-020 lands.
3. **Missed-Call Rescuer** — SMS-first: texts back every missed call in seconds, converts to
   booking/lead. (US-specific killer SKU; no Creato equivalent.)
4. **After-Hours Employee** — nights/weekends overflow coverage.
5. **Support Agent** — FAQ + order/status questions + ticket filing, web chat + SMS.

Each template = a landing page, an onboarding preset, and a demo scenario. (Six-template grid
mirrors Creato's `/ai-agents` section — the proven pattern, executed with real depth.)

## 5. Vertical wedge (Creato's ikas lesson, translated)

Choose **home services + health/beauty clinics** as the beachhead (not a platform dependency
like ikas, but an *industry* wedge):
- Highest missed-call pain (doc 11: trades/home services answer worst; healthcare 32% missed).
- Booking-centric → calendar feature pays off immediately.
- Low compliance surface vs medical records (booking ≠ PHI, keep it that way; no HIPAA claims).
- Distribution analog to ikas: **Zapier directory, HighLevel marketplace, Thumbtack/Angi
  adjacency content, QuickBooks app store** — borrowed distribution without single-platform risk.

## 6. AI Studio verdict (mission §13)

**Do not build AI Studio into Denku 2.0's core.** Evidence:
- Category is crowded and price-competitive (AdCreative $39+, Creatify $19+, Icon $999+ managed);
  Denku has no distribution advantage there and a different buyer muscle (marketing vs ops).
- Margins are real (COGS $0.003–0.10/image, $0.03–0.75/s video vs $10–35/asset retail — doc 12)
  but margin without distribution is a hobby.
- The first-paying-customer lesson forbids opening a second front pre-revenue.

**What survives from the investigation:** (a) *AI-generated marketing assets for Denku itself*
(the 2.0 site's visuals, template illustrations) — use the APIs internally; (b) a **phase-4
option**: "Creative packs" as an upsell to existing e-commerce customers *if* the e-com template
gains traction — priced Creato-style ($349/pack class), fulfilled via API pipeline + human QA.
Decision gate: ≥20 paying customers asking for it.

## 7. AI Audit verdict (mission §14)

**Build it — as an instant, automated, free lead magnet (not a paid consulting product).**
- Creato uses AI Audit as its EN-market front door, but delivers it as a human engagement.
  Denku's version: enter your website + business phone → automated crawl + optional test call →
  **AI Readiness Report**: missed-call exposure estimate (using published benchmarks), response-
  time grade, booking-friction grade, channel coverage map, estimated $ recovery, and the
  recommended AI employee template with a one-click "hire this employee" CTA.
- Function: standalone lead magnet + sales funnel + onboarding pre-fill (the audit's findings
  seed the employee's business context — the report literally configures the product).
- COGS ~$0.10–0.50/audit; shareable report URL = organic distribution.
- NOT: a paid enterprise consulting product (no team to deliver it), and no fabricated numbers —
  every estimate labeled with its source/benchmark (honesty rule).

## 8. Business model summary (details in docs 04/05/19)

- Self-serve SaaS, printed pricing, month-to-month; plans keyed to **AI employees × channels ×
  included minutes/messages**; one-click top-up packs; optional done-for-you setup SKU; annual
  −15–20%. Enterprise/custom only above the top tier. Partner/white-label = phase 3.
- North-star metric: **weekly booked-or-resolved outcomes per customer** (not minutes consumed).

## 9. What changes vs the current Denku roadmap

1. Launch (deploy + flip) is promoted from "standing blocker" to **Sprint 0 of the 2.0 plan** —
   nothing else proceeds first (unchanged from the audit, now structural).
2. The next-channel priority flips from Instagram/WhatsApp to **SMS**, then **web chat** (US
   evidence over platform-completion instinct).
3. R-020 calendar rises to the top competitive feature.
4. The marketing site is rebuilt around templates + live demo + instant audit (docs 15/18).
5. Everything else already built keeps its role — the 2.0 strategy *harvests* the platform
   instead of extending it.
