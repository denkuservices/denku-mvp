# Denku Audit Playbook

> **The official audit standard for this repository.** Every audit — by any future Claude session
> or human — follows this playbook. It operationalizes the documentation system built on
> `CLAUDE.md`, `CURRENT_SPRINT.md`, `docs/IMPLEMENTATION_ROADMAP.md`, `docs/audits/`, and
> `skills/`. The short rules in `docs/audits/README.md` summarize this document; where they ever
> disagree, this playbook wins.

---

# The "Begin Audit XX" command

**This playbook is designed so that the only instruction a session ever needs is
`Begin Audit XX`** (e.g. "Begin Audit 03"). Everything required to run that audit to completion —
which lens, whose eyes, what to inspect, what to produce, and how to file it — is resolved from the
number by the procedure below. No further human input is required. If a human *does* add scope
(e.g. "Begin Audit 03, focus on the mobile experience"), treat it as a narrowing overlay on top of
the resolved brief, not a replacement.

**Resolution procedure (deterministic):**

1. **Resolve the number → lens.** Look up `XX` in the **Audit Register** below.
   - If `XX` is listed, use its assigned **Category** and any register notes.
   - If `XX` is the next unlisted number, take the **next `Planned` row** in the register and use
     that category (then mark it in-progress in the register as part of the audit).
   - If `XX` equals an already-`Completed` number, it is a **re-audit/refresh** of that lens:
     re-run the same category brief, compare against the existing audit's findings, update those
     findings' status, and only file *new* `R-###` for genuinely new issues. Keep the same file
     (living document) — do not create `NN-...-v2.md`.
2. **Load the category brief.** Go to **Audit Categories & Briefs** for that category. It tells you
   the role to embody, the vantage points, the evidence surfaces to inspect, the required skills
   reading, and the **required closing sections** (from the Closing-Sections Library).
3. **Run the Audit Workflow** (steps 1–9). Steps 1–5 are context loading; step 6 is the audit
   through the brief's lens; steps 7–9 write the audit + roadmap + sprint updates.
4. **Derive the filename.** `docs/audits/XX-<category-slug>.md` — e.g. `03-security-audit.md`.
   Use the slug shown in the register row.
5. **Produce every required section** for the category (base sections + the brief's extras).
6. **Verify against the Quality Checklist** before declaring the audit complete.

That is the entire contract. The rest of this document defines each referenced piece.

---

# Purpose

Audits exist so that Denku improves **compoundingly instead of repeatedly**. Without them, every
session re-discovers the same problems (the unauthenticated Vapi webhook was obvious to the first
technical review; it must never need re-discovering). With them:

- Findings become **permanent, tracked work items** (`R-###` in `IMPLEMENTATION_ROADMAP.md`)
  instead of chat output that evaporates.
- Each audit **builds on the previous ones** — Audit 01 (CEO/Product) reused Audit 00's technical
  findings (R-010 broken invites, R-019 intent stub) and added business impact to them rather than
  re-reporting them.
- Future sessions understand the product, its priorities, and its history **by reading, not by
  re-auditing** — the whole point of the institutional-memory system.
- Fix work can be sequenced honestly: the roadmap's dependency links (e.g. annual billing R-005
  depends on Stripe catalog Prices R-035) come from audits noticing how findings interact.

An audit is successful when a stranger can read it a year later, verify each finding against the
code, and know exactly what was done about it.

# Audit Philosophy

1. **Evidence-based observations only.** Every finding cites its evidence: a file path
   (`web/src/components/marketing/pricing-data.ts`), a screen/flow (onboarding step 4), or a
   reproducible behavior (invite → 401). If you can't point at it, you can't file it.
2. **No assumptions without verification.** This repo actively punishes assumptions: the base DB
   schema is not in the repo, the live DB has drifted past migrations, and the workspace's
   Supabase MCP points at the wrong project entirely (see `skills/database-schema.md`). Verify
   against code; when code and docs disagree, code wins and the docs get fixed (see Living
   Documentation Rules).
