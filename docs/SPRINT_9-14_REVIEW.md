# Sprints 9–14 Review — One Product (the Phase-2 IA arc)

- **Sprints:** 9, 10, 11, 12, 13, 14 · **Window:** 2026-08-24 → 2026-08-25 · **Status:** **code-complete, merged-pending, dark**
- **Branch:** `feat/sprint-9-one-product` (6 commits, pushed to origin 2026-08-25)
- **One-line verdict:** **Six sprints turned a correct skeleton wearing two bodies into one coherent
  product — and every line of it is still switched off.** 125 files, **+5,204 / −5,827** (the arc
  deleted more than it wrote), tests **392 → 520 green**, build green, zero new flags.

> **Why one review for six sprints.** They are one continuous argument, executed in six moves, and
> reviewing them separately would hide the only thing that matters about them: each sprint removes a
> door, a duplicate or a dead end that the previous one exposed. This document is written *after* the
> fact (the sprint-closing ritual was skipped at the time — see §6), which is itself the review's
> most important finding.

---

## 1. The thesis the arc was executing

Sprint 8.5 ended with a verdict: **the IA is right; the presentation layer is below the standard of
the pages it replaces.** Sprints 9–14 are that verdict carried out. The product had the correct
skeleton (Home / Inbox / CRM / AI Team) and was still wearing the legacy body underneath it —
two headers, four doors to one editor, two tables for one concept, channels promoted to nav items
the architecture had already demoted, and an analytics page that had *lost* capability in the move.

The through-line: **one product, one door per thing, no dead ends, nothing fabricated.**

## 2. What each sprint actually did

