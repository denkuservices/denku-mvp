# 11 — US Market & Competitor Analysis

> Researched 2026-08-25 via web search; pricing points carry sources (see foot of doc). Prices
> are as reported by comparison sources in 2026 and should be re-verified before any pricing
> decision ships.

## 1. The US market context Denku is entering

- **The pain is quantified and huge:** small businesses miss ~62% of inbound calls; ~85% of
  missed callers never call back; average loss estimates run ~$126k/yr per SMB. Missed-call rates
  by vertical: healthcare 32%, legal 28%, home services 14% (CallRail data). This is the
  wedge-message for voice + missed-call-text-back.
- **Category heat:** Salesforce agreed to acquire Intercom's Fin for ~$3.6B (June 2026);
  "AI Employee" is now mainstream US SMB vocabulary (Podium, GoHighLevel both sell an
  "AI Employee" SKU).
- **US buyer expectations:** printed self-serve pricing, free trial or live demo, month-to-month
  (contract lock-in is a loudly-hated Podium trait), integrations with Google Calendar/HubSpot/
  Stripe/QuickBooks/Zapier, SMS-first communication (A2P 10DLC registered), TCPA caution on
  outbound, SOC 2 expectations from mid-market upward, and *verifiable* proof (live demo, review
  sites: G2/Capterra/Trustpilot).

## 2. Competitor matrix (15 players across overlapping categories)

