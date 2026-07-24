# Denku — Project Charter

> The operating principles of Denku as a company and engineering organization: *how we decide, ship,
> measure, and hold the line.* Where `docs/PROJECT_VISION.md` says what Denku believes, this charter
> says how we operate to get there. It governs day-to-day trade-offs; when it and the vision
> disagree, the vision wins and this charter is corrected.

---

# Product Scope

**In scope:** a self-serve **AI Employee** that answers a business's inbound conversations 24/7,
understands the customer, and turns each conversation into a real outcome (ticket, appointment
request, captured lead) that the business can see and act on — plus the dashboard, billing, and
settings that surround it. **Voice is the proven, production-ready channel today; Instagram is a
receive-only secondary channel.** As of Sprint 4.5 the product is built on a **channel-agnostic
platform model** (Employee · Channel · Conversation · Contact · Artifact) so new channels are
adapters, not new products — but a channel is only "in scope" once it actually works and is not
over-claimed (see `skills/platform-architecture.md`).

**Adjacent, sequenced later** (on the arc, not over-claimed until shipped): additional channels
(WhatsApp, Email, SMS, Web Chat) as adapters over the shared model, the platform UX (unified inbox,
Employee/Contacts/Channels surfaces), richer business-awareness, outbound/proactive follow-up, and
enterprise trust surfaces.

**Out of scope:** being a build-your-own-agent platform, an AI agency/service, or a general
chatbot. We sell an outcome, not a toolkit. (See `PROJECT_VISION.md` → "What Denku Is NOT.")

# Business Goals

1. Make each served customer's phone a reliable revenue channel, and prove it to them continuously.
2. Grow through retention and expansion (more lines, more value) before top-of-funnel spend.
3. Keep pricing honest and value-aligned — every dollar charged is explainable and every claim is real.
4. Earn the enterprise tier's substance before selling it.

# Engineering Goals

1. Protect the reliability core (deterministic artifacts, idempotency, compensation, leases, pause
   enforcement, reconciliation) — extend, never casually regress.
2. Move the truth of the system into the repository — schema, money math, and config are
   reviewable and testable, not stranded in a database or a dashboard.
3. Make tenant isolation provably safe, not merely disciplined.
4. Ship changes safely: verify live state before writing to external systems; test before refactor.

# Customer Success Goals

1. Every customer reaches first real value fast — their AI handling a live call well, early.
2. No customer is ever surprised by cost or a service interruption.
3. The value delivered is visible without the customer going looking for it.
4. Support is real and reachable from inside the product, matched to what we honestly promise.

# Success Metrics

Outcome-oriented, not vanity (mirrors `PROJECT_VISION.md` → Success Metrics):

- **Outcome capture rate** — share of real calls that produce a correct, useful artifact.
- **Time-to-first-value** — signup → first well-handled real call.
- **Value visibility** — do customers know what the product did for them, unprompted?
- **Retention & expansion** — customers staying and adding lines.
- **Billing correctness** — every invoice explainable from source.
- **Trust integrity** (pass/fail): zero fabricated surfaces, zero silent service interruptions,
  zero cross-tenant incidents.

# KPI Framework

| Layer | Question it answers | Example indicators |
|---|---|---|
| **North-star** | Are we delivering visible outcomes? | Outcome capture rate; value-visibility |
| **Activation** | Do new customers reach value? | Time-to-first-value; onboarding completion; first-call quality |
| **Retention** | Do they stay because it works? | Logo/revenue retention; line expansion; digest engagement |
| **Reliability** | Is the product dependable? | Call-handling success; error/incident rate; uptime |
| **Integrity (gates)** | Are we safe and honest? | Fabricated-surface count (=0); cross-tenant incidents (=0); billing variance |

Rule: an **Integrity gate that is non-zero overrides all growth KPIs** — we fix it before we
optimize anything else. KPIs are meaningful only once instrumented (today they are not — this is a
known prerequisite, not an assumption that data exists).

# Release Strategy

- **Trunk-based, small, reversible changes.** Prefer many safe increments over big-bang releases.
- **Verify live state before writing to Vapi/Stripe/Supabase**; stage anything that touches live
  call ingestion or billing so it can be rolled back without customer impact.
- **Never regress the core.** Every release checks the "do not regress" list.
- **Docs ship with the change** — a change isn't done until the roadmap/skills/sprint are current.
- **Feature flags / progressive rollout** for anything that changes customer-visible behavior at scale.

# Prioritization Framework

Decide in this order (higher tier always wins):

1. **Integrity** — truth, tenant isolation, money integrity, never-dead-end. Non-negotiable; fix first.
2. **Safety & correctness** — security holes, data correctness, reliability.
3. **Trust & honesty** — remove anything the product misrepresents.
4. **Activation & retention value** — the things that make customers reach and see value.
5. **Growth & reach** — funnel, discovery, expansion.
6. **Polish & optimization** — performance, cohesion, refactors (sequenced behind their prerequisites).

Within a tier, order by **(customer impact ÷ effort)**, and prefer the reversible, measurable path.
The roadmap's Critical/High/Medium/Low priorities and the execution plan's category sequencing
implement this framework.