| Sprint | Commit | The duplicate it removed | Tests |
|---|---|---|---|
| **9 — One product** | `c9b68a2` | **Two competing H1s on every screen.** `HorizonTopbar` rendered a title + breadcrumb on top of every platform `PageHeader`; unknown routes title-cased their URL segment and **printed a UUID as the heading**. Killed the topbar title, the `routeMeta` map, the derivation, the write-only global search, the handler-less bell/info buttons, the stock `avatar4.png`. Closed the **appointment dead end** (rows linked to a route middleware bounced straight back — no appointment's details were reachable *anywhere* in the product). Usage/Integrations honesty; 3 fake Phone-Line controls with no column to save to, deleted. | 392 → **423** |
| **10 — One employee** | `237e692` | **Four doors to one editor** (Settings→agent, its Advanced, Phone Line→Advanced writing the same row through the same action, and a read-only mirror that linked back out). One door now: AI Team → employee → Setup / Knowledge. **A UI and read-model relocation, not a write-path redesign** — `updateAgentConfiguration`, `updateAgentPromptOverride`, `assistantConfig.ts`, prompt derivation and the manifest store are byte-for-byte unchanged. | 423 → **457** |
| **11 — Channels absorb** | `f90163d` | **Voice re-privileged as a nav item** after `employee_channels` had just demoted it to one channel among peers — and the precedent that WhatsApp would arrive wanting its own page. Phone Numbers and Instagram moved under Channels as **git renames** so history follows the files. Also fixed a real absence: the product's central noun **could not be created from its own surface** — "Hire an AI employee" now lives on AI Team, "Add contact" in Customers. | 457 → **474** |
| **12 — Evidence** | `9d5b8c0` | **A functional regression shipped as an upgrade.** The platform Analytics that replaced the legacy page had one fixed 14-day window, four tiles and three bar lists — against a page with 7/30/90-day ranges, period comparison, per-agent tables, hourly traffic, request funnel, response times and owner CSV export. All restored, now cross-channel rather than voice-only. | 474 → **497** |
| **13 — Requests whole** | `c737f0d` | **One concept at two URLs.** Tickets and appointments resolve at one shape, `/dashboard/crm/requests/:id?type=…`. **The 347-line ticket body was moved, not rewritten** (status/priority transitions, comments, activity log must not regress). And: *a call is a conversation* — recording and cost moved into the conversation's context rail, so hearing a call no longer means leaving the thread for a differently-styled page. | 497 → **514** |
| **14 — Single track** | `a22f927` | **The fourth design system.** All **314 `zinc-*` references across 20 files** gone, each mapped to a platform equivalent **and a dark counterpart** — so the pages render correctly in both themes rather than swapping one light-only palette for another. Billing deliberately untouched (**R-131** stands). | 514 → **520** |

## 3. The decisions that hold up

**Move, don't rewrite.** Sprint 10's forms and Sprint 13's ticket body were relocated with their logic
untouched, because both sit on live write paths — one speaks to a customer through a live assistant,
the other carries state transitions a business depends on. The parity test in Sprint 10 **parses the
zod schema out of the server action itself** and compares it to the editor's field list, so drift on
either side fails loudly instead of silently dropping a field. That is the right shape for this kind
of move.

**Honesty encoded as suppression, not estimation.** Sprint 12's period-over-period delta is
**suppressed whenever the scan was bounded** — a truncated scan loses the oldest rows first, precisely
the baseline a delta divides by, so reporting one would show growth that did not happen. Estimated
savings reuses the legacy formula and its `$25/hour` constant *exactly*, labelled an estimate
everywhere, because it stands in for a human answering a phone and is not a measured rate for any
particular business. This is R-018 applied where it is genuinely inconvenient.

**Every retired URL still resolves.** Across all six sprints: ticket detail, ticket create, call
detail, the old creator URLs, phone-lines, instagram — each redirects, and Sprint 11's forwards are
deliberately **not** flag-gated because the legacy sidebar still links to them with
`PLATFORM_UX_ENABLED` off.

**The rollback path was defended against its own author.** Sprint 14 was authorised to go single-track
— delete the dormant legacy bodies, `horizonNavRoutes` and the flag itself — and **declined**, because
the authorising decision required a 2–4 week bake after Sprint 12 plus cutover readiness and a quiet
support window, none of which can be satisfied from a working session. It then **added tests that
assert the legacy bodies, the legacy nav and the flag are all still present.** Removing the rollback
path early would have contradicted a recorded decision; instead the constraint was made executable.

## 4. Known gaps carried out of the arc (not hidden)

| # | Gap | Recorded in |
|---|---|---|
| 1 | **`resolveLanguage` matches a leading `"es"`, but settings store the language NAME** — so `"Spanish"` resolves to English and a Spanish employee gets an English voice and transcriber. Pre-existing; Sprint 10 was required to preserve behaviour exactly. **Now filed as R-135.** | Sprint 10 commit |
| 2 | With `PLATFORM_UX_ENABLED` **off**, the prompt-override editor is **not reachable** (consequence of deleting the legacy form components). Full capability with the flag on. | Sprint 10 commit |
| 3 | Legacy (flag-off) list pages have **no `h1` of their own** — the topbar was their only title, so the rollback path is visually untitled. Cosmetic; no route, data or capability affected. | Sprint 9 commit |
| 4 | Sprint 9's search-overlap fix was **not visually verified** — the founder-reported defect could not be reproduced without authenticated browser access; the fix addresses the one geometry defect provable from source (`CommandInput` wrapping an `h-10` input, raised to `h-12` by its caller, inside a fixed `h-9` box). | Sprint 9 commit |
| 5 | **Minting a manifest revision on save was deliberately NOT added** — revisions are still created only at call time. A test asserts this, so adding it becomes a decision rather than an accident. | Sprint 10 commit |
| 6 | Billing (`workspace/billing`, 1,432 lines) keeps its `zinc` palette — **R-131** stands. | Sprint 14 commit |

## 5. Verification (re-run 2026-08-25, at review time)

```
Test Files  47 passed (47)
Tests      520 passed (520)
exit code 0
```

Not a claim inherited from the commit messages — the suite was re-run against the branch head while
writing this document.

## 6. The process failure this review exists to record

**Six sprints shipped without a single closing ritual.** Concretely, as found on 2026-08-25:

1. **The branch had never been pushed.** `feat/sprint-9-one-product` had no upstream — the entire
   Phase-2 IA existed on one local disk, one hardware failure from total loss. *(Fixed: pushed
   2026-08-25.)*
2. **No review documents.** Sprints 1–8.5 each have one; 9–14 had none. *(This document.)*
3. **`CURRENT_SPRINT.md` still described Sprint 8.5** — three weeks and six sprints stale.
4. **`IMPLEMENTATION_ROADMAP.md` was last updated 2026-07-25** and its highest ID was R-133, so
   **R-134** (the 2026-07-30 migration-history/RLS correction, recorded in `CLAUDE.md`) was **never
   filed**. Six sprints of R-item movement went untracked.
5. **The decisions that shaped the arc (D1–D7) are not written down anywhere.** They are referenced
   by number in five of the six commit messages — "per decision D3", "per decision D7" — and exist in
   **no document in this repository**. The commit messages are currently the only record that they
   were made at all. *(Recorded here; see the table in §2 for what each visibly produced. The
   register itself is not reconstructable and should be re-established going forward, not invented
   retroactively.)*

The commit messages themselves are unusually good — genuinely better than most of the review docs
they should have fed. That is what makes the omission worth naming: **the discipline was present in
the writing and absent in the filing.**

## 7. The verdict that matters

The arc did what it set out to do. The authenticated experience is now coherent, has one door per
thing, no dead ends the audit found, and — per the 2.0 research package (doc 10) — **is at or above
every US SMB competitor surveyed** on inbox, memory and honesty.

**And none of it is on.** `PLATFORM_UX_ENABLED` is off, the branch is unmerged, and the migrations
these sprints assume are unapplied. Six sprints of work that a customer cannot see is the exact
failure mode the first-paying-customer audit named a month earlier — *"code-complete was technically
true and practically meaningless"* — repeated at larger scale by the author of that lesson.

**This is not an argument for building less. It is the argument for D0.** The next sprint writes no
feature code: it turns on what these six sprints built.

→ [docs/SPRINT_D0_TURN_IT_ON.md](SPRINT_D0_TURN_IT_ON.md) · [docs/LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md)
