# 04 — Creato Pricing Analysis & Pricing Psychology

> All prices VERIFIED from rendered pages 2026-08-25. TL→USD conversions are approximate
> (₺40–45/USD range as of mid-2026) and marked ≈.

## 1. The complete observed price book

| Product | Tier | Price | Included | Notes |
|---|---|---|---|---|
| Chat Agent | Temel | **$349/mo** "starting from" | 1 agent, multi-language, multi-platform (IG/WA/Web), FAQ auto-replies, campaign replies, reporting | contact sales |
| Chat Agent | Standart ★ | **$549/mo** "starting from" | 3 agents, + personalization, content templates | contact sales |
| Chat Agent | Özel | Quote | agent team, CRM/API, custom-trained model, auto sales routing, own panel, premium support | |
| Call Agent | Temel | **$749/mo** "starting from" | 1 voice agent, single language (TR), basic call answering, local number, 24/7 | contact sales |
| Call Agent | Standart ★ | **$949/mo** "starting from" | 3 voice agents, multilingual, campaign announcements, voicemail drop, advanced reporting, CRM & API | contact sales |
| Call Agent | Özel | Quote | multi-agent, custom dialog flows, conversation AI analysis, premium support, custom dev | |
| AI Studio images | Temel / Standart ★ / Gelişmiş | **$349 / $499 / $649** | 10 / 30 / 60 images; Try-On from Standart; 3D mockups at top; 1/3/4 revisions; 7/5/7-day delivery | one-off packs |
| AI Studio video | Temel / Standart ★ / Gelişmiş | **$399 / $599 / $899** | 3–5 / 5–8 / 8–12 videos; effects→music→storyboard+VO+multi-format ladder | one-off packs |
| **Ikasagent** | Başlangıç | **₺6,700/mo** (≈$150–165) | 3,000 AI messages | self-serve, 7-day trial |
| Ikasagent | Büyüme ★ | **₺13,500/mo** (≈$300–340) | 7,500 AI messages | −20% annual |
| Ikasagent | Kurumsal | **₺22,500/mo** (≈$500–560) | 15,000 AI messages | all plans: unlimited users, all channels, free pro setup, 24/7 support |
| WhatsApp app (ikas) | — | Freemium + paid limits | cart recovery, campaigns, order notifications | free setup |
| Minute pack | "300 DK" | unpriced ("coming soon") | 300 call minutes | WooCommerce top-up SKU |
| Credit packages | admin-defined | varies | usage credits | portal top-ups |

## 2. Reverse-engineering the psychology

**Why these price points**
- $349 chat / $749 voice anchors: *voice is priced ~2.1× chat* — voice carries telephony + latency
  costs and higher perceived value ("replaces a receptionist," not "replaces a chat macro").
- Every horizontal tier is **"starting from" + contact sales**: the printed number is an anchor
  and qualification filter, not a checkout price. Real ARPU is set in the proposal (setup fees,
  customization, usage credits — machinery VERIFIED in their admin: proposals, credit packages,
  iyzico/Stripe links).
- The ★ "Popular" tier is always the second one, ~1.3–1.6× base — classic center-stage anchoring.
- Studio packs price per-asset at $10.8–$35/image and $75–$133/video — decoy structure pushes to
  the middle ($499: 30 images at $16.6 ea + Try-On unlock).
- Ikasagent prices on **AI messages** (3,000/7,500/15,000), with unlimited seats — the metric
  scales with value delivered and can't be gamed by staff count; "no hidden costs" + visible
  everything-included list counters usage-billing anxiety.

**The offer ladder (entry → expansion)**
1. Free: AI Audit request / free analysis / 7-day Ikasagent trial / free demo.
2. Low-friction one-off: Studio pack ($349–$899) — a *transactional first yes*.
3. Recurring core: Chat ($349+) → Call ($749+) → bundles (multi-agent tiers).
4. Usage expansion: credits, minute packs, message-tier upgrades.
5. High-ticket: custom software/automation projects; enterprise "Özel" tiers.
6. Distribution: partner revenue share (other agencies' customers on their platform).

**Where customization enters:** at tier 2 of every product (personalized flows at Chat Standart,
campaign logic at Call Standart, Try-On at Studio Standart) — customization is the ratchet that
justifies the sales call and larger invoice.

**Retention mechanics:** white-glove setup (switching cost), the client portal (data + tasks +
finance live there), CRM/unified memory (their phrase) accumulating customer history, annual
−20%, and credits pre-purchase.

## 3. What Denku should replicate

1. **Print prices for self-serve; keep "talk to us" only above the top tier.** Denku already has
   honest $149/$399/$899 — that is *more* US-credible than Creato's contact-sales-everything.
   Keep it; add the missing ladder around it.
2. **The ★ middle-tier anchor with an explicit "most popular"** and a visible per-unit price.
3. **Usage top-up packs (minutes/messages) purchasable in one click** — better trust than
   metered overage. Denku's $100/$250 overage thresholds solve runaway cost, but *pre-purchased
   packs* solve runaway *anxiety*. Offer both: packs first, metered overage as fallback.
4. **"Agents included" as a tier axis** (1 AI employee / 3 / unlimited) alongside minutes —
   matches the AI-Employees story and creates a natural per-employee expansion.
5. **A transactional entry SKU** below the subscription (Creato uses Studio packs; Denku's
   equivalent could be a $99–199 "AI Receptionist Setup + 14-day live trial" or a paid AI Audit
   — see docs 13/14).
6. **Everything-included honesty blocks** ("unlimited users · all channels · no hidden costs")
   — directly compatible with Denku's honesty-is-a-feature house rule.

## 4. What Denku should deliberately avoid

1. **Contact-sales-only pricing for the core product.** In the US SMB market, self-serve
   checkout with printed pricing is table stakes (Smith.ai, Goodcall, Synthflow all print
   prices); Creato's motion works in a relationship-sales culture and at their labor costs, not
   for a US self-serve SaaS with no sales team.
2. **"Starting from" asterisks** — reads as bait in the US; print the real number.
3. **Per-message pricing for voice.** Minutes are the honest voice metric (Denku already bills
   ceil-per-call minutes; keep, but *explain it on the pricing page*, per F-007).
4. **Copying the $749 voice anchor.** Denku's $149 starter is a *structural advantage* against
   both Creato and US voice-agency pricing ($250–500/mo typical for AI receptionists with
   white-glove setup); don't raise the floor — raise what the upper tiers *contain*.
5. **Hiding setup costs in proposals.** If Denku ever adds white-glove onboarding, price it as a
   visible, optional SKU.

## 5. Denku pricing architecture implications (input to doc 19)

- Keep plan floors ($149/$399/$899) but re-express tiers as **AI employees × channels × minutes/
  messages** rather than phone-lines × minutes.
- Add: one-click minute/message packs; a $0 "test-drive the AI on your own site/number" motion;
  an optional "Done-for-you setup" SKU (~$249 one-off, waived on annual); Studio-style creative
  packs only if/when doc 13's AI-Studio verdict is positive.
- Annual −15–20% with the discount *shown as monthly-equivalent*, Creato-style.
