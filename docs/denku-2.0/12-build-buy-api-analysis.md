# 12 — Build vs Buy vs API Analysis

> For every major proposed Denku 2.0 capability. HYBRID = Denku builds the orchestration/product
> layer over third-party AI infrastructure (Denku's existing pattern with Vapi). Costs from doc 11
> sources + provider pricing research (2026, re-verify at implementation).

| Capability | Verdict | Provider(s) | Cost profile | Lock-in | Differentiation kept by Denku | Time to MVP | Reasoning |
|---|---|---|---|---|---|---|---|
| **Voice runtime (STT/LLM/TTS/telephony)** | **HYBRID (keep Vapi)** | Vapi (current); Retell as evaluated fallback | ~$0.13–0.33/min all-in | Medium — mitigate via manifest layer (R-108 provider binding) abstracting assistant config | artifact guarantee, billing enforcement, provenance, memory | already live | Rebuilding voice infra is a multi-year distraction; suppliers move fast. The moat is above the call, not in it. Do NOT build; do abstract (E-002). |
| **SMS / missed-call-text-back** | **API** | Twilio (A2P 10DLC) or Telnyx | ~$0.008–0.012/SMS + number fees + 10DLC registration | Low (commodity) | conversation continuity: SMS lands in the same Inbox/contact timeline | 2–4 wks | Highest-demand US channel; pure adapter work on the existing `ingestInboundMessage` pipeline — the architecture was built for exactly this. |
| **Calendar booking (R-020)** | **API/BUY** | Google Calendar + Microsoft Graph direct; or Cal.com/Nylas as aggregator | free APIs / Nylas ~$1.50+/connected account | Low–Med | booking becomes an *artifact* with provenance; competitors treat it as a feature | 3–5 wks | Buyers verify this one live. Direct Google first (80% of SMBs), aggregator later. |
| **Web chat widget** | **BUILD (thin)** | own embed + existing pipeline | negligible | — | same-employee-everywhere story; widget studio theming | 3–4 wks | It's a JS embed + the shipped webchat registry entry; renting Intercom-class tools would fork the data model. Creato built theirs; so should Denku. |
| **Email channel** | **API (defer P3)** | Resend inbound / Postmark | cents | Low | unified memory | 4+ wks | Real demand but lower urgency than SMS/chat; defer. |
| **Instagram / WhatsApp** | **API (external-gated)** | Meta Graph | per-conversation fees (WA) | High (policy) | inbox unification | blocked on Meta review | Continue the shipped receive-only base; don't fight Meta timelines on the critical path. |
| **LLM brain for chat/SMS agents** | **API multi-provider** | Anthropic + OpenAI + Google via one internal gateway | $0.1–3/Mtok class models | Low with abstraction | prompt/manifest system, business-context grounding, honesty guardrails | 2–3 wks | Copy Creato's multi-provider tiering internally ("Standard/Premium brain"), never expose raw model names to SMBs. Fixes E-002. |
| **AI Audit engine** | **BUILD on APIs** | LLM + website crawl + (optional) Google Business Profile / CallRail-style data | ~$0.10–0.50/audit COGS | — | the report IS Denku marketing; scoring rubric proprietary | 3–4 wks | Automated instant audit (enter URL + phone → readiness score + missed-revenue estimate + recommended AI employees). Creato's audit is human; Denku's is instant — BETTER verdict from doc 10. |
| **AI Studio (images/ads)** | **DEFER; if ever: HYBRID** | gpt-image ($0.02–0.10/img), Flux ($0.003–0.05), Imagen ($0.01–0.04); FASHN try-on $0.075/gen; video: Kling ~$0.03–0.11/s, Veo Lite $0.05/s | COGS cents vs $10–35/asset retail — margin is real | Low | none defensible — AdCreative/Creatify/Icon own the space at $19–999/mo | 6–10 wks | **Do not build in 2.0 core.** Crowded category, different buyer motion, and Denku must not repeat "build before customers." Revisit only as an upsell for existing e-com customers with evidence of demand. |
| **CRM pipeline + lead scoring** | **BUILD** | own (exists partially) | — | — | scoring from *conversation outcomes* (unique data) | 3–4 wks | The data advantage is proprietary; renting a CRM would destroy the memory thesis. |
| **Outcome analytics / savings reports** | **BUILD** | own (`savings.ts` exists) | — | — | renewal engine | 1–2 wks | Already built dark; add weekly email digest via Resend. |
| **Marketing site + animations** | **BUILD** | Next.js + GSAP/ScrollTrigger (benchmark-proven) or Motion for React | — | — | original visual system (doc 17) | 4–6 wks | Never a WP theme: Denku's site must render the real product. |
| **Payments/billing** | **BUY (keep Stripe)** | Stripe | 2.9%+30¢ | Med | pause/cap enforcement UX | live | Also add Stripe Checkout for one-click minute packs. |
| **Scheduling for sales/demos** | **BUY** | Cal.com or Calendly embed | $0–15/mo | none | — | hours | Same move as Creato's `/meet`. Bonus: Denku's own AI books its own demos — the dogfood wow. |
| **Analytics/telemetry** | **BUY** | PostHog (product) + GA4 (marketing) | free tier | Low | — | days | Currently flying blind on funnel; required before spending on acquisition. |
| **Error tracking** | **BUY** | Sentry | free tier | Low | — | days | Neither Creato nor Denku has client RUM; cheap edge. |
| **Rate limiting (R-030)** | **BUY** | Upstash Redis / Vercel KV | ~$10/mo | Low | — | days | In-memory Map is a no-op on Vercel; fix before public demo endpoints ship. |
| **A2P 10DLC + TCPA compliance flow** | **BUILD (thin) over Twilio** | Twilio TrustHub API | pass-through fees | Low | onboarding smoothness = conversion | with SMS work | US-specific; competitors bury it in support docs — make it a guided step. |
| **Partner/white-label platform** | **BUILD (P3)** | own (multi-org R-132 prerequisite) | — | — | platform layer | 8–12 wks | Validated by Creato + GHL ($1,250/mo Synthflow agency tier shows willingness-to-pay), but strictly after direct motion works. |
| **Review management / reputation** | **IGNORE** | — | — | — | — | — | Podium's turf; scope creep. |
| **Outbound campaign dialing** | **IGNORE (v1)** | — | — | — | — | — | TCPA exposure + brand risk while unknown; revisit with consented reactivation only. |

## The three rules this table encodes

1. **Denku builds only where its data or guarantees compound:** artifacts, memory, provenance,
   billing honesty, audit scoring, and the surfaces that render them. Everything else is rented.
2. **Every new channel is an adapter, never a platform** (the Sprint 4.5 rule holds for 2.0 —
   SMS proves the architecture was worth it).
3. **No new product line (Studio, outbound, services) until the core motion has paying
   customers.** The first-paying-customer audit's lesson is structural, not situational.
