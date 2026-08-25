# 02 — Creato Sitemap (complete discovered surface)

> Sources: rendered navigation + footer crawl, WordPress `wp-sitemap.xml` children (VERIFIED via
> Rank Math sitemaps), React-router route table mined from the shared SPA bundle (VERIFIED),
> external listings. Audited 2026-08-25.

## Domain map

```
creato.digital                  ← corporate/platform site (React SPA, TR + /en)
├── client.creato.digital       ← client portal (same SPA bundle)
├── agency.creato.digital       ← agency showcase (WordPress/Elementor/WooCommerce, TR)
├── ikasagent.creato.digital    ← vertical SaaS marketing site (ikas stores)
├── creatohub.digital           ← chat-widget delivery domain (shown in embed snippet;
│                                  not resolving at audit time — INFERRED: CDN/edge domain)
└── apps.ikas.com/…/creato-ai   ← ikas marketplace listing (WhatsApp Pazarlama app)
```

## creato.digital (SPA, localized `/:lang` → `/tr`, `/en`)

| URL | Purpose | Primary CTA |
|---|---|---|
| `/` (= `/tr`) | Corporate home: "AI transformation partner"; 4 services | Ücretsiz Analiz Talep Et (free analysis) |
| `/en` | English home: "Agency of the future" | **Request AI Audit** |
| `/ai-agents` | Chat & Call agent product page: 2 channels, 6 vertical templates, omnichannel grid, 4-step process, FAQ | Demo Talep Edin |
| `/ai-yazilim` | AI software/automation services: operations systems, data/decision systems, integrations | Strateji Görüşmesi Talep Et |
| `/about` | Company, mission, capabilities, **product ecosystem** (Agency · App · Trendio AI · ikas WhatsApp) | İletişime Geçin |
| `/contact` | Contact | form |
| `/kariyer` | Careers | — |
| `/partner-apply` | **Partner/reseller program**: own panel, customer management, Chat/Call revenue share, training | Partner Başvurusu |
| `/privacy`, `/terms`, `/data-deletion` | Legal (data-deletion required by Meta platform policy) | — |

## client.creato.digital (portal — routes VERIFIED from bundle)

| Route | Purpose |
|---|---|
| `/login`, `/register`, `/portal/login`, `/portal/register`, `/forgot-password`, `/reset-password/:token`, `/invite/:token`, `/invite-confirm/:token` | Auth incl. Google/Facebook OAuth, open self-signup, invite flows |
| `/dashboard` | Client home |
| `/customers` | Unified customer profiles (WhatsApp + IG + e-commerce "unified memory") |
| `/tasks` | Task management (routes keyed off webchat/conversation intents) |
| `/projects` | Agency project tracking (client-visible) |
| `/finance` | Client-side billing/finance |
| `/activity`, `/notifications` | Event streams |
| `/test-agent/:id` | **Test your agent before/after deploy** |
| `/subscription-demo`, `/subscription/result`, `/payment/failure`, `/proposal/payment-success`, `/proposal/payment-failed` | Payment/checkout result surfaces (iyzico/Stripe) |

## Internal admin (same bundle — their agency OS; routes VERIFIED)

`/admin/{dashboard, analytics, announcements, automations/templates, credit-packages, customers,
customers-v2, customers/:id, events, finance, ikas, ikas/:id, invoices, partners, partners/:id,
payments, products, products/new, products/:id/edit, profile, proposal-templates, proposals,
proposals/new, proposals/:id/edit, schema, self-agent, subscriptions, subscriptions-list, support,
system-logs, team, users}`

API surface seen: `/api/admin/agents`, `/api/portal/agents`, `/api/webhook/incoming`,
`/api/webchat/widget.js?cid=…`.

## agency.creato.digital (WordPress page-sitemap: 20 URLs, VERIFIED)

| URL | Purpose | Status |
|---|---|---|
| `/` | Agency home (last mod 2026-04-12) | live |
| `/ai-chat-agent/` | Chat agent + $349/$549/custom pricing | live (2025-09-09) |
| `/ai-call-agent/` | Call agent + $749/$949/custom pricing | live (2025-09-09) |
| `/ai-studio/` | Creative AI: Try-On, video, ad creatives + image $349/$499/$649 and video $399/$599/$899 packs | live (2025-08-25) |
| `/talep-formu/` → `/talep-alindi/` | Lead form (tabs: Chat/Call/Studio/Custom; plan dropdown; KVKK consent) → thank-you | live |
| `/meet/` | **Calendly** inline embed (`calendly.com/hello-creatoaiagency/aimeet`) | live |
| `/musteri-paneli/` | Customer-panel gateway → client.creato.digital | live |
| `/hakkimizda/` | About: founded 2024, ecosystem incl. **Trendio AI**, CREATO AI Social community | live |
| `/kullanim-kosullari/`, `/gizlilik-ve-guvenlik/`, `/cerez-politikasi/`, `/iptal-ve-iade-sartlari/` | Legal (terms, privacy, cookies, **refund/cancellation** → they sell online) | live |
| `/shop/`, `/cart/`, `/checkout/`, `/my-account/` | WooCommerce scaffolding — shop is "coming soon" | dormant |
| `/product/300-dk/` | **Sole WooCommerce product: 300-minute call pack** | behind "coming soon" |
| `/homepage-2/`, `/features/`, `/pricing/` | AiHub theme demo leftovers (2023) | cruft, still indexed |
| Blog (`/2023/08/…`, categories, `/page/2..4`) | Theme demo posts, never replaced | dead |

## Footer / cross-links (agency)

Products: Chat Agent · Call Agent · AI Studio · Talepler · Creato AI (corporate) · Müşteri Paneli.
Legal: terms · privacy · cookies · delivery-refund. Social: YouTube (@creatoai/shorts), Instagram
(@creato.tr), X (@creato_tr). Contact: `hello@creato.digital`. Addresses: 71-75 Shelton Street,
London (virtual office) & Yalı, Karşıyaka/İzmir.

## Observations

- **Small surface, deep funnel.** ~15 meaningful public pages; every one funnels to demo/meeting/
  form. No resources/blog investment at all.
- The **SPA leaks the whole business** (admin + portal routes ship in the public bundle) — a
  security/competitive-intel lesson for Denku: split bundles, never ship admin routes to the
  public.
- Sitemap hygiene is poor (theme demo pages indexed since 2023) — SEO is clearly not their
  acquisition channel; Instagram/YouTube shorts + partnerships (Meta, ikas) + referrals are
  (STRONGLY INFERRED from where they invest).
