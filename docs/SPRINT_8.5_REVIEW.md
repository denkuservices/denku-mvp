# Sprint 8.5 Review — Logged-In Experience

- **Sprint:** 8.5 · **Window:** 2026-07-25 · **Status:** **code-complete (scoped)**
- **One-line verdict:** **I audited my own work honestly and found it wasn't good enough to ship —
  then fixed the three defects that made enabling the platform UX a downgrade rather than an upgrade.**
  3 commits, 291 tests green, build green, nothing behind a new flag.

---

## 1. The reversal

Yesterday's audit concluded: *"the Platform UX is the better product — finish and ship it."* Today,
instructed to assume nothing and not protect prior work, I measured the two products head-to-head
instead of assuming the newer one won. **I had been protecting my own work.** Three findings:

| | Finding | Why it mattered |
|---|---|---|
| **Y-001** | Legacy **Calls** has outcome + date-range + phone-line filters; my **Conversations** had one channel filter and no search | A customer who can answer *"show me yesterday's missed calls"* today **could not** after the flip. A downgrade dressed as an upgrade. |
| **Y-002** | My 4 surfaces were hand-rolled Tailwind; Tickets/Appointments/Settings **survive** the flip on Horizon/shadcn | Two visual languages inside one product. I'd filed this (R-096) and rated it *"cosmetic, move down"* — **that rating was wrong**; it was a flip blocker. |
| **Y-003** | Conversations fetched `limit:100` and rendered `"{n} conversations"` | An org with thousands saw **"100 conversations"** — a false statement about their own data, produced by the author of the R-018 honesty rule. |

**Revised verdict, which I stand behind:** the **IA is right** (Employees / Conversations / Contacts /
Channels); the **presentation layer was below the standard of the pages it replaces.**

## 2. What shipped

| Commit | Work |
|---|---|
| `6946d08` | **Primitives + filters + honesty + states.** `_platform/ui` primitives that **wrap the real Horizon `Card`** (consistency is structural, not copied class strings); Conversations gains search, date range, outcome filter, pagination and truthful counts; Contacts gains search + truthful counts; `loading.tsx` + `error.tsx` for all four platform routes; empty states rewritten as first-run onboarding with a distinct no-results variant. |
| `6c68ac2` | **Action-first dashboard.** Reordered to **Needs attention → Today → Trends**. The attention section renders *only* when something is genuinely wrong (unhealthy channel, no employee connected, open requests) — otherwise a single all-clear. New workspaces get a purposeful first-run state instead of a grid of zeros. |
| `8619b38` | The audit + roadmap reprioritization. |

**Filters live in the URL** (GET forms), so a filtered view is shareable and bookmarkable — the thing
an operator actually wants when escalating something to a colleague.

## 3. Design decisions

- **Wrap, don't imitate.** The primitives wrap Horizon's `Card` rather than copying its classes, so the
  two halves of the product cannot drift apart again.
- **Silence must be meaningful.** "Needs attention" renders nothing when nothing is wrong — which is
  only honest if the check is real. Hence `openTickets`/`upcomingAppointments` are status- and
  date-scoped queries, not guesses.
- **Bounded honesty over precise-looking lies.** Rather than an expensive exact `COUNT` on every page
  load, the scan is bounded and the UI says **"N+"** with "most recent — narrow with filters". Truthful
  and cheap.
- **Empty state = onboarding.** A first-time customer sees *only* empty states; each now says what the
  surface is, why it's empty, and offers exactly one action.

## 4. Metrics

| Metric | Value |
|---|---|
| Commits | 3 |
| Tests | 284 → **291** (+7 pure filter tests) |
| Routes gaining loading/error | 4 (platform routes: 0 → 4) |
| Build / typecheck | pass / clean |
| Breaking changes | **0** — all behind `PLATFORM_UX_ENABLED`; legacy UI untouched |
| Roadmap | R-118/R-121/R-126 done; R-117/R-125/R-127 partial; 51 completed / 74 open |

## 5. Lessons

- **The hardest bias to catch is protecting your own work.** Yesterday's audit was rigorous about the
  *legacy* product and credulous about mine. The instruction "don't protect previous work" is what
  surfaced it — worth asking for deliberately.
- **"Better architecture" ≠ "better product."** The platform surfaces were built as *proofs the
  architecture worked*, not as *experiences* — and it showed the moment I compared them feature-for-
  feature with the pages they replace.
- **Rating something "cosmetic" is a decision, not an observation.** Visual incoherence was the
  difference between a demo that feels finished and one that doesn't.

## 6. What remains (honest)

**Not done, deliberately:**
- **Requests merge (R-122)** — Tickets + Appointments → one surface. Structural; deserves its own
  sprint now that the base is coherent.
- **Settings restructure (R-094)** — the largest and weakest surface (11 pages / 3 hierarchies / 2 agent
  trees / 3 empty dirs). Same reason.
- **R-117 partial** — legacy routes (tickets, appointments, analytics, settings, calls…) still lack
  loading/error states; only the platform routes were done.
- **R-125 partial** — Employees and Tickets still have no search.
- **R-127 partial** — the three detail-page layouts (conversation / employee / contact) are still
  divergent.
- Mobile table pass (R-120), connect wizard (R-103), outcome analytics (R-124).

**Blocked, not implementable here:** flipping `PLATFORM_UX_ENABLED` (needs staging) · R-020 calendar
(external API) · everything in `docs/LAUNCH_RUNBOOK.md`.

## 7. Is the platform UX ready to be the default now?

**Closer, but not yet — and I'd rather say so than claim otherwise.** The three flip blockers are
fixed: it no longer regresses on filtering, it's visually coherent with the pages that survive, and it
no longer lies about counts. **Remaining before I'd flip it:** the Settings restructure (R-094) and the
Requests merge (R-122) — because with the flag on, a customer still lands in a CRUD-era Settings and
sees Tickets and Appointments as two separate nav items. Those are the last structural gaps.

---

*Companion to `docs/audits/LOGGED_IN_EXPERIENCE_AUDIT.md`.*
