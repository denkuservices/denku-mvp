# Audit 02 — CEO / Product Audit: Premium Experience

- **Date:** 2026-07-06 · **Findings current as of:** 2026-07-08
- **Lens:** CEO + Founder + CPO + Head of CX of a >$100M ARR B2B SaaS. Core question: *does Denku
  feel like a premium product a business would happily trust with its customer communication?*
- **Method:** four-persona walkthrough — (1) first-time visitor, (2) new paying customer in
  onboarding, (3) daily active customer, (4) business owner deciding to buy. Implementation
  details out of scope.
- **Relationship to [Audit 01](01-ceo-product-audit.md):** same executive lens, deeper surface
  coverage (trust pages, auth screens, settings, states). Audit 01 findings are referenced by
  R-ID, not re-filed. New evidence gathered here: marketing security/docs/support pages, login/
  forgot-password, settings (API keys, integrations, danger zone, account security), loading
  states, dashboard help affordances.

> Living document (Rule 1). Canonical status lives in `docs/IMPLEMENTATION_ROADMAP.md`.

## Persona 1 — The first-time visitor

**What works:** The landing page has genuine character — the warm editorial theme, the Spline
robot, and above all the live "Talk to Denku" demo (still the best asset; still not the primary
CTA — R-007). Navigation and footer are coherent; Privacy/Terms exist; the pricing structure
(concurrency-based) is genuinely easy to grasp.

**What breaks trust — the deeper you look, the worse it gets.** Audit 01 caught the pricing-page
fiction (R-004). This audit finds the fiction is not a pricing problem; **the entire trust surface
is fabricated**, and it escalates with buyer diligence:

- **Docs page** (`web/src/app/(marketing)/docs/page.tsx`): a four-step "getting started" for a
  product that doesn't exist — "Connect Tools: CRM, calendars, helpdesk, or custom APIs via
  webhooks", "Deploy Voice/Chat" (there is no chat product), FAQ claiming "Scale plans include
  full API access" and "custom model configurations."
- **Support page** (`support/page.tsx`): invents an SLA ladder ("Priority handling" on Growth,
  "Contractual SLA" on Scale) and troubleshooting answers for features that don't exist ("Copy
  your webhook secret from agent settings. Verify HMAC-SHA256 signature using the X-Signature
  header").
- **Security page** (`security/page.tsx`): "immutable timestamps," "RBAC with granular
  permissions… define custom roles," "SOC 2-ready infrastructure," per-plan retention
  (30/90/custom days), and — painfully, given R-001 — "Signed webhook requests with HMAC
  verification." The one honest line on the page is SSO/SAML marked "(Roadmap)."

A serious buyer's diligence path is *pricing → security → docs*, and every step deepens the
fiction. This broadens **R-004** from "pricing bullets" to "all four marketing trust surfaces"
(entry updated in the roadmap). Nothing else on the marketing site matters until this is fixed.

## Persona 2 — The new paying customer (signup → onboarding → live)

**What works:** Email-only signup with an 8-digit code is admirably low-friction. The wizard's
six steps are well-labeled and well-paced ("Claim your AI line," "Choose your capacity"). Login is
clean, "Keep me logged in" and proper autocomplete included.

**Cracks at the worst moments:**
- **"Forgot Password?" is a dead loop** — it links to `/login?forgot=1`, which nothing handles;
  the page simply reloads (`app/(auth)/login/page.tsx:92`). A visibly broken promise at the exact
  moment a user is already frustrated. Worse than the link being absent. (Enriches **R-011**.)
- The paywall-before-value sequencing (R-015), the un-orchestrated go-live moment (R-014), and the
  business-context-free agent (R-013) remain the defining activation gaps — unchanged since
  Audit 01, still the difference between "wow" and refund.
- Activation shows raw failure strings on error (R-021/R-025).

## Persona 3 — The daily active customer

**What works (more than expected):** The **Analytics page is real** — range comparisons, KPI
grid, outcome breakdown, insights panel, tickets funnel, role-gated CSV export. Tickets have
filters, comments, activity trails, quick actions. Calls have transcripts and a detail view.
Account security genuinely works (password change, sign-out-all-devices via real auth calls).
These deserve protection as strengths.

