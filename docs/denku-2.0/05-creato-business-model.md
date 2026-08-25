# 05 — Creato Business Model & Revenue Architecture

> Reconstructed from VERIFIED surfaces (pages, routes, admin machinery) + STRONGLY INFERRED flow
> logic. Audited 2026-08-25.

## 1. Creato revenue architecture

```mermaid
flowchart TD
    subgraph ACQ[Acquisition]
        A1[Instagram / YouTube Shorts<br/>@creato.tr, @creatoai]
        A2[Meta Tech Provider +<br/>ikas partner badges]
        A3[ikas App Store<br/>250-1000 installs]
        A4[Partner agencies<br/>reseller network]
        A5[EN site: 'Request AI Audit']
    end

    subgraph FUNNEL[Conversion funnel]
        B1[Talep form / Calendly meet<br/>tabs: Chat · Call · Studio · Custom]
        B2[AI Audit<br/>lead magnet → paid diagnostic]
        B3[7-day Ikasagent trial<br/>self-serve]
    end

    subgraph REV[Revenue engines]
        C1[Studio packs $349-899<br/>one-off, high margin]
        C2[Chat Agent $349+/mo<br/>Call Agent $749+/mo]
        C3[Ikasagent SaaS<br/>₺6.7k-22.5k/mo per store]
        C4[Custom software / RPA<br/>project quotes]
        C5[Training & workshops]
    end

    subgraph EXP[Expansion & retention]
        D1[Credit packages / minute packs]
        D2[Tier upgrades: 1→3→team agents]
        D3[Client portal: projects, tasks,<br/>finance, unified customer memory]
        D4[Annual -20%]
    end

    A1 & A2 & A5 --> B1
    A5 --> B2
    A3 --> B3
    A4 --> C2
    B1 --> C1 & C2 & C4 & C5
    B2 --> C4 & C2
    B3 --> C3
    C1 -->|"ads worked → automate DMs"| C2
    C2 --> D1 & D2
    C3 --> D1
    C2 & C3 & C4 --> D3
    D3 -->|switching cost| C2
```

**Operational backbone (their real moat):** an internal agency OS — proposals + proposal
templates → payment links (iyzico/Stripe) → subscriptions + invoices → credit packages → partner
management → system logs — all VERIFIED as routes in their own product. The agency is run *as
software*, which is why 2 offices can serve "20+ brands" of custom work plus 250+ SaaS stores.

**Key business-model properties**
1. **Services fund the platform; the platform makes services scalable.** Custom projects and
   audits produce cash and case knowledge; every engagement runs on the same portal, making the
   marginal customer cheaper.
2. **Distribution is borrowed, not bought.** Meta partner badge (credibility), ikas app store
   (installs), partner agencies (sales force on revenue share). Near-zero paid acquisition
   fingerprint (only Meta Pixel + GA4; no ad-tech stack observed).
3. **Cash-flow-friendly pricing.** One-off packs (instant cash), monthly recurring with setup
   labor front-loaded, prepaid credits (negative working capital).
4. **AI cost pass-through.** Bundle copy states Meta/WhatsApp/LLM/telecom costs belong to the
   customer — Creato sells orchestration margin, not model margin.
5. **Community as brand** (CREATO AI Social, "Turkey's first AI community") — inbound authority
   in a market where AI expertise is scarce.

## 2. Weaknesses in the model (exploitable)

- **Human-in-the-loop scaling limit:** every horizontal sale requires a proposal + configuration
  labor; growth is headcount-coupled except in the ikas vertical.
- **Single-ecosystem concentration:** the self-serve engine depends on ikas's platform and Meta's
  APIs (both revocable).
- **No compounding content/SEO asset**; acquisition is social + partnerships only.
- **Proof debt:** revenue claims without named customers → ceiling on mid-market/enterprise trust.

## 3. Denku revenue architecture (US market design)

Design principle: **invert Creato where the US market demands it (self-serve, printed pricing,
proof), copy where mechanics are market-independent (ladder, credits, partners, vertical wedge).**

```mermaid
flowchart TD
    subgraph ACQ[Acquisition — US]
        A1[SEO/AEO: 'AI receptionist for X'<br/>vertical landing pages]
        A2[Live demo: call the AI now<br/>+ web test call]
        A3[Free AI Audit<br/>instant, automated report]
        A4[Marketplaces: Shopify app,<br/>HighLevel, Zapier directory]
        A5[Partners/agencies<br/>white-label later]
    end

    subgraph CONV[Conversion — self-serve first]
        B1[14-day trial OR<br/>$149 starter, cancel anytime]
        B2[Onboarding = hire your AI employee<br/>teach business → test call → go live]
    end

    subgraph REV[Revenue engines]
        C1[Core SaaS: AI Employee plans<br/>$149 / $399 / $899]
        C2[Per-employee + per-channel expansion<br/>voice → SMS → web chat → IG/WA]
        C3[Minute/message packs<br/>one-click top-ups]
        C4[Done-for-you setup SKU<br/>optional, visible price]
        C5[Enterprise/custom: quote<br/>only above Scale]
    end

    subgraph RET[Retention]
        D1[CRM as memory:<br/>data gravity per contact]
        D2[Weekly outcome digest:<br/>'your AI handled N, saved $X']
        D3[Calendar + CRM integrations<br/>switching cost]
    end

    A1 & A2 & A3 & A4 --> B1 --> B2 --> C1
    A5 --> C5
    C1 --> C2 & C3 & C4
    C1 --> D1 & D2 & D3
    D2 -->|renewal proof| C1
```

**Deliberate differences from Creato**
| Dimension | Creato | Denku US |
|---|---|---|
| Core motion | Sales-led, proposal-priced | Self-serve, printed pricing, card checkout (already built: Stripe) |
| Proof | Claims ("20+ brands") | Live demo number + instant audit + real usage stats — *demonstrable* proof before logos exist |
| Acquisition | Social + TR partnerships | SEO/AEO vertical pages + marketplace listings + live demo virality |
| Wedge vertical | ikas e-commerce | Pick ONE US vertical (doc 13 recommends home-services/clinics via missed-call capture) |
| Services | Core revenue | **Optional SKU only** (setup); no custom-software agency arm at launch |
| Enterprise | "Özel" everywhere | Deferred until SOC 2 path exists (marketing honesty rule) |

**What Denku must copy without shame**
1. The **offer ladder** (free proof → low-friction entry → recurring core → usage expansion →
   custom top) — Denku currently has only "recurring core."
2. **Credit/pack top-ups** alongside overage.
3. **Partner program** as phase-2 distribution (Denku's PARTNER_PLATFORM_PROPOSAL.md already
   sketches this; Creato validates it works at agency scale).
4. **Run-the-company-on-the-product** (self-agent): Denku's own inbound line and website chat
   should be handled by a Denku AI employee from day one — it is both QA and the best demo.
