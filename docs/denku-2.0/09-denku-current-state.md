# 09 — Denku Current State (brutally honest)

> Basis: the repo's own audit corpus (12 role audits + FIRST_PAYING_CUSTOMER_AUDIT + settings/
> logged-in/platform audits), CLAUDE.md engineering memory, git history through Sprint 14
> (2026-08-25, branch `feat/sprint-9-one-product`), CURRENT_SPRINT.md, REDESIGN_PROPOSAL.md,
> and the knowledge graph (`graphify-out/`). This doc does not re-litigate those audits; it
> compresses them for the 2.0 decision.

## 1. The one-sentence state

**Denku is an engineering-rich, revenue-poor company: a genuinely deep AI-Employees platform
(voice end-to-end + channel-agnostic conversation model + CRM memory + versioned employee
manifests) that has zero paying customers, an unlaunched deployment, an outdated marketing site,
and no acquisition machine.**

## 2. What is REAL and working (keep — this is the asset base)

| Asset | State | Evidence |
|---|---|---|
| Voice channel end-to-end | Vapi assistant + US number provisioning, 3.1k-line webhook, transcript→deterministic ticket/appointment/lead ("never dead-end" guarantee), concurrency leases, pause enforcement | shipped, prod-verified for test traffic |
| Billing correctness | Stripe plans/add-ons/overage, golden-master usage math (`Σ ceil(sec/60)`), hard-cap → pause, compensation-based rollbacks | R-075 baselined |
| Platform data model | `conversations`/`messages`/`contacts`/`employee_channels` + pure channel adapters + one `ingestInboundMessage` pipeline; Voice + IG + Telegram/WebChat registry entries | Sprints 4.5–7 |
| Control plane | Versioned immutable employee manifests + per-conversation provenance ("what prompt ran last Tuesday" answerable) | Sprint 8 |
| Modern product IA | **Home / Inbox / CRM / AI Team** consolidation (Phase 2 IA, Aug 24–25): outcome-first Home, Inbox with human takeover + context rail, CRM contact timeline/lifecycle/notes, AI Team roster + 6-tab employee detail, channels absorb phone+IG, analytics with ranges/compare/export, Requests unified, settings on one design track | Sprints 9–14 (branch, 2026-08-25) |
| Ops discipline | 300+ vitest suite, CI, readiness preflight (`/admin/readiness`), launch runbook, migration history fully reconciled + schema baselined (R-031/R-134 closed) | main |
| Security posture | RLS on 13/14 tenant tables, org-scoping tests, security headers, encrypted per-tenant IG creds | audits 04, R-060 |
| Docs/knowledge system | CLAUDE.md + skills/ + audit playbook + roadmap — unusually strong institutional memory | repo |

## 3. What is BUILT BUT DARK (the tragedy)

Per the first-paying-customer audit (2026-07-25, verified against live prod DB): **10 of 11
migrations unapplied; `PLATFORM_MODEL_ENABLED` and `PLATFORM_UX_ENABLED` default OFF.** A customer
today gets: an AI that doesn't know their business (business-context column absent), broken
member invites, silent overage, and the legacy CRUD panel. The gap to a sellable product was
measured at **~2 days of operator deployment work**, blocked on a staging environment. Since
then, R-031 made the repo bootstrapable, but the flags/deployment state is UNKNOWN from the repo
— the standing P0 remains *deployment, not code*.

## 4. What is PARTIAL / fragile

- **Instagram**: receive-only; real DMs blocked on Meta Business Verification + App Review + Live
  mode (external). An uncommitted branch (`feat/instagram-app-review`) holds the DM inbox work.
- **Webhook auth** (R-001): staged, observe-only until an operator flips enforce.
- **Landing redesign**: approved spec (`web/LANDING_REDESIGN_SPEC.md`), never built; marketing
  site still ships the old "luxury bone/teal" theme, and still carries SOC2/HIPAA over-claims
  (R-004 — legal exposure; honesty draft written, not shipped).
- **Design language**: four dialects (marketing luxury / Horizon dashboard / shadcn / zinc)
  partially unified by Sprint 14 (ungated half only).
