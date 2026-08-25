# 01 — Creato Complete Audit

> Denku 2.0 research package · investigated 2026-08-25 via live rendered pages (in-app browser),
> DOM/computed-style extraction, network capture, and full JS-bundle mining. Evidence levels:
> **VERIFIED** (directly observed), **STRONGLY INFERRED**, **INFERRED**, **UNKNOWN**.
> Companion docs: 02 sitemap · 03 product map · 04 pricing · 05 business model · 06 visual
> forensics · 07 animation forensics · 08 technical fingerprint.

## 1. What Creato actually is (the finding that reframes everything)

Creato is **not** primarily a beautiful website. It is a **three-layer AI business** operated from
İzmir, Turkey (with a London virtual-office address), founded 2024, targeting the Turkish market
with an English `/en` façade:

| Layer | Surface | What it is | Evidence |
|---|---|---|---|
| **Agency (services)** | `agency.creato.digital` | Lead-gen brochure for Chat Agent / Call Agent / AI Studio / custom software, priced "starting from," all CTAs → sales contact or Calendly | VERIFIED (rendered all pages) |
| **Platform (product)** | `creato.digital` + `client.creato.digital` | One React SPA containing the marketing site, a client portal (projects, tasks, finance, test-agent, omnichannel inbox) and a full internal agency admin (proposals, invoices, subscriptions, credit packages, partners, finance, self-agent) | VERIFIED (routes + UI strings mined from the shared 6 MB bundle) |
| **Vertical SaaS** | `ikasagent.creato.digital` + ikas app store | Productized, self-serve-priced AI customer-communication platform for ikas e-commerce stores; plus a WhatsApp marketing app (250–1,000 installs, launched 2025-12-29) | VERIFIED (rendered page + ikas listing) |