| Competitor | Category | Pricing (2026, reported) | Positioning | Strengths | Weaknesses vs Denku 2.0 |
|---|---|---|---|---|---|
| **Smith.ai** | AI+human receptionist | $95–$300/mo + per-call | "Never miss a lead," human fallback | brand trust, human escalation, legal vertical | expensive at volume; not a platform (no CRM memory) |
| **Rosie** | AI answering, trades | $49/250min · $149/1,000 · $299/2,000 | budget AI receptionist for home services | price floor, simplicity | thin platform; single channel |
| **Goodcall** | AI phone agent SMB | from $79/mo per 100 callers | Google-pedigree AI receptionist | integrations, polish | caller-based pricing confuses; no memory story |
| **Slang.ai** | restaurants voice | quote-based, per location | vertical depth (reservations) | vertical focus | single vertical, quote friction |
| **My AI Front Desk** | AI receptionist | ~$65+/mo, white-label tier | cheap + reseller motion | white-label program | commodity feel, thin trust |
| **Podium** | SMB comms platform + AI Employee | platform $399–599/mo; real spend $500–800; AI add-on ~$99; 12-mo contracts | "AI employee for local business" (reviews, SMS, payments) | distribution, SMS depth, brand | price + lock-in resentment; AI bolted onto legacy platform |
| **GoHighLevel** | agency CRM + AI Employee | $97–497/mo platform; AI Employee $50–97/sub-acct + usage ($0.045/min engine + TTS + LLM + telco) | white-label everything for agencies | 1M+ agency ecosystem, unlimited-AI tier | agency-first UX chaos; SMBs need an agency middleman |
| **Synthflow** | no-code voice platform | $99+/mo; Agency white-label $1,250/mo | voice agents for agencies | white-label maturity | builder, not a business-outcome product |
| **Retell AI** | voice infra (dev) | ~$0.07/min base; real $0.13–0.33/min all-in | dev API for call agents | latency/quality | infra, not SMB product (a supplier, not competitor) |
| **Vapi** | voice infra (dev) | $0.05/min base + components | dev platform (Denku's current supplier) | flexibility | same — supplier tier |
| **Lindy** | AI employees (horizontal) | $49.99–$199.99/mo | "AI employees for everything" (email/calendar/tasks) | breadth, brand | not comms/receptionist-focused; prosumer skew |
| **Artisan** | AI BDR "Ava" | $250–600/mo self-serve | outbound AI employee | category marketing ("Stop Hiring Humans") | outbound sales only |
| **11x** | enterprise AI SDR | ~$3,750/mo (annual $40–65k) | enterprise digital workers | enterprise ACV | not SMB; different market |
| **Intercom Fin** (→Salesforce) | AI support agent | $0.99/resolution + seats ($29–139) | outcome-priced support AI | resolution pricing standard-setter | support-desk centric; mid-market+; email/chat not voice-first |
| **Sierra / Decagon / Ada** | enterprise agents | $50k–600k+/yr custom | enterprise conversational AI | Fortune-500 proof | totally different buyer |
| **AdCreative.ai / Creatify / Icon** | AI creative (Studio comparables) | $39–999/mo · $19+/mo · $999+/mo | ad creative generation | scale, data moats | (relevant only if Denku pursues Studio — crowded space) |

## 3. Where the white space actually is

Cross-referencing the matrix against Creato's model and Denku's assets:

1. **Nobody in the SMB tier owns "AI employee + CRM memory" as one product.** Receptionist tools
   (Smith/Rosie/Goodcall) have no memory layer; platform tools (Podium/GHL) have CRMs but their
   AI is an add-on; AI-employee brands (Lindy/Artisan) don't do inbound SMB comms. Denku's
   built-but-dark product — inbox + contact timeline + AI that already knows the caller — is the
   unclaimed intersection. **This is the positioning.**
2. **Honest, printed, month-to-month pricing with spend protection** directly counter-positions
   Podium (lock-in, $500–800 real spend) and quote-based services. Denku's pause-at-cap +
   pre-purchasable minute packs is a trust feature no one markets.
3. **Proof-without-logos**: a public live demo number + instant AI audit + real-time "calls
   answered this week" counter substitutes for the case studies a zero-customer company lacks.
   None of the SMB competitors let you *experience the product before signup* beyond a sales
   demo video.
4. **Multi-channel from one employee** (voice + SMS + web chat + IG) at SMB price: GHL has it but
   only via agencies; Podium has it but at 3–5× Denku's price with contracts.
5. **Transparent per-minute honesty** (every call rounds up; here's the math; here's the cap) as
   a *marketing* asset — the repo's honesty-is-a-feature rule is a US differentiator, not just
   an internal value.

## 4. Threats to respect

- **Price-floor erosion:** Rosie at $49 and GHL's $97-unlimited (per sub-account) mean voice
  answering itself is commoditizing → margin must come from memory/CRM/outcomes, not minutes.
- **Platform gravity:** Podium/GHL own SMB distribution; long-term Denku either lists into such
  ecosystems or out-positions them on product honesty + focus.
- **Supplier competition:** Vapi/Retell keep moving up-stack (templates, dashboards); Denku's
  moat must be the artifact/memory/billing layer, never raw call handling.
- **Fin/Salesforce downmarket motion** could bring resolution-priced support agents to SMB.

## 5. Denku's competitive claims that will hold (backed by shipped code)

1. "Your AI answers every call, 24/7 — and every call becomes a ticket, appointment, or lead.
   Never a dead end." (the webhook guarantee)
2. "It remembers every customer across every channel." (conversations + contacts + timeline)
3. "You can see exactly which version of your AI handled any conversation." (provenance — unique
   at this tier, an enterprise feature at SMB price)
4. "Hard spend caps. We pause before we surprise-bill you." (limits + pause enforcement)
5. "Set up in minutes, cancel anytime, price on the page." (self-serve + Stripe)

Sources: [Vellum AI receptionist roundup](https://www.vellum.ai/blog/best-ai-receptionist-for-small-business) · [AgentZap pricing guide](https://agentzap.ai/blog/ai-receptionist-pricing-complete-cost-guide-2025) · [Voksha pricing guide](https://voksha.com/guide/ai-receptionist-pricing-guide/) · [Wave Runner: Retell vs Synthflow vs Vapi](https://www.waverunnerai.com/blog/retell-ai-vs-synthflow-vs-vapi) · [Tested.media voice pricing verdict](https://tested.media/retell-vs-vapi-vs-bland-vs-synthflow/) · [CloudTalk: Lindy pricing](https://www.cloudtalk.io/blog/lindy-ai-pricing/) · [11x guide to Artisan pricing](https://www.11x.ai/guides/artisan-pricing) · [Breakout: 11x vs Artisan](https://getbreakout.ai/blog/11x-vs-artisan-ai-sdr-platform) · [Astucia: Podium real cost](https://astucia.io/blog/podium-pricing-2026-what-smbs-actually-pay) · [Zellyfi Podium pricing](https://www.zellyfi.com/blog/podium-pricing) · [GHL AI pricing](https://aigohighlevel.com/gohighlevel-ai-pricing/) · [NetPartners GHL AI Employee](https://netpartners.marketing/gohighlevel-ai-employee/) · [Gleap: Fin pricing 2026](https://www.gleap.io/blog/intercom-fin-ai-pricing-2026) · [SuperDupr: Fin vs Decagon vs Sierra](https://superdupr.com/blog/intercom-fin-vs-decagon-vs-sierra) · [Dialzara missed-call costs](https://dialzara.com/blog/missed-calls-hidden-costs-and-ai-solutions) · [GetAira missed-call stats](https://www.getaira.io/blog/missed-business-calls-statistics) · [Dialfyne missed-call statistics](https://dialfyne.com/missed-call-statistics) · [Superscale: AdCreative pricing](https://superscale.ai/alternatives/adcreative.ai/pricing) · [Lapis: Icon alternatives](https://www.trylapis.com/resources/icon-alternatives-ai-ads)
