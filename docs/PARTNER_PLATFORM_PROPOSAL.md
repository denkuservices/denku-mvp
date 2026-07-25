# Partner Platform — Research, Architecture & Recommendation

> **Status: research + proposal only. No code, no schema change, no roadmap items.**
> Written 2026-07-25. Brief: challenge the "Affiliate" framing, research how the best SaaS companies
> model partnerships, and design something that still makes sense if Denku becomes very large — or say
> honestly that it shouldn't exist.

---

## 0. Verdict up front

1. **"Affiliate" is the wrong abstraction.** Not because it's too small — because it's a *compensation
   mechanism*, not a *relationship type*. Modelling it as a role bakes one point of a three-axis space
   into the schema and blocks every other partner shape.
2. **A generic Partner model is right — but Denku should not build a Partner Platform now.** With zero
   paying customers, partners have nothing to sell. Partners *amplify* a working motion; they cannot
   create one.
3. **However, three decisions are cheap today and expensive-to-impossible later.** Those I would make
   now. One of them is a genuine architectural blocker that also has non-partner value.

---

## 1. Research — how the best SaaS companies actually model this

Stripping the marketing names away, every mature program is a combination of answers to **three
orthogonal questions**, not a list of partner "types":

| Axis | Options |
|---|---|
| **Who owns the customer relationship?** | Vendor · Partner |
| **Who owns billing?** | Vendor bills customer · Vendor bills partner (wholesale) · Partner bills customer |
| **Who operates the product?** | Customer · Partner · Both |

Mapped onto real programs:

| Company | Program | Relationship | Billing | Operation | The interesting bit |
|---|---|---|---|---|---|
| **Shopify** | Partners | Vendor owns | Vendor bills merchant | **Partner operates, then hands over** | Partner builds the store *before* the merchant owns it; recurring rev-share while the merchant stays. Cross-account access is the core primitive. |
| **HubSpot** | Solutions Partners | Both models offered | Referral *or* resell | Partner often operates | Explicitly separates **refer** from **resell**; tiers driven by *retained* MRR, not sales. |
| **Twilio** | ISV / subaccounts | Vendor owns | Parent pays | Partner operates | **Subaccounts**: one partner account, N isolated customer subaccounts, consolidated billing. |
| **AWS / Azure** | CSP + Marketplace | **Partner owns** | Partner bills at own margin | Partner operates | True resale. Vendor may never meet the end customer. |
| **Stripe** | Connect | Partner owns | Partner bills | Partner operates | The extreme: vendor becomes infrastructure. |
| **Notion / Vercel** | Consultants, certified agencies | Vendor owns | Vendor bills | Partner operates | Directory + certification, little/no commission. Distribution via *credibility*. |
| **Classic affiliate** | Link + coupon | Vendor owns | Vendor bills | Customer operates | The thinnest possible relationship. |

**The pattern:** the serious programs differ on *ownership and operation*, and treat commission as a
policy attached to the relationship. The weak ones start with commission and never grow past it.

---

## 2. Why "Affiliate" is the wrong abstraction (the rigorous argument)

An affiliate is exactly one cell of that space:

> `relationship = vendor-owned` · `billing = vendor→customer` · `operation = customer`

Encode that as a **role** and you have hard-coded a single cell. The failure mode is predictable and I
have watched this repo do the equivalent twice already:

- When an agency arrives ("I manage 30 restaurants"), *operation* must change → the affiliate model
  can't express it → a second parallel system appears.
- When a reseller arrives ("I want wholesale, I'll bill them"), *billing* and *ownership* change →
  a third system.
- Now attribution, commissions and payouts exist in three places and disagree.

**This is the same class of error as the pre-Sprint-4.5 channel handling:** Voice and Instagram were
modelled as separate products instead of instances of one abstraction, and every new channel would
have multiplied the bolt-ons. "Affiliate" is `phone_lines`. **Partner** is `channels`.

**The correct abstraction:** one **Partner** entity, with the relationship expressed as *capabilities
and policies* — exactly the pattern Sprint 7 proved for channels:

```
Partner            identity, legal entity, payout account, tier, status
PartnerCapability  can_refer · can_manage · can_resell        (the three axes, as data)
PartnerLink        partner ↔ org, with: attribution, ownership, commission policy, lifecycle
```

An affiliate is then simply a Partner with `can_refer` and nothing else. An agency adds `can_manage`.
A reseller adds `can_resell`. **Adding a partner type becomes configuration, not a new subsystem.**

---

## 3. What actually fits Denku (and why it isn't affiliates)

Denku's value is not self-serve-obvious. It requires **configuration**: business context, prompt
tuning, voice/language, phone provisioning, channel connection, testing on real calls. That
configuration *is labour* — and labour is precisely what agencies sell.

So Denku's highest-value partner is **not** a blogger with a link. It is:

> **The local marketing agency, MSP or telephony reseller that sets up and tunes AI Employees for
> 10–100 small businesses.**

They bring three things an affiliate never does: (a) implementation labour Denku would otherwise
carry, (b) *retention* — a configured, tuned employee doesn't churn, and (c) a repeatable vertical
playbook ("dental practices in Ontario").

**This matters architecturally**, because the agency needs the one thing affiliates never need:
**access to many customer workspaces from one login.**

### The blocker, verified in production