**The strategic shape:** horizontal offerings are sold as *services* (proposal-driven, "contact
sales," custom setup); the *productized self-serve* motion exists only as a **vertical wedge**
(ikas stores). Creato monetizes the agency funnel while incubating SaaS behind it. Their public
"wow" (the agency site) is largely an **off-the-shelf premium WordPress theme** (AiHub by
LiquidThemes) — the real custom engineering lives in the platform SPA.

## 2. Site-by-site audit

### 2.1 `creato.digital` (corporate/platform site, TR + EN)

- **Positioning (TR):** "YAPAY ZEKA DÖNÜŞÜM ORTAĞINIZ — İşinizi Yapay Zeka ile yeniden tanımlayın"
  (Your AI transformation partner — redefine your business with AI).
- **Positioning (EN, `/en`):** "AGENCY OF THE FUTURE — Redefine your business with AI." Primary CTA
  is **"Request AI Audit"** — the audit is the lead magnet.
- **Trust bullets under hero:** "Live AI apps in 20+ brands · Up to 30% operational cost reduction
  · Sustainable transformation with Audit + Training." Note these are *outcome* claims, not logos.
- **Four services**, each rendered as an animated mini-product card:
  1. **AI Audit** — process/data analysis, quick wins, 6–12-month roadmap (visual: "Optimization
     Score 98%" gauge).
  2. **AI Software Services** — custom AI apps, RPA + agent integrations, dashboards (visual: fake
     code editor typing `aiModel.optimize({speed:"max"})` → "Build Successful").
  3. **Chat & Call Agents** — multichannel assistants for support/sales/booking; web, WhatsApp,
     phone; CRM & ticket integration (visual: "Action Completed / Meeting Scheduled" toasts).
  4. **In-company AI training** — executive + team workshops (visual: animated bar chart).
- **Partner logos:** Meta Tech Provider badge + ikas Partner badge (VERIFIED — logo files
  `meta-tech-provider-logo.webp`, `ikas-partner-logo.webp`).
- **Footer:** About, Careers, **Partner Application**, Contact, Privacy, Terms, Data Deletion.
- **Own chat widget** is embedded from `/api/webchat/widget.js?cid=…` — currently returns
  `/* widget disabled */` (VERIFIED). They dogfood, but it was switched off at audit time.

### 2.2 `client.creato.digital` (client portal — same SPA)

Login screen sells the product while you sign in (rotating marketing panel):
- **"Unified profile":** WhatsApp + Instagram + Shopify/e-commerce data "in one unified customer
  memory" — with a rendered example (VIP customer, 3 orders ₺5,420, "left 2 items in cart ₺1,850").
  This is precisely Denku's "CRM is memory" thesis, shipped as their login-page pitch.
- Auth: email/password + Google + Facebook OAuth; open self-registration.
- Portal routes (VERIFIED from bundle): `/dashboard`, `/customers`, `/finance`, `/projects`,
  `/tasks`, `/activity`, `/notifications`, `/test-agent/:id`, `/subscription-demo`, invite flows.

### 2.3 Internal admin (same SPA — their agency OS)

Routes (VERIFIED): `/admin/{analytics, announcements, automations/templates, credit-packages,
customers, customers-v2, dashboard, events, finance, ikas, invoices, partners, payments, products,
profile, proposal-templates, proposals, schema, self-agent, subscriptions, subscriptions-list,
support, system-logs, team, users}`.

What this proves about how they operate:
- **Proposal-driven sales**: proposals + proposal-templates + `/proposal/payment-success|failed`
  → they send productized proposals with embedded payment links.
- **Recurring revenue engine**: subscriptions + credit-packages (usage credits) + invoices +
  payments, with **iyzico** (Turkish PSP) product linking (`chat-agent/plans/:id/link-iyzico`)
  and Stripe strings also present.
- **Partner/reseller layer**: `/admin/partners` + public "Partner Application" page — agencies get
  "their own panel," create customers, revenue-share on Chat & Call agents (VERIFIED copy).
- **Self-agent**: they run their own agent on themselves and manage it from admin.
- **Multi-provider LLM config** (VERIFIED strings): model picker with OpenAI (incl. GPT-5.x tiers
  and GPT-4.1-mini as "cheaper/faster"), Google Gemini (Flash/Pro tiers), and Anthropic Claude.
- **Cost pass-through + privacy copy** (VERIFIED strings): "Meta/WhatsApp, OpenAI, LLM API costs
  or telecom provider costs…" passed through; "zero model training privacy policy with major AI
  providers (OpenAI, etc.)."

### 2.4 `agency.creato.digital` (the showcase site)

WordPress + Elementor + WooCommerce + **AiHub theme** (see doc 08). Pages: home, AI Chat Agent,
AI Call Agent, AI Studio, request form (+ thank-you), Calendly page, customer-panel gateway,
about, 4 legal pages, WooCommerce scaffolding (shop/cart/checkout "coming soon" with exactly one
product: **"300 DK"** — a 300-minute call pack, unpriced/behind coming-soon). Blog contains
untouched 2023 theme demo posts ("AI-powered chatbot banana…") — the blog is **dead weight**
(VERIFIED), which matters: their funnel does not depend on content marketing.

Homepage narrative order: hero (typewriter rotating value words) → partner marquee → automation
capability grid → Chat Agent → **AI Studio creative lab** (Visual Try-On, AI video clips, AI ad
creatives) → automation marquees (Lead→CRM, call→task, scoring, invoice/shipping tracking, email
replies, cart reminders, IG comment replies, AI SEO, stock alerts) → **live embed-code section**
(shows actual `window.CHAT_WIDGET_CONFIG` + `<script src=creatohub.digital/index.js>` snippet —
"it's real code" as a trust device) → custom software → FAQ → CTA.

### 2.5 `ikasagent.creato.digital` (the productized SaaS — most important single page)

Full self-serve SaaS marketing page with real pricing (doc 04) and a feature depth that exceeds
the agency pages:
- Omnichannel inbox (WhatsApp/Instagram/Messenger/WebChat) with live counts.
- Deep ikas commerce integration: order status, product/stock lookup, shipping tracking,
  **coupon creation by the AI**, cart recovery, product recommendation ("Creato Agentic
  Algorithm™" — trademark-styled branding of their matching logic).
- **Human takeover**: "AI answers → human support needed → take over conversation / give back to
  AI," average 12s wait — the exact handoff pattern Denku built.
- **Widget studio**: 6 themes, unlimited colors, logo, greeting, position, live preview.
- **CRM module**: pipeline board with stages, **AI lead scoring** (hot 92% / warm 64% / cold 31%),
  channel source analysis, custom tags/stages.
- **White-glove onboarding**: "We set it up, you use it" — 4 steps, "~15 min, 100% us,"
  turnkey knowledge-base + flows configuration.
- Trust: "250+ active brands," SSL, KVKK (Turkish GDPR) compliance, free setup, 7-day free trial.

### 2.6 ikas app store listing (VERIFIED via marketplace)

"CREATO AI | WhatsApp Pazarlama": abandoned-cart recovery, bulk campaigns, order-status
notifications, templates, performance tracking. Free setup; freemium with subscription/limit
add-ons. **250–1,000 store installs; launched 2025-12-29.**

## 3. Why each surface exists (funnel logic)

1. **`/en` + AI Audit CTA** → consultative entry for bigger-ticket transformation work; the audit
   converts unknown scope into a paid roadmap and de-risks custom projects.
2. **Agency product pages** ("starting from $349–$949/mo") → anchor pricing + demo requests; the
   sales call attaches setup and customization.
3. **AI Studio packs** ($349–$899, fixed deliverables) → low-friction productized entry for
   e-commerce brands; upsell path to agents ("your ads worked; now answer the DMs automatically").
4. **Ikasagent** → volume self-serve motion inside a platform they partner with (distribution via
   ikas app store), where onboarding is repeatable enough to be turnkey.
5. **Client portal** → retention + expansion surface (projects, tasks, finance, credit top-ups) and
   the operational moat that makes "agency" scalable.
6. **Partner program** → distribution multiplier: other agencies resell Chat/Call agents on
   Creato's platform.

## 4. What Creato does exceptionally well (honest read)

1. **Ecosystem coherence**: Agency (services) + App (platform) + vertical SaaS + community
   (CREATO AI Social) + marketplace apps reinforce each other; every surface cross-sells.
2. **Productized service design**: every offer has a named plan, a deliverable count, a revision
   count, and a delivery time — even the "custom" work feels buyable.
3. **Show, don't claim**: animated product mock-UIs (inbox, pipeline, widget studio, live metric
   cards) demonstrate the product *on the marketing page*; the embed-code block literally shows
   the installation snippet.
4. **Vertical wedge execution**: Ikasagent picks one platform (ikas), integrates deeply (orders,
   stock, coupons), prices per message, and rides the host's app store for distribution.
5. **Operational self-awareness**: they built their own agency OS (proposals→payments→
   subscriptions→credits→partners) instead of stitching SaaS tools — the agency itself is
   software.
6. **Multi-provider AI posture**: OpenAI + Gemini + Claude with tiered model choices per agent;
   costs passed through transparently; "zero training" privacy stance.

## 5. Where Creato is weak (opportunities for Denku)

1. **The showcase is rented**: the agency site's visual identity is a ThemeForest theme (AiHub);
   the E-logo composition, particles, conic glows are stock behaviors. A competitor with an
   *original* system at the same quality level out-brands them instantly.
2. **No US footprint**: TR-first content, KVKK not SOC2/HIPAA, iyzico rails, TL pricing on the
   SaaS, Turkish-only agency site; `/en` is a thin façade with no US proof, casing, or phone story.
3. **No transparent horizontal pricing**: everything horizontal is "starting from + contact
   sales" — high friction for SMB self-serve; their own shop ("300 DK") is still "coming soon."
4. **Voice is the thinnest product**: the Call Agent page is feature copy without a live demo, no
   "call this number now" proof, no visible telephony depth (no provider fingerprint anywhere).
5. **Dead blog / demo cruft / disabled widget**: unmaintained theme demo posts from 2023,
   `homepage-2`/`features`/`pricing` theme leftovers indexed, and their own webchat switched off —
   polish is skin-deep at the edges.
6. **Claims without receipts**: "20+ brands," "30% cost reduction," "250+ brands" — zero named
   case studies, no logos of actual customers, no video testimonials found on any audited page.

## 6. The one-paragraph verdict

Creato's genius is **business architecture, not technology**: they wrapped commodity AI
infrastructure (multi-provider LLMs, Manychat/n8n-compatible channel plumbing, a WP theme) in a
disciplined productized-service system with an internal OS (proposals → payments → subscriptions →
credits → partners) and planted one self-serve vertical SaaS where distribution was free (ikas app
store). Denku, by contrast, over-invested in platform engineering and under-invested in exactly
the things Creato monetizes: packaging, funnel, proof, and a repeatable sales machine. The
transformation Denku needs is **not to look like Creato — it is to out-operate them in a market
(US) they can't credibly serve, with the deeper product Denku already built.**
