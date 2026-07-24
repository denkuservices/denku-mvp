# Sprint 5.5 — Proposal: Platform Experience, Depth & Consistency

> **Status: SCOPED — owner decisions locked 2026-07-24; awaiting go-ahead to begin implementation.**
> Builds the product experience on top of the Platform Foundation (4.5) + Platform Experience (5).

## 0. Owner decisions (locked 2026-07-24)

1. **Scope:** **core Q0–Q3** this sprint (read-model depth · Dashboard · Contacts · Analytics);
   **Q4 Settings · Q5 Onboarding · Q6 naming/UX → Sprint 6.**
2. **Analytics:** **presentation over the read model** (honest, no fabrication); event instrumentation
   (R-066) tracked separately, not built here.
3. **Contacts data:** build over the existing **`leads`** table now (works today, no operator gate);
   **R-081 backfill deferred** to populate `contact_identities` later.
4. **`/dashboard/agents`:** **redirect to `/employees`** (flag-gated) + fold into AI Employees; rename
   customer-facing "agent" copy → "AI Employee" (part of R-092, but the redirect lands with Q1/Contacts).

**⇒ Sprint 5.5 (this sprint) = Q0, Q1, Q2, Q3.** Everything behind `PLATFORM_UX_ENABLED`, read-model-
first, legacy fallback when OFF, zero regression.

### 0.1 Finalized execution order (architecture review, 2026-07-24)

Final pre-code review **reordered** the surfaces from the proposed Q1→Q2→Q3 to **build leaves before
the hub**. The Dashboard is the cross-surface *hub* (links to Contacts, Analytics, Employees,
Conversations); Analytics + Dashboard share the same aggregation read-model layer; Contacts is an
independent, lowest-risk leaf that also unblocks the conversation→contact link.

**Execution order (this sprint):**
1. **Q0 — Read-model depth.** `readModel/aggregate.ts` (conversation/outcome stats by channel, employee,
   day) + `readModel/contacts.ts` (ContactView over `leads`, id = lead id for 1:1 link). Pure, tested.
2. **Contacts (was Q2).** List + detail (identities, conversation history, artifacts); conversation
   detail → contact link; `/leads` + `/leads/:id` → `/contacts` redirects (Contacts reads leads → no
   capability loss).
3. **Analytics (was Q3).** Cross-channel funnels + per-employee/per-channel, over the aggregation layer
   — the deepest consumer, hardens the shared layer.
4. **Dashboard (was Q1) — last.** Channel/employee-aware home over the proven aggregation layer, linking
   to real Contacts + Analytics; `/dashboard/agents` → `/employees` redirect + customer-facing "AI
   Employee" naming pass. Built once, no rework.

**Rationale:** leaves-before-hub (no rework/dead-links on the highest-visibility surface); prove the
aggregation layer on Analytics before the honesty-sensitive (R-018) Dashboard depends on it; ascending
risk (Contacts → Analytics → Dashboard). Zero customer-value cost — all flag-gated, lands together at
flag-flip.
> Everything ships behind **`PLATFORM_UX_ENABLED`** (default OFF), additive, zero regression, reading
> the Platform Read Model. References: `docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md`,
> `docs/SPRINT_5_REVIEW.md`, `skills/platform-architecture.md`, `docs/PROJECT_VISION.md`.

## 1. Where we are (holistic read of the current product)

Sprint 5 delivered the **IA skeleton**: platform nav, a unified Conversations inbox with a plugin
renderer, Employee/Channel surfaces, all over a storage-decoupled read model. What remains is
everything the customer *lives in daily* that is still **voice-first underneath the new nav**:

- **Dashboard home** (`DashboardClient.tsx`) is call-metric-shaped: widgets for calls / answer-rate /
  spend + an `AgentComplexTable` (answer-rate per agent). No channel or employee-roster lens.
- **Analytics** (`analytics/page.tsx`) is **calls + tickets + by-agent only** — no channel dimension,
  no conversations, no per-employee cross-channel view.
