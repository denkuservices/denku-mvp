# 08 — Creato Technical Fingerprint

> Method: script/network inventory of rendered pages, response headers, 6 MB SPA bundle mining
> (string + route extraction), widget probing. Audited 2026-08-25. Confidence levels per claim.

## agency.creato.digital (showcase)

| Layer | Finding | Confidence |
|---|---|---|
| CMS | **WordPress** (wp-includes 7.x-era assets, Rank Math SEO sitemaps) | VERIFIED |
| Builder | **Elementor 3.30.2** | VERIFIED (asset versions) |
| Theme | **AiHub by LiquidThemes** (ThemeForest AI-agency theme) — all animation behaviors under `themes/aihub/` | VERIFIED |
| Commerce | **WooCommerce 11.0.1** (cart-fragments, order-attribution, sourcebuster loaded site-wide); shop in "coming soon" | VERIFIED |
| Forms | **MetForm** (Elementor forms plugin; cute-alert lib) | VERIFIED |
| Scheduling | **Calendly** inline embed (`hello-creatoaiagency/aimeet`) | VERIFIED |
| Analytics | **GA4** `G-59KSK4PPTV` + **Meta Pixel** `2114981232292831` (official FB-pixel plugin, CAPI opt-in flag) | VERIFIED |
| Fonts | Syne, Be Vietnam Pro, Poppins, Roboto Mono (self-hosted Google Fonts via Elementor) + Inter | VERIFIED |
| Animation | GSAP (+ScrollTrigger/ScrollTo/DrawSVG), tsParticles, Lottie 5.9.6, typewriter-effect, jQuery 3.7.1 | VERIFIED |
| Hosting | imunify-bot-check endpoint present → **cPanel/CloudLinux-class shared/managed hosting with Imunify360** (this is what 429'd our plain fetches) | STRONGLY INFERRED |
| CDN | none observed (assets same-origin) | STRONGLY INFERRED |
| Chat widget | Creato's own: `creato.digital/api/webchat/widget.js?cid=9a6f91ce…` (per-site agent id) | VERIFIED |
| Widget delivery domain in embed snippet | `creatohub.digital/index.js` — did not resolve during audit | VERIFIED (snippet) / UNKNOWN (status) |

## creato.digital + client.creato.digital (platform)

| Layer | Finding | Confidence |
|---|---|---|
| Frontend | **React SPA, Vite build** (`assets/index-[hash].js`, ~6.0 MB single bundle), React Router (`/:lang` i18n TR/EN) | VERIFIED |
| One bundle serves marketing + client portal + internal admin | identical bundle hash on both domains; admin/portal routes in public JS | VERIFIED |
| Styling | Tailwind-style utility classes | STRONGLY INFERRED (class fingerprints) |
| 3D | **Three.js bundled** (THREE.* runtime strings); `@splinetool` absent | VERIFIED |
| Markdown/chat rendering | hast-util-to-jsx-runtime (markdown → JSX, typical for AI chat UIs) | VERIFIED |
| LLM providers (config options in their product) | **OpenAI (GPT-5.x tiers, GPT-4.1-mini), Google Gemini (Flash/Pro), Anthropic Claude** — per-agent model picker with cost-tier descriptions | VERIFIED (UI strings) |
| AI privacy stance | "zero model training" agreements with providers claimed | VERIFIED (copy) |
| Payments | **iyzico** (product-plan linking flows: `chat-agent/plans/:id/link-iyzico`) + **Stripe** strings | VERIFIED |
| Channel orchestration | "fully compatible with **Manychat and n8n**" (chat page); `/api/webhook/incoming` generic ingress | VERIFIED (copy) — actual internal use STRONGLY INFERRED |
| Backend | not identifiable from client (no Supabase/Firebase/REST-vendor fingerprints in bundle) | UNKNOWN |
| Analytics on SPA | none found (no GA/Pixel/PostHog/Sentry strings) | VERIFIED absence |

## Voice infrastructure — the specific question

Explicitly probed for: Vapi, Retell, Bland, ElevenLabs, Twilio, Deepgram, LiveKit, Ultravox,
Play.ht, Azure Speech, plus Turkish telephony providers (Netgsm, Verimor, Bulutfon).
**Result: zero client-side fingerprints of any voice vendor.**

| Hypothesis | Assessment |
|---|---|
| Server-side voice stack (any of the above) invisible to client | Most likely — calls terminate on backend infra; nothing needs to ship in web JS | STRONGLY INFERRED |
| "Local number support" + TR single-language base tier suggests a TR telephony/SIP partner + STT/TTS pipeline rather than a US-centric platform like Vapi | INFERRED |
| Call Agent is the least-demonstrated product (no live number to call, no audio samples found) — possibly the least mature | INFERRED |

**Verdict: UNKNOWN provider; nothing suggests a proprietary voice stack.** For Denku this means:
Denku's shipped Vapi pipeline (webhook → transcript → deterministic artifacts → billing
enforcement) is likely **ahead of the benchmark's voice depth**, and certainly ahead of what
Creato demonstrates publicly.

## Security / quality observations

1. **Admin routes + business logic ship in the public bundle** (proposals, finance, partner
   management, credit packages, model pickers). No secrets seen, but full internal IA disclosed.
   Lesson: Denku must keep code-split boundaries between marketing/app/admin (Next.js App Router
   already provides this — preserve it).
2. Single 6 MB JS bundle, no code splitting → slow first paint on the platform site; the
   WordPress site is the fast one. Denku's Next.js static marketing pages are structurally ahead.
3. Bot protection (Imunify) + WP plugin surface = commodity hosting risk profile.
4. No error-tracking/telemetry SDKs anywhere — they fly blind on client errors (Denku has
   structured logging server-side; neither has client RUM).

## Stack takeaways for Denku

- The benchmark's front-of-house is **buyable** (theme) and its platform is **conventional**
  (React SPA + REST + multi-LLM + PSP). Denku's existing stack (Next.js 16/React 19/Supabase/
  Stripe/Vapi/Resend) is more modern than both Creato surfaces.
- The two genuinely clever technical moves worth copying are architectural, not stack: **one
  ingest webhook for all channels** (`/api/webhook/incoming` — Denku already has this pattern in
  `ingestInboundMessage`) and **per-agent model tiering with cost pass-through** (Denku's
  E-002 finding — provider hardcoded — is the gap).