3. **Improve, don't criticize.** Findings are framed as "what to change and why it matters," with
   a Recommended Direction. Brutal honesty about severity is required; sneering is not. The
   measure of an audit is how much better the product gets, not how bad it sounds.
4. **Preserve existing strengths.** Denku has hard-won mechanisms that naive "cleanup" would
   destroy: the deterministic artifact guarantee, compensation/rollback chains, advisory-lock
   concurrency leases, pause enforcement that reaches into Vapi, idempotent month-close. Audit 00
   maintains the canonical "do not regress" list — read it, and when your audit touches one of
   these areas, explicitly state what must be preserved.
5. **No duplicate findings — ever.** One issue = one `R-###`, no matter how many audits observe
   it. Rediscovering is fine; re-filing is not.
6. **Severity honesty.** Don't inflate to be heard or deflate to be kind. Critical means
   "trust/revenue/legal breaker" (e.g. R-004 HIPAA claims); Low means "real but safely deferred."
   A playbook where everything is Critical prioritizes nothing.
7. **Current state, not history.** Audits describe the product as it is on their
   "findings current as of" date. Git preserves history; the documents describe the present.

# Audit Workflow

Follow these steps in order. Steps 1–5 are mandatory context loading — skipping them is how
duplicates and false findings happen.

1. **Read `CLAUDE.md`** — product philosophy, business rules, conventions, and the landmines list.
   This prevents "findings" that are actually documented, deliberate decisions (e.g. fail-open
   gating is policy, not a bug).
2. **Read `CURRENT_SPRINT.md`** — what's actively being worked on, so the audit doesn't collide
   with or duplicate in-flight work (e.g. the landing redesign, R-022).
3. **Read `docs/IMPLEMENTATION_ROADMAP.md`** — every known finding with status. Note the
   **"Next free ID"** counter in its header; your new findings start there.
4. **Read previous related audit(s)** in `docs/audits/` — at minimum the index in
   `docs/audits/README.md`, plus any audit whose lens overlaps yours (a Security audit must read
   Audit 00; a UX audit must read Audit 01).
5. **Read the relevant `skills/*.md`** — the subsystem deep-dives (see the per-category map under
   Audit Categories). They contain the "how it actually works" knowledge that separates a real
   finding from a misunderstanding.
6. **Perform the audit** through your lens. Verify each candidate finding against the code or the
   running product. Dedupe every candidate against the roadmap BEFORE writing it up.
7. **Write the audit document** at `docs/audits/XX-<category-slug>.md` (number and slug come from
   the Audit Register — do not hardcode "what's next" anywhere), using the header block, finding
   format, and the required closing sections for the category (Executive Summary + Action Items are
   always required; the category brief lists any extras).
8. **Update `IMPLEMENTATION_ROADMAP.md` in the same change:** add new `R-###` entries with all
   fields, enrich existing entries your audit touched (add your audit to "Related audit",
   adjust priority with justification), refresh the status summary table, bump "Next free ID"
   and "Last updated", and add your audit to the index table in `docs/audits/README.md`.
9. **Update `CURRENT_SPRINT.md` if priorities changed** — e.g. if your audit produced a new P0,
   the "Known issues" snapshot and "Next priorities" section must reflect it. If your audit
   changed engineering guidance (new rule, new landmine), update `CLAUDE.md` and/or the relevant
   `skills/*.md` too.

An audit that stops after step 7 is **incomplete** — the roadmap update is part of the audit.

# Roadmap Rules

**Create a new Roadmap ID when:**
- The issue does not match any existing entry by symptom, root cause, or fix.
- An existing entry would need a fundamentally different solution to also cover your finding —
  then it's two entries, cross-referenced in their Dependencies/solution text.
- Allocate sequentially from "Next free ID" (never guess; never leave gaps deliberately).

**Reuse an existing Roadmap ID when:**
- Your finding is the same issue seen through a different lens. Precedent: Audit 01 found broken
  member invites as a product-trust issue; Audit 00 had already filed it as R-010 (admin
  namespace collision). Audit 01 referenced R-010 and added business impact to the entry —
  no new ID.