- **Settings** is organized by resource (Account · Workspace · **Agents** · Billing · Usage), not by
  the platform model. The "Agents" card still has **two trees** (My agents / Behavior / Advanced,
  R-063).
- **A third agent surface** exists: `/dashboard/agents` ("Create an agent", roster) — separate from
  `/dashboard/settings/agents` and the new `/dashboard/employees`. Customer-facing "agent" / "AI line"
  copy persists (R-065 only partially done).
- **Contacts** is a placeholder; the real `contacts`/`contact_identities` tables (4.5) are unused by UI.
- **Onboarding** is voice-coupled (Goal → **Phone Intent** → Plan → Activate number → Live).
- **UX split:** the new `_platform` surfaces are hand-rolled Tailwind; the legacy dashboard uses Horizon
  components (Card/Widget/ApexCharts) — two visual languages inside the same shell (compounds R-064).

**Conclusion:** Sprint 5 made the product *navigable* as a platform; Sprint 5.5 must make it *feel and
measure* like one — dashboard, analytics, contacts, settings, onboarding, and a naming/UX pass — while
preserving voice depth and the do-not-regress core.

## 2. New findings (filed to the roadmap + audit this proposal)

| id | audit | Sev | Finding |
|---|---|---|---|
| **R-090** | P-011 | High | Dashboard home is call/answer-rate/agent-table shaped; needs a **channel- and employee-aware** overview (conversations by channel, employee roster, artifacts cross-channel) preserving R-018 honesty. |
| **R-091** | P-012 | High | Analytics is voice-only (calls+tickets+by-agent); needs **cross-channel analytics** (conversations & outcomes by channel, per-employee). Presentation layer over the read model; pairs with R-066 (event instrumentation, still unbuilt). |
| **R-092** | P-013 | Medium | **Three overlapping "agent" surfaces** (`/dashboard/agents`, `/dashboard/settings/agents`, `/dashboard/employees`) + customer-facing "agent"/"Create an agent" copy. Consolidate to **AI Employee**: redirect `/dashboard/agents` → `/employees`; extend R-065 naming. |
| **R-093** | P-014 | High | **Contacts experience:** generalize `leads` → `contacts`/`contact_identities` (tables exist) into a real surface — per-channel identities + conversation history + links from conversations/artifacts. |
| **R-094** | P-015 | Medium | **Settings reorganization** by the platform model: per-Employee (brain/persona/business-context/voice) · per-Channel (Voice caps/numbers; IG connection) · Workspace/Billing. Subsumes R-063. |
| **R-095** | P-002 | Medium | **Onboarding reframe** (narrative only, per owner): "meet your AI Employee → connect a channel → go live", preserving the DB step-machine + middleware gating. |
| **R-096** | P-016 | Medium | **UX/design consistency:** new `_platform` surfaces should adopt Horizon primitives (Card/Widget) so the platform IA feels native; reconcile the Horizon/shadcn split (R-064) where settings reorg touches it. |
| **R-097** | P-017 | Low | **Navigation polish:** topbar/breadcrumb titles for new routes, active states, empty states, consistent "coming soon" affordances, mobile drawer parity. |

(Existing items this sprint advances: **R-063** settings/agent-tree consolidation, **R-064** design-system
split, **R-065** AI-not-agent naming, **R-066** product analytics instrumentation, **R-081** backfill
enables real Employee↔Channel + Contacts data.)

## 3. Proposed Sprint 5.5 scope & phases

All flagged behind `PLATFORM_UX_ENABLED`; each surface has a legacy fallback when OFF (like the nav).
Read-model-first (extend `readModel/*` with aggregation + contacts views), then thin UI.

- **Q0 — Read-model depth (enabler).** Aggregation helpers (conversation counts by channel/employee,
  outcomes, trends) + `readModel/contacts.ts` (ContactView over leads+contacts). Pure, tested. *The
  data layer every 5.5 surface needs — do first, like P0 was to Sprint 5.*
