# Sprint 5.5 Review & Retrospective — Platform Experience: Depth & Consistency

- **Sprint:** 5.5 (core) · **Window:** 2026-07-24 · **Status:** **code-complete; operator flag-flip pending**
- **Goal (verbatim):** Build the product experience on top of the Platform Foundation (4.5) + Platform
  Experience (5) — make the daily-use surfaces platform-shaped, behind `PLATFORM_UX_ENABLED`, additive,
  zero regression.
- **One-line verdict:** **The product now feels and measures like an AI Employees platform.** On login
  (flag ON) a business sees a channel/employee-aware Overview, a real Contacts book, and cross-channel
  Analytics — with the current experience byte-for-byte unchanged until the flag flips. **6 commits, 202
  tests green, build green.**

---

## 1. The order was reviewed and changed before coding (leaves before hub)

The approved proposal listed Q1 Dashboard → Q2 Contacts → Q3 Analytics. A pre-code architecture review
**reordered** to **Q0 read-model depth → Contacts → Analytics → Dashboard (last)** because:

- The **Dashboard is the hub** (it links to Contacts, Analytics, Employees, Conversations). Building it
  first means dead links + rework once the leaves exist; building it **last** = built once, linking to
  real surfaces.
- **Analytics and Dashboard share the aggregation read-model layer**, and Analytics exercises it more
  deeply — proving the shared layer on Analytics de-risks the honesty-sensitive (R-018) Dashboard.
- **Ascending risk:** Contacts (lowest, replaces a placeholder) → Analytics → Dashboard (highest
  visibility). **Zero customer-value cost** — everything is flag-gated and lands together at flag-flip.

## 2. What shipped

| Phase | Delivered |
|---|---|
| **Q0 — Read-model depth** | `aggregate.ts` (pure aggregations by channel/employee/intent/day + `getConversationAggregates` with an honest `limited` flag + `getArtifactCounts`); `contacts.ts` (ContactList/DetailView over `leads`, id = lead id; history matched by contact id/handle). 8 tests. |
| **Contacts** | Real `/contacts` list + `/contacts/[id]` detail (identities, notes, conversation history); conversation detail → contact link; `/leads[/:id]` → `/contacts[/:id]` lossless redirect (create form kept reachable). |
| **Analytics** | Flagged `PlatformAnalytics` (KPI tiles + by channel/employee/intent + 14-day trend) over the aggregation layer; dependency-free `BarList`; legacy analytics when OFF. |
| **Dashboard** | Flagged `PlatformDashboard` Overview (KPI tiles, by-channel, employee roster, recent) linking to every surface; `/dashboard/agents[/:id]` → `/employees[/:id]` consolidation; legacy home when OFF. |

## 3. Design decisions / invariants continued

- **Read-model-first** — every surface reads `readModel/*`, never raw tables; Analytics + Dashboard
  share one aggregation layer built once.
- **Flagged variants, not rewrites** — Dashboard + Analytics branch at the top; the entire legacy body
  is untouched and served when OFF → provable zero regression.
- **R-018 honesty** — bounded aggregation is labeled "recent N", never a fabricated all-time total;
  outcome tiles count from source.
- **Capability-preserving redirects continue** — `/leads` and `/dashboard/agents` redirect losslessly
  (contact id = lead id; employee id = agent id), but the **create forms** (`/leads/new`,
  `/agents/new`) and `settings/agents` (config) stay reachable.
- **No duplicated business logic** — "Configure" and the call detail reuse existing pages; Contacts
  reads `leads`; aggregates read the conversations read model.

## 4. The hard constraint (why "code-complete", not "verified")

No staging env; the flag stays OFF. An operator flips `PLATFORM_UX_ENABLED` on staging to walk the
Overview / Contacts / Analytics and the redirects. Engineering-done vs operationally-verified, as before.

## 5. Metrics

| Metric | Value |
|---|---|
| Commits | 6 (finalized-order doc · Q0 read-model · Contacts · Analytics · Dashboard · docs) |
| New routes | `/contacts`, `/contacts/[id]` (real); flagged variants of `/dashboard` + `/analytics` |
| New read-model | `aggregate.ts`, `contacts.ts` (+ `BarList`, `PlatformAnalytics`, `PlatformDashboard`) |
| Tests | 193 → **202** (+9: aggregations + contacts + redirect rules), all green |
| Build | passes |
| Breaking changes | **0** (flag-gated variants; legacy served when OFF; no page deleted) |
| Roadmap | R-090/R-091/R-092/R-093 done; 39 completed / 56 open |

## 6. Lessons

- **Sequencing is a design decision, not a formality.** Reversing to leaves-before-hub removed rework
  and dead-links on the highest-visibility surface at zero cost — worth the 10-minute review.
- **A shared aggregation layer pays for two surfaces.** Building `aggregate.ts` once, then Analytics
  (deep) and Dashboard (shallow) over it, kept both surfaces thin and consistent.
- **Honesty scales with a flag on the data, not the copy.** `limited` on the aggregate result let every
  consumer tell the truth ("recent N") without each surface re-deriving the caveat.
- **Lossless redirects need an id contract.** `/leads/:id` → `/contacts/:id` only works because the
  read model chose `contact id = lead id`; deciding that in Q0 made the redirect trivial and safe.

## 7. Deferred to Sprint 6

Settings reorganization (R-094) · Onboarding reframe (R-095) · Horizon/`_platform` UX consistency
(R-096) · Navigation polish (R-097) · full customer-facing naming sweep across legacy pages (R-065).
Plus standing platform items: R-081 backfill, R-085 read cutover, R-086 message-usage billing, R-066
analytics event instrumentation.

## 8. Handoff → next

**Operator:** flip `PLATFORM_UX_ENABLED` on staging and walk Overview → Contacts → Analytics + the
`/leads` and `/agents` redirects. **Product/eng (Sprint 6):** Settings reorg + Onboarding reframe + UX
consistency + nav polish + naming sweep; then the read cutover (R-085) once dual-writes are trusted.

---

*Living companion to the roadmap. Sprint 5.5 core is done-in-code; operationally verified when the
surfaces are walked with the flag ON on staging.*