- Your finding is a *consequence* of an existing entry. Name the existing ID as the root cause;
  only file separately if the consequence needs its own work (then link both).

**Merging duplicates (if two IDs are discovered to be one issue):**
- Keep the LOWER (older) ID; fold the newer entry's content into it.
- Replace the newer entry's body with one line: `Merged into R-0XX (YYYY-MM-DD).` — never delete
  the heading (IDs are permanent, and inbound references must not break).
- Update every audit that referenced the retired ID.

**Status updates:**
- `Open → In Progress` when work actually starts (link the branch/PR if one exists).
- `In Progress → Completed` only when shipped and verified — add date and a one-line "how"
  (e.g. "Completed 2026-07-20 — webhook now requires x-vapi-secret; forged POSTs get 401").
- `Won't Fix` requires written reasoning in the entry. Never silently delete an entry.
- When completing a finding, also update the originating audit's finding text (Rule: audits are
  living documents) and check whether `CLAUDE.md`'s landmines list or a skill doc must change
  (e.g. fixing R-001 removes landmine #1 from CLAUDE.md).

**Priority evolution:**
- Priorities are expected to move; every change gets a one-line justification in the entry.
- Raise when: new evidence of user/revenue harm, a dependency completes and unblocks it
  (finishing R-035 upgrades the "implement" path of R-005), or repeated audits keep hitting it.
- Lower when: mitigations shipped, the affected surface was removed, or business direction
  changed (record which).
- The "Do-first shortlist" in the roadmap header must always reflect current reality — it is the
  answer to "what should I work on right now?"

# Audit Register (the schedule)

The authoritative map from audit **number → lens**. `Begin Audit XX` resolves here first. This is
the one place the pipeline lives; keep it current (add the row's date + status when you run one).
The `docs/audits/README.md` index lists only *completed* audits; this register also holds the plan.

| # | Category | Slug (filename `NN-slug.md`) | Status | Notes |
|---|---|---|---|---|
| 00 | Technical Architecture | `technical-architecture-audit` | Completed 2026-07-06 | Baseline engineering review |
| 01 | CEO / Product | `ceo-product-audit` | Completed 2026-07-06 | Baseline product/growth review |
| 02 | CEO / Product — Premium Experience | `ceo-product-audit` (→ `02-ceo-product-audit.md`) | Completed 2026-07-06 | 4-persona deep-dive; filed R-046–049, broadened R-004 |
| 03 | Voice Agent / Call Experience | `voice-agent-call-experience-audit` | Completed 2026-07-06 | The call itself — prompts, tools, guardrails, artifacts; filed R-050–055; defines the live test-call protocol |
| 04 | Security | `security-audit` | Completed 2026-07-06 | Route auth matrix + systemic controls; filed R-056–060; re-verified R-001/002/003/030 |
| 05 | UX | `ux-audit` | Completed 2026-07-06 | Task-flow & friction; filed R-061–063 |
| 06 | UI / Design | `ui-design-audit` | Completed 2026-07-06 | Four-system adherence + polish; filed R-064–065 |
| 07 | Growth | `growth-audit` | Completed 2026-07-06 | Funnel map + measurement/discovery gaps; filed R-066–067, enriched R-007 |
| 08 | Performance | `performance-audit` | Completed 2026-07-06 | Bundle + query efficiency; filed R-068–069; budget table (confirm w/ Lighthouse) |
| 09 | Accessibility | `accessibility-audit` | Completed 2026-07-06 | WCAG 2.2 AA pass; filed R-070–071 |
| 10 | Enterprise | `enterprise-readiness-audit` | Completed 2026-07-06 | Procurement readiness; filed R-072–073, enriched R-045 |
| 11 | Principal Engineer | `principal-engineer-audit` | Completed 2026-07-06 | Craftsmanship + refactor sequencing; filed R-074 |
| 12 | Billing Correctness | `billing-correctness-audit` | Completed 2026-07-06 | The money math; filed R-075–076 (promoted from Proposed) |

Rules: numbers are permanent and sequential. Re-audits reuse the original number and file (see the
"Begin Audit XX" command, re-audit case). Reordering the *planned* rows is fine; renumbering
*completed* ones is not. Adding a new category = add a brief below + a register row (a playbook
change).

# Audit Categories & Briefs

Each brief is **self-contained**: a session that reads only the brief for its category (plus the
mandatory workflow context) has everything it needs. Every brief lists Role, Vantage points,
Evidence surfaces, Required skills reading, and Required closing sections (defined in the
Closing-Sections Library below; Executive Summary + Action Items are implicit for all).

### Technical Architecture
- **Role:** Principal/staff engineer doing a system review.
- **Vantage points:** system design, data flows, integration seams (Next.js/Supabase/Stripe/Vapi/
  Resend), failure modes, idempotency, security perimeter, code health.
- **Evidence surfaces:** API routes, `middleware.ts`, the Vapi webhook, billing/concurrency libs,
  migrations, auth. Precedent: Audit 00.
- **Skills reading:** all of `skills/`.
- **Required closing sections:** Overall Assessment · Strengths-to-Preserve (the "do not regress"
  list) · Executive Summary · Action Items.

### CEO / Product  *(and CEO/Product — Premium Experience, the Audit 02 brief)*
- **Role:** embody four people at a >$100M-ARR B2B SaaS simultaneously — **CEO, Founder, Chief
  Product Officer, Head of Customer Experience**. The question you answer: *does Denku feel like a
  premium product a business would happily trust with its customer communication?*
- **Vantage points — walk the product as four users, separately:** (1) a **first-time visitor**
  discovering Denku; (2) a **new paying customer** during onboarding; (3) a **daily active
  customer** managing their AI employees; (4) a **business owner** deciding whether to buy. Do not
  suggest code changes — evaluate the *experience*.
- **Evidence surfaces (audit every one):** marketing site (home, pricing, security, docs, support,
  company, privacy/terms), messaging & positioning, signup, auth, verify-email, the onboarding
  wizard end-to-end, dashboard, navigation & information architecture, creating the first AI
  employee, phone-number provisioning, billing/upgrade experience, analytics, calls, tickets,
  appointments, settings, and — explicitly — every **empty / loading / error / success state**,
  feature discoverability, perceived value, and overall polish.
- **Skills reading:** `onboarding-flow`, `billing-and-stripe`, `dashboard-architecture`,
  `design-system`.
- **Required closing sections (in this order):** Scorecard (grade per dimension: conversion,
  activation, retention, trust, perceived value, usability, enterprise readiness) · Executive
  Summary · **Product Score (/10)** · **Biggest Strengths** · **Biggest Weaknesses** · **Top 10
  Highest-ROI Improvements** · **"What would prevent a $100M SaaS from shipping this today?"** ·
  **"If acquired tomorrow, what would reduce its valuation?"** · Action Items.

### Voice Agent / Call Experience
- **Role:** Head of Conversation Design + the customer's most skeptical caller. The question you
  answer: *is the three-minute phone call — the thing businesses actually pay for — excellent,
  truthful, and operationally useful?*
- **Vantage points:** (1) the caller's experience (greeting, comprehension, latency posture,
  interruptions, closings, after-hours); (2) the business's experience of the OUTPUT (are
  tickets/appointments accurate, readable, actionable?); (3) the agent's actual capabilities vs.
  what the prompt promises it can do (tool availability, language/voice reality).