- **Q1 — Platform Dashboard (R-090).** Channel-aware overview: conversations-by-channel, employee
  roster strip, artifacts created, honest empty/unknown states. Flagged variant of the home.
- **Q2 — Contacts experience (R-093).** Contacts list + detail (identities, conversation history,
  artifacts); `/leads` becomes a redirect once Contacts is real.
- **Q3 — Platform Analytics (R-091).** Cross-channel funnels + per-employee/per-channel performance,
  over the read model. (Event instrumentation R-066 tracked separately as a dependency, not blocker.)
- **Q4 — Settings reorganization (R-094 / R-063).** Per-Employee / per-Channel / Workspace; consolidate
  the two agent trees; `/dashboard/agents` → `/employees` redirect (R-092).
- **Q5 — Onboarding reframe (R-095).** Employee→Channel narrative reskin; DB contract preserved.
- **Q6 — Naming + UX consistency pass (R-092/R-065/R-096/R-097).** Customer-facing vocabulary (AI
  Employee · Conversation · Contact · Channel) sweep; Horizon-native platform surfaces; nav polish;
  document the vocabulary in `skills/design-system.md`.

**Recommended core cut line: Q0–Q3** (dashboard + contacts + analytics are the felt daily value and the
"measure the platform" gap). **Q4–Q6** (settings/onboarding/naming-UX) can trail into a Sprint 6 if the
sprint runs long — each is independently shippable behind the flag.

## 4. Architecture guidelines (carry forward)

- **Read-model-first**, storage-decoupled — extend `readModel/*`; never read raw tables from pages.
- **Flagged variants**, not rewrites — when `PLATFORM_UX_ENABLED` is OFF, the legacy dashboard/analytics/
  settings render unchanged (zero regression); ON renders the platform variants.
- **No duplicated business logic** — reuse existing settings/agent config, billing, artifact reads;
  present them in the platform IA, don't re-implement.
- **Employees own Channels**, **plugin renderers**, **capability-preserving redirects** — the Sprint 5
  invariants continue.
- **Additive + small atomic commits + docs-as-you-go**; honesty (R-018) preserved in every metric.

## 5. Dependencies & risks

- **Real cross-channel data needs the flag + backfill (R-081).** With `PLATFORM_MODEL_ENABLED` off and
  no backfill, the read model shows voice history (from `calls`) but sparse Contacts/Employee-channel
  data. Mitigation: read model already falls back to legacy bindings; Contacts reads `leads` today. Note
  the dependency; don't block UX on it.
- **Staging env** (standing blocker) — needed to walk the flag-ON experience and validate 5.5 surfaces.
- **Scope size** — this is a large sprint; the Q0–Q3 cut line keeps it shippable; everything flag-gated.
- **Analytics honesty** — R-066 instrumentation is unbuilt; 5.5 analytics presents what's derivable from
  the read model and must not fabricate (R-018/R-004 discipline).
- **Design-system drift** — resolving Horizon-vs-`_platform` styling (R-096) is the risk that, left
  undone, makes the platform feel bolted-on; recommend doing at least the shared primitives in Q1.

## 6. Definition of Done (proposed)

Platform Dashboard + Contacts + Analytics (Q0–Q3 core) live behind `PLATFORM_UX_ENABLED`, reading the
read model, with legacy fallbacks intact (zero regression); customer-facing platform naming consistent
on shipped surfaces; CI + build green; docs synced (roadmap, CURRENT_SPRINT, skills, Sprint 5.5 review).
Operator can flip the flag on staging to walk the full experience.

## 7. Open questions for the owner

1. **Scope:** core **Q0–Q3** now (recommended) + Q4–Q6 as Sprint 6, or all Q0–Q6 in 5.5?
2. **Analytics depth:** presentation-only over the read model now (recommended), or also build the R-066
   event instrumentation this sprint?
3. **`/dashboard/agents`:** redirect to `/employees` (recommended) or keep as an advanced/admin roster?
4. **Backfill (R-081):** run it early in 5.5 (so Contacts/Employee-channel data is real) or keep reading
   legacy bindings and defer backfill?
