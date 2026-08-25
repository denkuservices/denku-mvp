# 03 — Creato Product / Service Map

> Everything Creato sells, reconstructed from rendered pages + bundle strings. Audited 2026-08-25.
> Margin/complexity columns are STRONGLY INFERRED unless noted.

## Portfolio at a glance

| # | Offering | Type | Target | Pricing motion | Productized? |
|---|---|---|---|---|---|
| 1 | AI Chat Agent | Recurring service on own platform | SMB→mid: e-com, clinics, real estate, services | $349+/mo, contact sales | Semi (plans, custom setup) |
| 2 | AI Call Agent | Recurring service on own platform | Same + call-heavy SMBs | $749+/mo, contact sales | Semi |
| 3 | AI Studio — images | Fixed-scope creative packs | E-com/fashion brands | $349/$499/$649 one-off | Fully |
| 4 | AI Studio — video | Fixed-scope creative packs | Same + campaigns/music clips | $399/$599/$899 one-off | Fully |
| 5 | AI Audit | Paid diagnostic → roadmap | Mid-market ops/e-com | Quote (free intro analysis as lead magnet) | Semi |
| 6 | AI Software / Automation | Custom projects (RPA, dashboards, integrations) | Mid-market | Quote | No |
| 7 | Corporate AI training | Workshops | Executives/teams | Quote | Semi |
| 8 | **Ikasagent** | Vertical SaaS (ikas stores) | TR e-commerce on ikas | ₺6,700/13,500/22,500 per mo self-serve, 7-day trial | Fully |
| 9 | ikas WhatsApp Pazarlama app | Marketplace app | Same | Freemium + limits | Fully |
| 10 | Trendio AI | Marketplace Q&A auto-responder | TR marketplace sellers (Trendyol et al. — INFERRED from name) | UNKNOWN | Product |
| 11 | Partner program | Reseller/white-label | Other agencies | Revenue share | Platform |
| 12 | Minute packs ("300 DK") | Usage top-up | Call-agent customers | WooCommerce, "coming soon" | Planned |
| 13 | Credit packages | Usage top-up | Platform customers | Admin-created, portal-purchased | Live (admin routes VERIFIED) |

## Deep dives

### 1–2. Chat & Call Agents (the core recurring engine)
- **Delivery model:** configured *for* the customer (knowledge base, dialog flows, brand voice
  trained by Creato — "4 steps, live in 24h"), then run on Creato's platform with a client panel.
- **Channels:** Web widget, WhatsApp Business, Instagram DM, Messenger, Telegram, phone; CRM
  systems listed as a "channel." Compatibility with **Manychat and n8n** stated on the chat page
  (VERIFIED) — channel plumbing is composed, not all custom.
- **Vertical templates** (VERIFIED, `/ai-agents`): Appointment Agent (clinics/beauty/consulting),
  E-commerce Agent (PDP questions, cart recovery), Real-estate Agent, Corporate Support Agent,
  Campaign Agent (outbound voice campaign explainer), **FSBO Real-estate Agent** (scrapes listings,
  calls owners on behalf of the office — an outbound prospecting product).
- **Feature depth claimed:** context-aware replies, multilingual, CRM/API sync, conversation
  analytics, custom scenarios, real-time monitoring, voicemail drop, scheduled outbound.
- **Included agents scale with plan** (1 → 3 → team) — the unit is the *agent persona*, not seats.
- **Margins:** high once configured (LLM + channel API costs passed through per bundle copy);
  setup labor is the COGS spike. Complexity: medium; dependencies: Meta APIs, LLM providers,
  telephony (provider UNKNOWN — no Vapi/Retell/Twilio/ElevenLabs fingerprint anywhere).

### 3–4. AI Studio (creative packs)
- Images: 10/$349 · 30/$499 (adds **Visual Try-On**, campaign banners) · 60/$649 (adds 3D mockups,
  variant series). 1/3/4 revisions; 7/5/7 business-day delivery.
- Video: 3–5 clips/$399 · 5–8/$599 (effects, music) · 8–12/$899 (storyboard, VO, multi-format
  Reels/TikTok/YouTube). Music clips = custom quote.
- Catalog of use cases: social creatives, e-com videos, ad visuals, product-intro videos,
  fashion/Try-On, launch videos, campaign banners, portraits/characters, music clips, photo
  manipulation, Reels/TikTok shorts, product placement.
- **Delivery model:** service desk powered by AI tools (models unnamed; UNKNOWN which). This is
  an *agency capability productized into SKUs*, not a software product — no self-serve studio app
  found anywhere.
- Margins: very high (API costs cents-per-asset vs $35–65/asset retail); labor = prompt/QA/revisions.

### 5. AI Audit
- Free "analysis request" on TR home; **"Request AI Audit"** is the primary EN CTA. Output:
  process & data analysis, quick wins, 6–12-month roadmap. Functions as: lead magnet → paid
  diagnostic → pipeline for offerings 1–7. (Pricing UNKNOWN — quote.)

### 8. Ikasagent (the strategic standout — see doc 04 for pricing psychology)
- AI support/sales agent + omnichannel inbox + human takeover + widget studio + **CRM with AI
  lead scoring** + deep ikas commerce actions (order status, stock, shipping, **AI-issued
  coupons**, cart recovery, product recommendation branded "Creato Agentic Algorithm™").
- Turnkey onboarding ("we configure everything, ~15 min of your time").
- "250+ active brands" (consistent with 250–1,000 installs on the ikas listing).
- Unlimited users; priced purely on AI message volume.

### 10. Trendio AI
- Auto-answers marketplace customer questions "fast, sales-focused" (about-page copy). No site
  found linked. UNKNOWN maturity — likely early or internal-pilot stage.

### 11. Partner program
- Public application page + `/admin/partners` machinery: partners get a panel, create their own
  customers, sell Chat/Call agents, revenue share, training/support. This is a **channel-sales
  layer over the same platform** — white-label-adjacent (branding depth UNKNOWN).

## What is conspicuously absent

- No self-serve signup for Chat/Call agents (portal registration exists, but purchase is
  proposal/sales-led). No public per-minute voice pricing. No US phone-number story. No app
  marketplace beyond ikas. No published case studies, client logos, or testimonials with names.
- No security/compliance page beyond KVKK legal text — nothing that would pass a US mid-market
  procurement review.

## Lessons for Denku's product map

1. **Name the persona templates.** Creato ships six ready-made vertical agents; Denku ships an
   abstract "AI Employee." Templates are what make "hire in minutes" believable.
2. **Sell outcomes as SKUs.** Fixed counts, revisions, delivery days — even services become
   buyable. Denku's subscription is already productized; its *setup* and *creative* adjacencies
   could be too.
3. **The unit "agents included" (1/3/team)** is a cleaner expansion axis than phone numbers.
4. **Usage credits as top-ups** (credit packages, minute packs) complement plans without
   overage-billing anxiety — psychologically superior to surprise overage invoices.
5. **A vertical wedge with borrowed distribution** (their ikas ↔ a US platform ecosystem for
   Denku, e.g., Shopify/HighLevel/clinic PMS) is how a 2-person company gets 250 logos.