- **Rate limiting**: in-memory Map, a no-op on Vercel (R-030).
- **Monster files**: 3.1k-line webhook, 1,432-line billing page (R-043/R-131 — known, deferred).
- **Provider coupling**: AI provider hardcoded (E-002); no model tiering, no multi-provider
  abstraction (Creato has this).

## 5. What DOES NOT EXIST (relative to the 2.0 ambition)

- **Acquisition**: no SEO/content, no vertical landing pages, no live "call the AI now" demo on
  the site (a web test call exists in the product but not the funnel), no marketplace listings,
  no case studies, no social presence to speak of.
- **Proof**: zero customers ⇒ zero logos/testimonials — and no demonstrable-proof substitutes
  (live demo line, instant audit, public status/quality page).
- **Channels customers pay for in the US**: **SMS/missed-call-text-back does not exist** (the
  single highest-demand SMB feature in this category), web chat widget is registry-only (no
  embeddable widget), email channel absent, WhatsApp absent (right call for US v1).
- **Calendar booking** (R-020): appointments are *requests*, not booked slots — the #1
  competitive feature gap for "AI receptionist" buyers (Google/Outlook/Cal.com integration).
- **Outbound**: no outbound calling/campaigns (Creato sells this; US demand exists but
  TCPA-sensitive — deliberate decision needed).
- **AI Studio / creative**: nothing (evaluated in docs 12–13).
- **AI Audit product**: nothing (evaluated in doc 13).
- **Partner/reseller layer**: proposal doc only (PARTNER_PLATFORM_PROPOSAL.md).
- **Compliance artifacts**: no SOC 2 (claimed on the site — must be removed), no A2P 10DLC
  registration flow (needed the day SMS ships), thin accessibility.

## 6. Honest structural critiques (beyond feature gaps)

1. **Five sprints of building after launch was the bottleneck.** The repo's own audit says it:
   "code-complete was technically true and practically meaningless." The 2.0 plan must be
   structured so that *nothing new is built while the existing product is dark*.
2. **Product depth outruns product narrative.** The platform's best ideas (memory, provenance,
   honesty) are invisible in the funnel; the marketing site still sells "a phone line."
3. **The dashboard is now good; the front door is not.** After Sprints 9–14 the authenticated
   experience is coherent and arguably ahead of SMB competitors; the marketing/onboarding surface
   is two generations behind it.
4. **Terminology drift persists** ("agent" vs "AI Employee", 174 occurrences) — brand debt.
5. **No pricing-page storytelling**: plans exist in Stripe + a table; no ladder, no packs, no
   per-unit anchoring, no annual discount motion.

## 7. Retain / refactor / replace / delete (summary verdicts)

- **Retain**: entire billing/enforcement layer; Vapi pipeline + never-dead-end; platform data
  model + adapters; Phase-2 IA (Home/Inbox/CRM/AI Team); manifests/provenance; test+runbook
  discipline; Supabase/Stripe/Vercel/Resend stack.
- **Refactor (scheduled, not now)**: webhook monolith into per-event handlers; billing page;
  provider abstraction (E-002) into a model-tier layer; normalizePhone dedup.
- **Replace**: the marketing site (new IA + visual system, docs 15/17); onboarding narrative
  (hire-an-employee framing — partially built on the branch); pricing page architecture (doc 04
  lessons).
- **Delete**: SOC2/HIPAA claims (legal); dead `organizations_legacy` FK blocks; the fourth
  design system remnants; "agent" as customer-facing vocabulary.

## 8. The asymmetry that defines the 2.0 opportunity

Creato has: funnel, packaging, proof-theater, distribution partners, revenue — on shallow tech.
Denku has: deep tech, honest engineering, US-native stack — and no funnel, packaging, proof, or
distribution. **The rebuild question is therefore not "what product should Denku build?" — the
product thesis (AI Employees + CRM memory) is validated by the benchmark itself (Creato's own
login page sells "unified customer memory"). The question is "what is the shortest credible path
to wrapping this product in a Creato-grade business machine for the US market?"** That is what
docs 13–20 design.