- **Evidence surfaces:** assistant creation payloads (onboarding `runActivation` + phone-line
  purchase route), `prompt-derivation.ts` and the settings sync action (what actually reaches
  Vapi — verify toolIds survival), webhook final-event pipeline (intent, completion-state,
  artifact builders `buildTicketSubject`/`buildTicketDescription`), `call-guardrails.ts` trigger
  logic against realistic transcripts, demo guardrails, duration/silence/voice/transcriber
  configuration (or absence thereof).
- **Constraint to state honestly:** a session cannot place phone calls. Audit what is codified;
  for everything experiential, produce the **Live Test-Call Protocol** for a human to execute,
  and treat its results as input to a future re-audit of 03.
- **Skills reading:** `vapi-integration` (mandatory, fully), `onboarding-flow`,
  `dashboard-architecture` (artifact display).
- **Required closing sections:** Live Test-Call Protocol · Executive Summary · Action Items.

### UX
- **Role:** Head of UX / senior product designer.
- **Vantage points:** task-level flows — can a business owner review a call, handle a ticket, buy a
  number, invite a teammate without friction? Navigation, error recovery, empty/loading states,
  mobile.
- **Evidence surfaces:** dashboard pages + detail views, onboarding wizard, modals, forms,
  loading/empty/error states across surfaces.
