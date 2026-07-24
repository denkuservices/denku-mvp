# Denku — Project Vision

> The long-term north star. This document describes what Denku **believes** — about its customers,
> its product, and how it should be built and run — not how it is currently implemented. It should
> stay true even after every file in this repo is rewritten. Where the current product contradicts
> this document, the *product* is wrong, not the vision (fix it, and record it in the roadmap).
> For *how we operate* toward this north star day-to-day, see `PROJECT_CHARTER.md`.
>
> A note on tone, earned the hard way: the audit program's most repeated finding was
> **fabrication** — claims the product couldn't back. This document must never become that. It
> states aspirations as aspirations and beliefs as beliefs. If a line here reads like marketing we
> can't stand behind, it doesn't belong.

---

# Why Denku Exists

For most businesses, a customer conversation is where revenue and trust are won or lost — and it is
the thing they are worst at covering. It starts on the phone, but it no longer ends there: it is also
an Instagram DM, a WhatsApp message, an email that never gets answered in time. A missed conversation
is not a missed message; it is a missed customer, a lost booking, a competitor's new client. Coverage
that is instant, 24/7, patient, and consistent across every channel is unaffordable and unreliable for
the businesses that need it most. Denku exists to close that gap: to make sure no business ever loses a
customer because no one answered — on any channel.

**Where we are today (stated honestly):** Denku's proven, shipping channel is **Voice** — a
provisioned number answered 24/7 that turns every call into a real outcome. **Instagram** is a
receive-only foundation. The mission and vision below are deliberately channel-agnostic — they are the
north star the product is evolving toward (the **AI Employees platform**), not a claim that every
channel ships today. The direction is set out in
[docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md](audits/AI_EMPLOYEES_PLATFORM_AUDIT.md); we will never
market a channel before it works.

# Mission

Give every business a tireless, trustworthy **AI workforce** — employees that answer every customer
conversation on every channel (voice, then chat, messaging, and email), understand what the customer
needs, and turn it into a real, actionable outcome — automatically, around the clock.

# Vision

A world where a small business has the same quality of customer communication as a large one — across
every way a customer reaches them. Where "we'll get back to you" is replaced by "it's already handled."
Where being reachable stops being a source of stress and dropped revenue, and becomes a dependable part
of how a business runs. A business hires an AI employee, connects the channels it lives on, and it is
covered.

# Long-Term North Star

**Every customer conversation — on any channel — captured, understood, and converted into the right
outcome, with the business always knowing exactly what happened.** Every decision, feature, and
trade-off is judged by whether it moves us closer to that. Not "calls answered" — *outcomes delivered
and made visible, everywhere the customer reaches out.*

# Ideal Customer Profile

We serve businesses for whom **a missed conversation is directly lost revenue** and who cannot
economically staff the phone the way they'd like: service businesses, local operators, clinics,
trades, and growing teams drowning in inbound. They are not AI enthusiasts; they are owners who
want the outcome, not the technology. We earn them by being dependable, not by being clever, and we
grow with them from a single line to many. We do not pretend to be enterprise-first before we have
earned it — we serve this customer excellently first.

# Product Philosophy

- **The product is the outcome, not the AI.** A ticket filed, an appointment booked, a lead
  captured, a business owner informed — that is the product. The voice model is a component.
- **Never dead-end.** Every finished conversation must produce a real artifact and a next step,
  even when the AI is uncertain or fails. A caller and a business should never be left with
  nothing. This is our deepest product commitment.
- **Reliability over cleverness.** A slightly less impressive answer that always works beats a
  brilliant one that sometimes vanishes.
- **The business is never in the dark.** If something happened on a call, the business knows —
  promptly, clearly, without having to go looking.

# AI Philosophy

- **AI is an employee, not a demo.** We are judged on how it performs on the thousandth real call,
  not the first scripted one.
- **Wrap probabilistic intelligence in deterministic guarantees.** The model may be uncertain; the
  system's outcomes must not be. Determinism, idempotency, and safe fallbacks surround the AI so
  its variance never becomes the customer's problem.
- **Honest about the boundary.** We are clear, to customers and ourselves, about what the AI can
  and cannot do today. We never sell a capability we don't have.
- **The model is replaceable; the trust is not.** We adopt better models as they come, but our
  value is the reliable system and the customer relationship around them, not any one model.

# Customer Experience Philosophy

- **Trust is the product.** A business is handing us its front door. Everything we show them must
  be true — real data, real status, real outcomes. A single fabricated screen costs more than a
  missing feature.
- **Prove value continuously, not just at signup.** The customer should feel the product working
  every week without logging in to check.
- **Fail loudly to us, gracefully to them.** When something breaks, the business gets a calm,
  honest message and a path forward — never a stack trace, never silence, never a surprise.
- **No unpleasant surprises about money or service.** Customers are warned before costs and before
  anything that would interrupt their service.

# UX Philosophy

- **Built for a busy, non-technical owner.** Clarity beats density. The important thing is obvious;
  the next action is obvious.
- **Dependable under failure, not just in the happy path.** The measure of our UX is how it feels
  when a call fails, a page errors, or data is empty — not only when everything works.
- **Every empty state is an onboarding moment,** every confirmation is predictable, every error is
  recoverable.