**What corrodes daily trust:**
- **Potemkin screens inside the paid product** (**R-046**, Critical — **RESOLVED 2026-07-08, Task 7**):
  - Settings → API keys rendered **hardcoded fake credentials** — `pk_live_1234567890abcdef` /
    `sk_live_abcdef1234567890`, masked to look real, with a disabled "Rotate keys" button
    (`settings/workspace/keys/page.tsx`). A customer who copies these into their stack gets
    silent failure; a customer who recognizes them as fake never trusts a screen again.
    **→ screen deleted.**
  - Settings → Integrations displayed **fabricated health statuses** — "Voice infrastructure:
    Connected", "Webhooks: Healthy" — hardcoded strings checking nothing
    (`settings/integrations/page.tsx`). Fake observability is worse than none: during a real
    incident this screen will say "Healthy." **→ fake cards removed; honest CRM/Calendar
    "coming soon" kept.**
  - Workspace → Danger zone: type DISABLE, confirm — and receive "Workspace disable is not yet
    available in MVP" (**R-049** — **RESOLVED 2026-07-08**; the control was in fact already orphaned
    (unrendered), and the `DangerZoneCard` file is now deleted). A safety-critical control that was
    theater.
- **Support is a dead end** (NEW — **R-047**): the profile menu's "Help / Support" drops a paying
  customer onto the *marketing contact form*. No in-app help, no docs from the dashboard, and the
  fictional support tiers (R-004) route nowhere. For $149–899/mo this is below the floor.
- **Loading states are not premium** (NEW — **R-048**): the phone-lines page ships a literal
  `Loading…` div with a comment "Temporarily sterile for debugging route hang issues"; data-heavy
  pages show a centered spinner instead of skeletons. Placeholder pages (R-012), silent
  notifications gap (R-008), 200-row list caps (R-023), and dashboard data-honesty issues (R-018)
  complete the daily-use picture — all previously filed, all still open.

## Persona 4 — The business owner deciding to buy

The buying decision fails on evidence, not desire. The pitch ("never miss a call") is strong and
the demo proves the core magic. But: no named customers or case studies (R-039), a security page
that will not survive one probing question from anyone technical (R-004), no self-serve trial or
taste of *their* configured agent (R-015), support promises that contradict the product (R-047),
and — if they get as far as a paid pilot — fake API keys in settings (R-046). The owner who buys
anyway does so *despite* the product's trust surfaces, on the strength of the demo alone.

## Scorecard

| Dimension | Grade | Reasoning |
|---|---|---|
| Conversion | C+ | Demo is a genuine asset; CTA mislabels (R-007) and fictional claims (R-004) tax every visit |
| Activation | C− | Good wizard mechanics; paywall-before-value (R-015) and generic first call (R-013) unchanged |
| Retention | D | Product is silent (R-008), agent is generic (R-013), support is a dead end (R-047) |
| Trust | **D−** | Downgraded from D+ (Audit 01): fiction extends to docs/support/security pages AND into the paid product (R-046/R-049) |
| Perceived value | C | Analytics is genuinely good; value still invisible between logins |
| Usability | B− | Clean flows, real settings actions; loading states and dead ends drag it down |
| Enterprise readiness | F | Unchanged; the security page now actively *harms* diligence instead of merely lacking substance |

## Executive Summary

Denku's core loop is real and its analytics, ticketing, and wizard mechanics are better than its
reputation-surfaces suggest. But this audit's central discovery is that the trust problem is
systemic, not cosmetic: **fabrication is a pattern across four marketing pages and three
in-product screens** — fictional SLAs, fictional security controls, fake API keys, fake health
statuses, a no-op danger zone, and a forgot-password link that loops to itself. Individually each
is small; together they teach every attentive user the same lesson: *what this product shows you
may not be true.* That lesson is fatal for a product asking businesses to hand over their phone
line. The fix is not more features — it is a one-week **truth pass** (delete or de-claim every
fabricated element: R-004, R-046, R-047, R-049, R-011) followed by the already-filed activation
work (R-013/014/015). Premium feel is earned by honesty first, polish second.

## Product Score: 4.5 / 10

The engine (calls → artifacts → analytics) would score 7; the trust envelope scores 2. A premium
B2B product is judged at its weakest trust moment, and Denku's weakest moments — fake keys, fake
"Healthy" statuses, dead forgot-password — sit exactly where skeptical buyers look. 4.5 reflects
a real product wrapped in surfaces that undermine it; the score moves to ~6.5 on the truth pass
alone, and past 7.5 with the activation trilogy (R-013/014/015).

## Biggest Strengths (preserve these)

1. The live "Talk to Denku" demo — best-in-class proof-of-product for this category.
2. The deterministic value loop: every call produces a ticket/appointment + lead, reliably.
3. Analytics depth (comparisons, funnels, insights, export) — unusually real for this stage.
4. Onboarding wizard structure and copy rhythm ("Claim your AI line").
5. Concurrency-based pricing model — simple, honest capacity story.
6. Real account security actions (password change, sign-out-all) — a working trust surface to
   build on.

## Biggest Weaknesses