```
profiles.org_id  →  a single scalar. One human belongs to exactly ONE workspace.
No membership table. No partner/referral tables.
```

An agency managing 30 clients would need **30 separate logins**. Every serious partner motion — and
several *non-partner* needs (a franchise with 4 locations, an owner's bookkeeper, Denku's own support
staff assisting a customer) — is blocked by this single design decision.

**This is the same shape as the Sprint 8 manifest finding:** cheap to fix before there's data,
expensive and risky after thousands of accounts exist.

---

## 4. Trade-offs and the traps

| Question | My position |
|---|---|
| **Customer ownership** | **Denku must keep the direct relationship.** With no brand yet, letting a reseller own the customer means financing someone else's business — and if they churn, Denku loses customers it never met. Revisit only once the brand has independent pull. |
| **Commission: bounty vs recurring** | **Recurring rev-share, with a clawback window.** Denku's risk is churn, not acquisition. A one-time bounty pays maximally for a customer who leaves in month two; recurring pays the partner only while the customer stays — perfectly aligned. |
| **Multi-level / sub-affiliates** | **No. Never.** MLM structures attract fraud, create securities/marketing-compliance exposure, and signal low quality to exactly the B2B buyers Denku wants. Essentially no serious B2B SaaS does this. |
| **Build payouts?** | **Buy, don't build.** Payouts mean tax forms (W-9/W-8BEN), 1099-NEC/1042-S, international rails, thresholds, reversals, sanctions screening. It is a compliance product, not a feature. Use Stripe Connect Express, or a partner platform (PartnerStack / Rewardful / Tolt) until volume justifies otherwise. **Building this in-house would be a serious mistake at any near-term scale.** |
| **Fraud** | The real vectors: self-referral (partner signs up as their own customer), incentivised churn-and-rejoin, coupon leakage to organic traffic, and fake orgs farming trial credit. Controls: attribution captured **at signup and immutable**, one attribution per org for life, payout only after *N* days of *retained paid* revenue, clawback on refund/chargeback, and manual review above a threshold. |
| **Coupon vs referral code** | Different objects, commonly conflated. A **coupon** changes price (billing concern). A **referral code** changes attribution (partner concern). Keep them separate and let a partner offer optionally carry both. |
| **Reseller pricing** | Wholesale implies a price book per partner. Genuinely complex; defer until a reseller exists and is asking. |
| **Technology partners** | Different animal — no commission, no attribution. In Denku's architecture a technology partner is **a channel adapter or a tool** (Sprint 7 registry + R-111). Do not model them as commercial partners. |

---

## 5. Recommendation

### Do **not** build a Partner Platform now

- **No product-market fit to amplify.** Denku has **zero paying customers** and, per the
  first-paying-customer audit, its core promise isn't even deployed. Asking an agency to stake client
  relationships on that is asking them to damage their own reputation.
- **It is a second product**, not a feature: portal, attribution, commission ledger, payouts, tax,
  fraud review, partner support, T&Cs.
- **It would repeat this repo's central mistake.** Five sprints of good architecture went unshipped;
  the bottleneck is deployment. A partner platform is the most sophisticated possible way to avoid
  turning the product on.

### Do make three cheap decisions now

1. **Multi-org membership** — replace the implicit "one user, one org" with a membership relation
   (`user ↔ org`, with a role). **Recommended regardless of partners**: franchises, bookkeepers, and
   Denku's own support staff all need it, and today "help me look at my account" is impossible.
   *Cheap now (few accounts), painful later.*
2. **Capture attribution at signup** — a nullable "where did this workspace come from?" (source,
   code, first-touch timestamp) written once, immutable. **This is the manifest-provenance lesson
   again**: unrecorded attribution is unrecoverable, and it costs one column. Without it, launching a
   partner program later means every pre-existing customer is unattributable.
3. **Never name anything "affiliate"** in schema, URLs or UI. Use **Partner**. Renaming a
   customer-facing concept later is far more expensive than choosing the general noun today.

**Cost:** roughly one small migration and a signup-form field. **Value:** every partner model stays
open, and #1 is independently useful.

### Trigger conditions — build it when *all* are true
- ≥ 20–30 paying customers with a **measured** retention curve (partners must be sold a real outcome);
- ≥ 3 inbound partner requests **unprompted** (demand-pull, not push);
- a repeatable, documented setup playbook (otherwise partners create support load, not leverage);
- Denku can articulate partner economics from real LTV — not a guessed 20%.

**First build when triggered:** the **agency/managed model** (multi-org access + a partner-scoped
client list), *not* affiliates. It matches how Denku's value is actually delivered, and it produces
better-retained customers. Referral/affiliate is then a *reduced* configuration of the same Partner —
which is exactly the point of the abstraction.

---

## 6. If I'm wrong

The strongest counter-argument: **partners can be a discovery channel** — agencies talking to hundreds
of SMBs would teach Denku which verticals convert, faster than direct selling. That's real. But it
argues for **talking to 3–5 agencies as design partners**, not for building a partner *platform*.
Conversations produce that learning; portals and payout ledgers do not.

**Summary:** the instinct is right and early — the abstraction should be **Partner**, not Affiliate;
the first partner should be an **agency**, not a referrer; the platform should be built **after**
product-market fit; and the only thing worth doing today is **multi-org membership + immutable
attribution**, because those are the pieces that cannot be added retroactively.