# Risk Tolerance

- **Zero tolerance:** cross-tenant data leakage, charging customers incorrectly, fabricating data
  or claims, silently cutting off a customer's service. These are never acceptable trade-offs.
- **Low tolerance:** shipping to external systems (Vapi/Stripe/DB) without verifying live state;
  refactoring untested critical paths.
- **Deliberate tolerance:** shipping an honest, narrower product early; visible "coming soon" over
  fake completeness; incremental hardening of known non-critical debt in the open.

# Definition of MVP

A capability is MVP-complete when it delivers a **real, correct outcome the customer can see**, end
to end, for the common case — even if narrow. MVP is about *honest completeness of one path*, not
breadth. An MVP may say "coming soon"; it may never show fake data, dead-end the user, or claim a
capability it lacks.

# Definition of Production Ready

Beyond MVP, production-ready means:

- **Authenticated & tenant-scoped** — no unauthenticated write paths; every query scoped to its org.
- **Idempotent & recoverable** — safe under retries; fails open on access, closed on money; no half-states.
- **Observable & tested** — meaningful logs/metrics and automated tests over its critical behavior.
- **Truthful under failure** — graceful, honest error and empty states; no leaked internals.
- **Explainable** — anything touching money or tenancy is reviewable from the repo and reconciles to source.
- **Documented** — roadmap/skills reflect it; the "do not regress" core is preserved.

# Decision Ownership

| Decision type | Owner | Consulted |
|---|---|---|
| Product scope, roadmap priority, pricing | Product/Founder | Engineering, Growth |
| Public claims / compliance representations | Founder + **legal counsel** | Product |
| Architecture, security posture, release gating | Engineering lead | Product |
| What "done" means for a change | Implementing engineer (against this charter's DoD) | Reviewer |
| Integrity-gate breaches | Whoever finds it **stops and escalates** | Everyone |

Principle: **decisions are made by the accountable owner, but an integrity concern can be raised by
anyone and halts the work until resolved.**

# Documentation Standards

- **One source of truth per fact:** vision = beliefs · charter = operating principles · roadmap =
  findings/backlog & status · sprint = what's in flight · skills = how subsystems work · audits =
  evidence & judgment · retrospective = confidence/limits · execution plan = safe sequencing.
- **Stable IDs:** findings are permanent `R-###`; never reuse or renumber. Audits are permanent
  `NN-…`.
- **Living, current, non-duplicative:** describe the present, not history (git is the archive);
  update in place; cross-reference instead of copying.
- **Docs are part of the change** — synchronize them in the same commit that changes behavior.
- **Honesty in docs too:** distinguish "found by reading" from "confirmed by running"; label
  estimates and assumptions.

# Continuous Improvement Process

- **Audits** (per `AUDIT_PLAYBOOK.md`) surface findings → the **roadmap** tracks them → the
  **execution plan** sequences them → **sprints** deliver them → completion updates the roadmap and,
  where relevant, the retrospective (assumptions graduate to facts).
- **Every fix updates the docs it touches**; every confirmed/refuted assumption updates
  `RETROSPECTIVE.md`.
- **Re-audit a lens** (same audit number, living document) when a surface changes materially or a
  fix needs verification — don't fork a new file.
- **Instrument, then optimize** — decisions get better as real data replaces inference.
- **Retro after each sprint:** what shipped, what we learned, what to change in how we work.

## Sprint Lifecycle — the closing ritual (run at the end of every sprint)

When a sprint's tasks are complete, execute these steps **in order, every time** — the boundary
between sprints is a repeatable, auditable ritual, not an ad-hoc wrap-up:

1. **Close the sprint** in `CURRENT_SPRINT.md` with an **honest DoD status** — explicitly separate
   *engineering-done* (code shipped, CI green, docs synced) from *operationally-verified* (live
   test, operator/env actions). Never mark full DoD sign-off while operator/live-verification items
   remain; list them as a handoff instead.
2. **Update `docs/IMPLEMENTATION_ROADMAP.md`** — mark IDs `Completed`/`In Progress` (date + how),
   refresh the status table, the do-first shortlist, and "Last updated".
3. **Update `docs/EXECUTION_PLAN.md`** if priorities or sequencing changed.
4. **Write `docs/SPRINT_<N>_REVIEW.md`** — planned vs delivered · completed roadmap IDs · remaining
   external/operator tasks · regressions · metrics · lessons learned · recommendations for the next
   sprint — and add a Sprint-N section to `docs/RETROSPECTIVE.md`.
5. **Commit everything** (Conventional Commit), push, verify CI + the Vercel build gate.
6. **Then prepare the next sprint from the roadmap** — draft its goal/tasks/DoD into
   `CURRENT_SPRINT.md` marked **`PROPOSED — awaiting approval`**, drawn from the roadmap's do-first
   shortlist, the prior sprint's Next-Sprint Preview, and the review's recommendations.

**Hard rule:** preparing the next sprint (drafting the plan) is automatic; **starting
implementation requires explicit human approval.** A prepared sprint stays `PROPOSED` until the
owner approves or adjusts scope.