- **Skills reading:** `dashboard-architecture`, `onboarding-flow`, `design-system`.
- **Required closing sections:** Executive Summary · Product Score (/10, usability) · Top ROI
  Improvements · Action Items.

### UI / Design
- **Role:** Design director.
- **Vantage points:** visual consistency and craft. Denku runs **four** coexisting design systems
  with strict per-surface boundaries — audit *adherence*, not unification (unifying is a product
  decision). Include copy rules ("AI" not "agent" outside Settings; "Denku" never "Denku AI").
- **Evidence surfaces:** marketing components, auth/onboarding brand chrome, Horizon dashboard,
  shadcn primitives; tokens/fonts in `globals.css`.
- **Skills reading:** `design-system`.
- **Required closing sections:** Executive Summary · Product Score (/10, polish) · Action Items.

### Growth
- **Role:** Head of Growth.
- **Vantage points:** funnel mechanics — marketing → signup → verify → onboarding → paid →
  activated. Drop-off points, CTA integrity (R-007), pricing honesty (R-004/005/006),
  demo-to-signup conversion, SEO/meta, trial/paywall placement (R-015).
- **Evidence surfaces:** marketing pages, pricing, hero CTAs, signup/verify, onboarding paywall
  step, meta tags.
- **Skills reading:** `onboarding-flow`, `billing-and-stripe`, `design-system`.
- **Required closing sections:** Executive Summary · Funnel Map (stage → drop-off risk) · Top 10
  Highest-ROI Improvements · Action Items.

### Enterprise
- **Role:** buyer-side CISO + procurement lead evaluating Denku for a >$10k-ACV deal.
- **Vantage points:** SSO/2FA/RBAC, audit-log coverage, data export/retention/deletion, compliance
  substance vs marketing claims (R-004 HIPAA/SLA), DPA/security page, procurement blockers.
- **Evidence surfaces:** auth & roles, settings (members/audit/keys), security & pricing marketing
  claims, data model. Anchor entry: R-045.
- **Skills reading:** `auth-and-tenancy`, `database-schema`.
- **Required closing sections:** Executive Summary · Procurement Blocker List · "What would reduce
  its valuation in due diligence?" · Action Items.