- **Respect the user's attention and access.** Accessible, fast, and honest about state — a
  spinner that lies about progress is a bug.

# Design Philosophy

- **Premium means coherent and truthful, not decorative.** One product, one intentional feel —
  never assembled-from-parts. Polish is the absence of seams, not the addition of ornament.
- **The interface must not lie.** No placeholder data dressed as real, no fake health indicators,
  no vanity metrics. What you see is what is true.
- **Restraint over flourish.** Confidence, clarity, and calm — the aesthetic of software a business
  trusts, not software that shouts.

# Engineering Philosophy

- **Idempotency-first.** Assume every event can happen twice. Correctness must not depend on it
  happening once.
- **Compensation over false transactions.** When work spans systems we don't control together, we
  roll back deliberately and leave no half-states — we never pretend a distributed action was
  atomic.
- **Fail open on access, fail closed on money.** Never trap a paying customer out over a transient
  glitch; never guess when dollars are involved.
- **Versioned truth.** The real behavior of the system lives in the repository, reviewable and
  testable — not in an unversioned corner of a database or a dashboard. What computes money or
  guards tenancy must be something a human can read and a test can prove.
- **Protect the hard-won core.** The reliability machinery — guarantees, leases, reconciliation,
  enforcement — is the part that's genuinely hard to get right. We extend it; we never casually
  regress it.
- **Multi-tenant safety is sacred.** One customer's data must never reach another's. This is a
  floor, not a feature.

# Business Philosophy

- **Sell only what exists.** Pricing, claims, and capabilities describe reality. Aspirations live
  on a roadmap, labeled as such.
- **Price aligned to delivered value,** transparently, with no traps and a visible way out.
- **Earn the tier before selling it.** We do not market enterprise promises we cannot keep; we
  build the substance, then sell it.
- **Retention is the business.** A customer who can see the value we deliver is the cheapest and
  most durable growth we have.

# Product Principles

1. Outcomes over interactions — deliver and surface the result, not just the conversation.
2. Never dead-end — always an artifact, always a next step.
3. Reliability is a feature, and usually the most important one.
4. Show only what is true.
5. The busy owner is the user — optimize for their clarity, not our sophistication.
6. Make the value visible without being asked.
7. Every surface degrades gracefully.

# Decision-Making Principles

- **When torn, choose the option that keeps trust.** Trust is the scarcest and least recoverable
  asset we have.
- **Prefer the reversible, measurable path** — and measure before optimizing; a decision made on
  data beats one made on conviction.
- **Weigh the thousandth call, not the first.** Optimize for the product at scale and under stress.
- **Honesty resolves ties.** If two paths are close, take the one that's easier to be truthful
  about with customers.
- **Preserve optionality on the model, invest in the moat around it** (reliability, data, trust).

# Things We Never Compromise

- **Truth.** No fabricated data, status, metrics, or capabilities — in the product or the market.
- **The never-dead-end guarantee.** No conversation is ever lost.
- **Tenant isolation.** One customer's data never touches another's.
- **Money integrity.** We never charge what we can't explain, and we never let a customer be
  surprised by cost or a service cut.
- **The customer's knowledge of their own business.** They always know what happened on their line.

# What Denku Is NOT

- **Not a chatbot toy or a demo** — it is an operational employee businesses depend on.
- **Not an AI agency or a build-your-own-agent platform** — customers buy an outcome, not a
  construction kit.
- **Not "AI for AI's sake"** — the intelligence is invisible plumbing behind a business result.
- **Not a dashboard of vanity metrics** — every number must mean something the owner can act on.
- **Not a product that goes silent** — it communicates outcomes, warnings, and failures.
- **Not a company that oversells** — the marketing never runs ahead of the product.

# Success Metrics

We measure ourselves by customer outcomes, not vanity:

- **Outcome capture rate** — share of real calls that produce a correct, useful artifact.
- **Time-to-first-value** — how fast a new customer experiences their AI handling a real call well.
- **Value visibility** — do customers know, without prompting, what the product did for them?
- **Trust integrity** — zero fabricated surfaces; zero silent service interruptions; zero
  cross-tenant incidents. (These are pass/fail, not trends.)
- **Retention and expansion** — customers staying and adding lines because the value is undeniable.
- **Billing correctness** — every invoice explainable from first principles.

Growth and revenue are outputs of these, not substitutes for them.

# 3-Year Product Direction

Directional arcs, not a feature list — each should still make sense even if the specifics change:

1. **From "answers calls" to "handles the conversation end-to-end"** — genuinely understanding
   intent and completing the outcome (booking, resolution, escalation), not just capturing it.
2. **From generic to business-aware** — the AI knows the business it represents: its hours,
   offerings, and how it wants to talk to customers, without heavy setup.
3. **From voice to the whole conversation** — meeting customers on the channels they use, with one
   coherent employee behind them.
4. **From reactive to proactive** — surfacing patterns, following up, and telling the business what
   its customers are trying to tell it.
5. **From SMB-excellent to enterprise-ready** — earning the trust surface (identity, auditability,
   data control, verifiable correctness) that larger customers require, in that order.
6. **From tool to system of record for customer conversations** — the trusted, complete, queryable
   memory of every interaction a business has with its customers.

Throughout, the constant is the north star: **every conversation captured, understood, converted,
and made visible — dependably enough that a business would stake its reputation on it.**