1. Systemic fabrication across trust surfaces (R-004, R-046, R-049) — the defining finding.
2. Product silence after purchase (R-008/R-017) — value invisible between logins.
3. Generic first call — the agent knows nothing about the business (R-013).
4. Paywall before any personal value moment (R-015).
5. Support dead end inside a $149–899/mo product (R-047).
6. Dead/broken basics: forgot-password loop (R-011), invites 401 (R-010), placeholder pages (R-012).

## Top 10 Highest-ROI Improvements

| # | Improvement | R-ID | Why it's top-10 |
|---|---|---|---|
| 1 | Truth pass on all marketing pages (pricing, docs, support, security) | R-004 | S effort, removes legal risk + biggest trust leak |
| 2 | ✅ Done — removed fake API keys + fabricated integration statuses | R-046 | S effort, ends in-product deception |
| 3 | Ticket/appointment notification emails | R-008 | M effort, makes the core value visible |
| 4 | Fix forgot-password (link currently dead-loops) | R-011 | M effort, unblocks locked-out customers |
| 5 | Business-context questions → agent prompt | R-013 | M effort, transforms the decisive first call |
| 6 | Orchestrated "call your number now" go-live moment | R-014 | M–L effort, converts activation into wow |
| 7 | Overage warnings + pause-vs-bill choice | R-009 | M effort, prevents catastrophic silent shutdowns |
| 8 | Real support path from the dashboard | R-047 | S–M effort, floor-level expectation at this price |
| 9 | Fix hero CTA / make demo primary | R-007 | S effort, direct conversion lift |
| 10 | ✅ Done — removed placeholder pages + no-op danger zone | R-012, R-049 | S effort, stops advertising unfinishedness |

## What would prevent a $100M SaaS from shipping this today?

1. **Fabricated compliance/security claims** (R-004) — legal would block the release outright;
   HIPAA/SLA/SOC-2-adjacent claims without substance are actionable, not just embarrassing.
2. **Fake credentials and fake health data in the paid product** (R-046) — fails any "don't lie
   to the user" bar; would not survive design review, let alone ship review.
3. **A customer's phone line can go dead with zero warning** (R-009) — an SEV-1 generator.
4. **Broken account recovery** (R-011) and **broken team invites** (R-010) — table-stakes flows
   that fail visibly.
5. **No notification of the product's core output** (R-008) — the product's value proposition is
   unverifiable by its own customers without logging in.
6. (From Audit 00, noted for completeness despite this audit's no-code scope: an unauthenticated
   ingestion webhook, R-001, would independently block ship.)

## If this product were acquired tomorrow, what would reduce its valuation?

- **Misrepresentation risk:** every fabricated claim (R-004, R-046) becomes a reps-and-warranties
  problem and a rebranding cost; an acquirer discounts for the cleanup and the churn cohort
  acquired under false pretenses.
- **Churn opacity:** no notifications/digest means customers likely don't know what they're paying
  for — an acquirer will model high dormant-churn risk in the revenue base.
- **Technical diligence hits** (via Audit 00): unauthenticated webhook (R-001), no tests (R-037),
  schema not reproducible from the repo (R-031), single-provider hard-coupling to Vapi with
  hardcoded artifact IDs — each shaves multiple turns off the multiple.
- **No enterprise motion** despite enterprise-tier pricing (R-045): the $899 tier's promised
  differentiators don't exist, so the top of the revenue mix is the least defensible.
- **Founder-dependent ops:** platform administration runs on Basic-Auth'd internal endpoints and
  environment-coupled IDs — key-person risk an acquirer prices in.

## Action Items

| # | Action | R-ID | Priority |
|---|---|---|---|
| 1 | Truth-align pricing, docs, support, and security marketing pages | R-004 | Critical |
| 2 | ✅ Done 2026-07-08 — removed fake API keys screen + fabricated integration statuses | R-046 | Critical |
| 3 | Fix forgot-password dead loop with a real reset flow | R-011 | Critical |
| 4 | Ship ticket/appointment notifications | R-008 | Critical |
| 5 | Overage warnings + explicit hard-cap choice | R-009 | Critical |
| 6 | ✅ Done 2026-07-08 — removed placeholder pages and the no-op danger zone | R-012, R-049 | Critical / Medium |
| 7 | Real dashboard support path (help link, docs, plan-appropriate contact) | R-047 | Medium |
| 8 | Business-context onboarding → agent prompt | R-013 | High |
| 9 | Orchestrated go-live call moment | R-014 | High |
| 10 | Pre-paywall taste of the customer's own agent | R-015 | High |
| 11 | Consistent, skeleton-based loading states; remove debug leftover | R-048 | Medium |
| 12 | Data-honesty pass on dashboard metrics | R-018 | High |