### Security
- **Role:** offensive + appsec engineer.
- **Vantage points:** attack surface via the endpoint auth matrix in `skills/auth-and-tenancy.md`;
  tenant isolation (service-role + manual `org_id` scoping — the #1 systemic risk); secrets
  handling; webhook forgery (R-001); rate limiting (R-030). Follows up R-001/002/003.
- **Evidence surfaces:** every API route's auth, middleware, webhook signature handling, debug/dev
  routes, env/secret usage.
- **Skills reading:** `auth-and-tenancy`, `vapi-integration`, `deployment-and-environments`.
- **Required closing sections:** Executive Summary · Risk Register (severity × likelihood) · Action
  Items.

### Performance
- **Role:** performance engineer.
- **Vantage points:** latency and cost — middleware per-request DB queries (R-044), unpaginated
  200-row queries (R-023), bundle weight (ApexCharts, Spline, GSAP/framer-motion all shipped),
  webhook double-writes (R-032), Vercel/Supabase spend.
- **Evidence surfaces:** middleware, dashboard data fetching, list pages, client bundles, webhook.
- **Skills reading:** `dashboard-architecture`, `database-schema`.
- **Required closing sections:** Executive Summary · Performance Budget table (surface → metric →
  current → target) · Action Items.

### Accessibility
- **Role:** accessibility specialist.
- **Vantage points:** WCAG 2.2 AA on the three customer surfaces. Known starts: `prefers-reduced-
  motion` already respected in brand animations (preserve); unaudited — bone/teal contrast ratios,
  wizard form labeling, Horizon table semantics, modal focus management.
- **Evidence surfaces:** marketing, auth/onboarding, dashboard; color tokens, forms, tables,
  dialogs.
- **Skills reading:** `design-system`, `dashboard-architecture`.
- **Required closing sections:** Executive Summary · WCAG Conformance Summary (criterion → pass/
  fail/NA) · Action Items.

### Principal Engineer
- **Role:** principal engineer setting technical direction.
- **Vantage points:** code craftsmanship — monster files (R-043), duplication (R-033/034), error
  handling (R-021), test strategy (R-037), refactor sequencing that never regresses the "do not
  regress" list.
- **Evidence surfaces:** the three largest files, duplicated modules, test/CI absence, error paths.
- **Skills reading:** all of `skills/`, plus Audit 00.
- **Required closing sections:** Executive Summary · Biggest Strengths · Biggest Weaknesses ·
  Refactor Sequencing Plan · Action Items.

### Billing Correctness
- **Role:** revenue/billing engineer. Question: *does what a customer is charged correctly follow
  from what they used?* (Distinct from Technical Architecture's review of billing *design* — this
  audits the *math*.)
- **Vantage points:** the money path end-to-end — call cost/duration → billable minutes → overage
  netting → invoice line items → Stripe — plus rounding rules, boundary conditions (plan minute
  limits, overage threshold/hard-cap transitions), month-close idempotency (incl. the double
  trigger), and COGS-vs-revenue margin reconciliation.
- **Evidence surfaces:** `api/billing/cron/close-month`, `create-draft-invoice`, `overage/collect-
  now`, the `reconcile_call_cost` path in the webhook, `billing_overage_state`, and the invoice
  preview view/RPC (⚠ likely NOT in the repo — R-031/R-075; say so honestly).
- **Skills reading:** `billing-and-stripe` (mandatory, fully), `database-schema`.
- **Required closing sections:** Money-Path Trace (verifiability map) · Executive Summary · Action
  Items.

New categories may be added; doing so is a playbook change (add a brief here + a register row).

# Finding Template

Every finding, in every audit, uses this structure. The audit document may present it as prose
under a heading (Audits 00/01 style), but ALL fields must be derivable; the roadmap entry must
contain them explicitly.

```markdown
### [R-0XX] — <Title: symptom, not solution>
**Summary:** One or two sentences stating the defect/opportunity plainly.
**Evidence:** File paths, screens, or reproduction (e.g. `web/src/components/marketing/pricing-data.ts`
lines listing "HIPAA & audit logs"; click Settings → Members → Invite → observe 401).
**Business impact:** What it costs in conversion/retention/trust/legal/revenue terms.
**Technical impact:** What it means in the codebase — blast radius, affected modules.
**Recommended direction:** The suggested fix approach (direction, not a full spec).
**Estimated effort:** S (≤1 day) · M (1–3 days) · L (1–2 weeks) · XL (multi-week).
**Priority:** Critical / High / Medium / Low — per the severity-honesty principle.
**Dependencies:** R-IDs, external services (Stripe/Vapi/Resend config), or decisions required.
**Status:** Open / In Progress / Completed (date + how) / Won't Fix (reasoning).
```

Rules of thumb learned from Audits 00/01:
- Title the symptom ("Vapi webhook has no authentication"), not the remedy ("Add HMAC").
- Business AND technical impact are both required even when one is thin — write "None — copy-only
  change" rather than omitting (see R-004 for the pattern).
- If the finding protects an existing strength, say so in Recommended direction (e.g. "keep the
  deterministic artifact path intact while adding notifications").

# Closing-Sections Library

Every audit ends with a **footer of closing sections**. Two are universal; the rest are pulled in
by the category brief. This library defines each so any session produces them identically.

| Section | Required by | What it contains |
|---|---|---|
| **Executive Summary** | ALL | 4–8 sentences: the verdict, the through-line, and the single most important move. Written so a busy exec reads only this. |
| **Action Items** | ALL | Table mapping each action → `R-###` → Priority. Every finding in the audit appears here exactly once. |
| **Scorecard** | CEO/Product | Grade (A–F or ×/10) per dimension: conversion, activation, retention, trust, perceived value, usability, enterprise readiness — one line of reasoning each. (Audit 01 established the format.) |
| **Product Score (/10)** | CEO/Product, UX, UI | A single defensible number with one paragraph justifying it against the scorecard. Not an average for its own sake — a judgment. |
| **Biggest Strengths** | CEO/Product, Principal Eng | 3–6 things that are genuinely good and must be preserved (ties to Philosophy #4). |
| **Biggest Weaknesses** | CEO/Product, Principal Eng | 3–6 most damaging gaps, each linked to its `R-###`. |
| **Top 10 Highest-ROI Improvements** | CEO/Product, Growth (as "Top ROI") | Ranked list, each = impact ÷ effort, each linked to an `R-###`. This is the "if you do nothing else" list. |
| **"What would prevent a $100M SaaS from shipping this today?"** | CEO/Product | The bar-raiser: the specific gaps between Denku and a product a $100M-ARR company would put its name on. |
| **"If acquired tomorrow, what would reduce its valuation?"** | CEO/Product, Enterprise | Due-diligence lens: the findings an acquirer's technical/security/legal review would price down (unauthenticated webhook, HIPAA claims, no tests, schema not in repo…). |
| **Funnel Map** | Growth | Each funnel stage → drop-off risk → the finding that causes it. |
| **Procurement Blocker List** | Enterprise | The hard "no" items a security/procurement review would raise, each an `R-###`. |
| **Risk Register** | Security | Each risk rated severity × likelihood, with the `R-###` and exploit sketch. |
| **Performance Budget** | Performance | Surface → metric → current → target → the `R-###` closing the gap. |
| **WCAG Conformance Summary** | Accessibility | Criterion → pass/fail/NA → the `R-###` for each failure. |
| **Refactor Sequencing Plan** | Principal Eng | The order to pay down debt without regressing the "do not regress" list; dependencies between refactors. |
| **Live Test-Call Protocol** | Voice Agent | Scripted call scenarios (who calls, what they say, what to observe) + a pass/fail rubric per scenario, executable by a human in <1 hour; results feed a re-audit of 03. |
| **Money-Path Trace** | Billing Correctness | Table mapping each step usage→minutes→overage→invoice→Stripe to its source and whether it's verifiable from the repo, with the `R-###` for each gap. |

If a category needs a section not listed here, add it to this table (a playbook change) so the
next audit of that lens reproduces it.

# Documentation Rules

How audits interact with each document in the knowledge system:

- **`CLAUDE.md`** — the stable contract. Audits READ it to avoid flagging deliberate decisions.
  Audits WRITE to it only when they change durable engineering truth: a new landmine discovered,
  a landmine removed by a fix, a new non-negotiable rule. Keep it dense — CLAUDE.md is loaded
  every session; findings themselves never live there.
- **`CURRENT_SPRINT.md`** — the active implementation sprint (goal, tasks, DoD). Audits touch it
  ONLY when a finding materially changes what should be worked on next (e.g. a new Critical that
  belongs in the current sprint's scope). The roadmap remains canonical for the full backlog; the
  sprint holds only what's in flight.
- **`docs/IMPLEMENTATION_ROADMAP.md`** — the single source of truth for findings and status.
  Every audit updates it in the same change (Workflow step 8). No finding exists until it has an
  `R-###` here; no audit is complete until its findings do.
- **`skills/*.md`** — subsystem mechanics ("how it works"). Audits read them for context and
  update them when an audit reveals the documentation is wrong or a fix changes behavior. Skills
  never track findings or status — they describe the machine, warts flagged with ⚠ and a pointer
  to the roadmap ID.
- **`docs/audits/*.md`** — the narratives (why, evidence, judgment). Each audit owns its file
  forever and keeps it current (see below). `docs/audits/README.md` holds the audit index and the
  condensed rules; keep its index table updated (Workflow step 8).

Division of labor in one line: **vision = what we believe · charter = how we operate · skills =
how it works · roadmap = what's wrong & status · audits = why it matters & evidence · CLAUDE.md =
stable memory · CURRENT_SPRINT = what's in flight now.** (The full one-source-of-truth map lives in
`PROJECT_CHARTER.md` → Documentation Standards.)

# Living Documentation Rules

1. **Never leave stale documentation.** If you ship a change that invalidates any statement in
   any of these documents, updating that statement is part of the change — not a follow-up.
2. **Update existing findings instead of creating duplicates.** Resolved issue → mark the roadmap
   entry Completed (date + how) and amend the originating audit's finding text. The finding stays
   forever as institutional memory of what was wrong and how it was fixed.
3. **Cross-reference related audits.** When findings interact across lenses (product gap caused
   by a technical stub — R-019 ↔ Audit 01 H14), link both directions so a reader entering from
   either audit finds the whole picture.
4. **Preserve historical context without clutter.** No "UPDATE:" append-logs, no changelog
   sections inside audits — rewrite the affected text and bump the "findings current as of" date.
   Git history is the archive. The one exception: merged/retired R-IDs keep a one-line tombstone.
5. **Keep documentation synchronized with the codebase.** When an audit finds that docs and code
   disagree, the code is the truth and the doc fix ships with the audit. Known standing hazards:
   the base DB schema lives only in the live Supabase project, prod RPCs have drifted past the
   migration files, and this workspace's Supabase MCP points at the wrong project — never
   "correct" documentation from those sources without verifying against calling code.
6. **Counters and indexes are documentation too.** "Next free ID", "Last updated", the status
   summary table, and the audit index are trusted by every future session — leaving them stale
   breaks the system quietly.

# Quality Checklist

An audit is **complete** only when every box is checked:

- [ ] Context loaded first: CLAUDE.md, CURRENT_SPRINT.md, roadmap, related audits, relevant skills
      (Workflow steps 1–5).
- [ ] **No duplicate findings** — every finding was deduped against the roadmap; overlaps
      reference existing R-IDs.
- [ ] Every finding has evidence (file path / screen / reproduction) and all template fields.
- [ ] **Roadmap updated:** new entries with all fields; touched entries enriched; status summary
      table refreshed; "Next free ID" and "Last updated" bumped.
- [ ] Audit file follows conventions: `XX-<category-slug>.md` (slug from the register), header
      block (date, lens, scope, "findings current as of"), findings labeled with R-IDs.
- [ ] Lens resolved from the **Audit Register**; filename is `XX-<category-slug>.md`; the register
      row updated (status/date).
- [ ] **All required closing sections for this category are present** (per the category brief +
      Closing-Sections Library), in order — not just Executive Summary + Action Items.
- [ ] **Executive Summary included** (end of document).
- [ ] **Action Items included** (end of document), each mapped to its R-ID and priority.
- [ ] **References added:** audit indexed in `docs/audits/README.md`; cross-references to related
      audits in both directions.
- [ ] **Documentation synchronized:** CURRENT_SPRINT.md updated if priorities changed; CLAUDE.md /
      skills updated if durable knowledge changed; strengths-to-preserve stated where relevant.
- [ ] Severity honesty check: would each Critical genuinely break trust/revenue/legal if ignored?
      Is anything inflated?

---

*This playbook is itself a living document (see Living Documentation Rules). Changes to the audit
process are made HERE first, then reflected in `docs/audits/README.md`.*
