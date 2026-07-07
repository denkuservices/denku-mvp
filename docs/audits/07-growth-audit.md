# Audit 07 — Growth Audit

- **Date:** 2026-07-06 · **Findings current as of:** 2026-07-06
- **Lens:** Head of Growth. Question: *does the funnel — discovery → landing → demo → pricing →
  signup → onboarding → paid → activated → expansion — convert, and can we even measure where it
  leaks?*
- **Scope:** marketing pages, CTA integrity, pricing honesty, demo-to-signup, signup friction,
  paywall placement, SEO/discovery, and conversion instrumentation.
- **Relationship to prior audits:** the funnel's *content* problems are largely filed (R-004
  pricing fiction, R-005 annual toggle, R-006 phone counts, R-007 hero CTA, R-015 paywall-before-
  value, R-039 social proof, R-029 demo end, R-011 forgot-password). This audit adds the two
  *mechanical* gaps — measurement and discovery — and maps the whole funnel.

> Living document (Rule 1). Canonical status: `docs/IMPLEMENTATION_ROADMAP.md`.

## The two mechanical gaps beneath every content fix

Audits 01/02 catalogued *what's wrong* on the funnel's surfaces. This audit finds the funnel has
no instruments and no front door for organic traffic — which means even after the content fixes,
Denku would be optimizing blind and starving for top-of-funnel.

### [R-066 — NEW, High] Zero conversion instrumentation — the funnel is unmeasured
There is **no analytics of any kind** in the codebase — no PostHog, GA, Segment, Plausible, Mixpanel,
or Vercel Analytics. Nothing tracks landing → demo, demo → signup, signup → verify, verify →
onboarding, onboarding → paid, or paid → activated. The team cannot answer the most basic growth
questions (Where do people drop? Does the demo convert? Which plan do people pick?), cannot run a
single A/B test, and cannot quantify the impact of any fix in this roadmap. Every other growth
finding is a hypothesis until this exists. *Direction:* add a lightweight product-analytics layer
with a defined funnel event schema (page_view, demo_started, demo_completed, signup_started,
signup_verified, onboarding_step_n, checkout_started, plan_activated, first_call_handled) before
optimizing anything. This is the single highest-leverage growth investment because it makes every
other one measurable.

### [R-067 — NEW, High] No SEO foundation — organic discovery is near-zero
The marketing site has genuinely good content pages (pricing, security, docs, support, use-cases,
company) but nothing to make them discoverable: **no `robots.txt`, no `sitemap.xml`, no per-page
metadata** (every marketing page inherits one site-level `title`/`description` from `siteConfig`),
no per-page Open Graph/Twitter cards, no canonical tags, and no structured data (JSON-LD). So every
page shares one generic browser tab title and one generic social-share card, and search engines get
no sitemap or per-page signals. For a category where buyers search ("AI receptionist," "AI answering
service for [trade]"), this leaves the entire organic channel on the table. *Direction:* per-page
`generateMetadata` (title/description/OG/canonical) on every marketing route, a `robots.ts` +
`sitemap.ts`, unique OG images, and Organization/Product/FAQ JSON-LD. Pairs with R-042 (a changelog
page is also an SEO asset).

### [R-007 — enriched] CTA integrity: "Get started free" with no free tier
Beyond the mislabeled hero "Book a demo" → signup (already filed), `Contact.tsx` renders a
**"Get started free"** CTA — but there is no free tier and no trial: every plan is $149+ and a card
is required at onboarding step 4 (R-015). A visitor who clicks "free" and hits a paywall is a
trust-losing bait-and-switch, the same failure mode as the annual toggle (R-005). Folded into R-007
(CTA integrity) as a second instance.

## Funnel Map (stage → drop-off risk → cause)

| # | Stage | Drop-off risk | Root cause (R-ID) |
|---|---|---|---|
| 1 | **Discovery** (organic/social) | 🔴 Near-total for organic | No SEO foundation (R-067); can't even see it (R-066) |
| 2 | **Landing** | 🟠 Strong asset underused | Hero CTA mislabeled; live demo is secondary not primary (R-007) |
| 3 | **Demo** ("Talk to Denku") | 🟠 Hot leads lost | Silent 5-min cutoff, no post-demo CTA, demo-callers uncaptured (R-029) |
| 4 | **Pricing** | 🔴 Trust collapse at the decision point | Fictional feature claims (R-004), fake annual toggle (R-005), phone-count mismatch (R-006), "Get started free" (R-007) |
| 5 | **Signup** | 🟢 Low friction (email + code) — **strength** | — (but unmeasured, R-066) |
| 6 | **Verify email** | 🟡 Bounce-and-lockout | Forgot-password dead-loop if they leave (R-011) |
| 7 | **Onboarding** | 🔴 Paywall before any personal value | Card required at step 4, no trial/taste (R-015) |
| 8 | **Payment** | 🟡 Expectation mismatch | Annual promised, monthly-only charged (R-005) |
| 9 | **Activation** | 🔴 Anticlimax + weak first call | Un-orchestrated go-live (R-014), generic agent (R-013) |
| 10 | **Retention / expansion** | 🔴 Silent churn, no loop | Product mute post-sale (R-008/R-017); no referral/expansion mechanic |

The shape: a **strong middle (signup) between a starved top (no discovery/measurement) and a leaky
bottom (paywall-before-value, silent activation, no retention loop).** Denku's best conversion
asset — the live demo — sits at stage 2/3 and is under-deployed; its worst trust leak — pricing
fiction — sits at stage 4, the decision point.

## Top 10 Highest-ROI Improvements (growth)

| # | Improvement | R-ID | Why |
|---|---|---|---|
| 1 | Conversion instrumentation + funnel event schema | R-066 | Makes every other growth bet measurable; prerequisite |
| 2 | Truth-align pricing + fix CTA integrity ("free", "Book a demo", annual) | R-004, R-007, R-005 | Stops trust collapse at the decision point |
| 3 | SEO foundation (metadata, sitemap, robots, OG, JSON-LD) | R-067 | Unlocks the entire organic channel |
| 4 | Make the live demo the hero + capture demo-callers | R-007, R-029 | Deploys the best asset at the top of funnel |
| 5 | Pre-paywall value / trial | R-015 | Fixes the biggest bottom-funnel leak |
| 6 | Post-purchase visibility (notifications + weekly digest) | R-008, R-017 | Retention is the cheapest growth |
| 7 | Orchestrated activation moment | R-014 | Converts payment into "wow" → retention + referral fuel |
| 8 | Real social proof (named case study) | R-039 | Substantiates claims at stage 4 |
| 9 | Public changelog/roadmap (SEO + trust asset) | R-042 | Momentum signal + indexable content |
| 10 | Fix forgot-password + add funnel-recovery emails | R-011 | Plugs verify-stage + reactivation leaks |

## Executive Summary

Denku's funnel has a strong middle and a starved top and leaky bottom, and — most importantly — no
instruments to see any of it. The two new findings are the mechanical prerequisites the content
fixes depend on: **you cannot optimize a funnel you cannot measure (R-066), and you cannot fill one
with no organic front door (R-067).** Both are modest, well-understood engineering. Sequenced
correctly, growth work is: (1) instrument the funnel, (2) stop the trust leaks at pricing/CTA
(R-004/005/007) that instrumentation will immediately expose, (3) open the organic channel
(R-067), then (4) deploy the demo harder and fix the paywall-before-value + silent-activation
leaks. The through-line with every prior audit holds: Denku's demo proves the product; the funnel
around it neither measures, discovers, nor honestly converts. Fix the mechanics and the honesty,
and the existing middle-funnel strength finally has traffic to work with.

## Action Items

| # | Action | R-ID | Priority |
|---|---|---|---|
| 1 | Add product analytics + defined funnel event schema | R-066 | High |
| 2 | SEO foundation: per-page metadata, sitemap, robots, OG, JSON-LD | R-067 | High |
| 3 | Fix CTA integrity incl. "Get started free" with no free tier | R-007 | Critical |
| 4 | Truth-align pricing; ship or remove annual | R-004, R-005 | Critical |
| 5 | Make demo primary + capture demo-callers | R-007, R-029 | Critical / Medium |
| 6 | Pre-paywall value / trial | R-015 | High |
| 7 | Retention loop: notifications + digest | R-008, R-017 | Critical / High |
| 8 | Social proof + public changelog | R-039, R-042 | Low |
