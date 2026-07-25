# Logged-In Customer Experience — CEO/Product Audit

> Audited 2026-07-25 as Head of Product of a company trying to build the best AI Employee platform —
> **explicitly not** as someone protecting previous implementation work. Findings are `Y-###`.
> This audit **overturns a conclusion I reached yesterday**; that reversal is the most important
> content here.

---

## 0. What I got wrong yesterday

Yesterday's Product Experience audit concluded: *"the Platform UX is the better product; the work is
finish-and-ship, not redesign."* I told you not to redesign the new surfaces.

**That was wrong, and I was protecting my own work without realising it.** Instructed today to
assume nothing, I measured the two products against each other instead of assuming the newer one won.
Three findings:

### Y-001 (Critical) — Flipping the flag today is a **functional regression** for voice customers
The legacy **Calls** page has **outcome filters, a date-range selector, and a phone-line filter**.
My **Conversations** page has **one channel filter**. No search, no dates, no outcome.

A customer who today asks *"show me yesterday's missed calls"* can answer it. After the flip they
**cannot**. Shipping that would be a downgrade dressed as a platform upgrade.

### Y-002 (Critical) — Flipping the flag today makes the product look **visually incoherent**
| Surface | Design system |
|---|---|
| Conversations, Contacts, Employees, Channels *(mine)* | hand-rolled Tailwind |
| Tickets, Appointments, Settings *(survive the flip)* | Horizon / shadcn components |

The platform nav doesn't replace those three — it keeps them. So a customer would navigate between
**two visual languages inside one product**. I filed this as R-096 and rated it "cosmetic, move down."
That rating was wrong: it isn't polish, it's **the thing that makes a demo feel unfinished**, and it is
a genuine blocker to flipping the flag.

### Y-003 (High) — I introduced an honesty violation (R-018)
`Conversations` fetches `limit: 100` and renders **"{n} conversations"**. With 5,000 conversations it
displays **"100 conversations."** That is a false statement about the customer's own data, produced by
the person who wrote the R-018 honesty rule. Same pattern in Contacts (`limit: 200`).

**Revised verdict:** the Platform UX is **architecturally right and experientially unfinished.** The
IA (Employees / Conversations / Contacts / Channels) is correct and I stand behind it. The
*implementation* of those surfaces is below the standard of the legacy pages it replaces, on two axes
that customers feel immediately: **filtering power** and **visual coherence**.

---

## 1. Answers to your specific questions

| Question | Verdict |
|---|---|
| **Phone Lines / Instagram as top-level products?** | **No.** Channels is the correct primary concept — they're one item per *provider*, which can't scale to 8 channels. Keep both as the channel's *management* page. (Built.) |
| **Should Conversations be canonical over Calls?** | **Yes — but not yet.** Correct destination, but only once it reaches filter parity (Y-001). Until then Calls is genuinely better. |
| **Are Tickets + Appointments the right concepts?** | **No.** They're one concept — *what the AI produced* — split because they're two tables. Merge as **Requests** (over the unused `artifacts` view). **Not "Tasks"**: reserved for R-113 pending work. |
| **Does Dashboard communicate what an AI Employee platform does?** | **No.** Both versions answer *"what happened?"*; an operator opens the app asking *"does anything need me?"* Neither leads with the AI's work. |
| **Does Settings feel premium?** | **No.** 11 pages, 3 hierarchies, 2 agent trees, 3 empty directories. It's the clearest CRUD-panel artifact left. |
| **Built by engineers, not designers?** | Settings (structure-by-accident), Usage (a `redirect()` masquerading as a page), Analytics (metrics because they were computable), and — honestly — **my own platform surfaces** (correct data, undesigned presentation). |
| **Poor first impression / demo-embarrassing?** | 1) **Empty states** — a new customer sees *only* these, and they're inert dead ends. 2) **Settings.** 3) **Any slow page** — 12/15 routes have no loading state, so the app appears frozen. |
| **Exposing DB tables instead of product concepts?** | Phone Lines, Calls, Tickets, Appointments, Usage, Leads — six nav items that are table names. Platform nav fixes five. |
| **Which future channels should show as Coming Soon?** | Already correct (Sprint 7): WhatsApp, Telegram, Email, SMS, Web Chat render automatically as disabled cards. Don't add more — that would over-promise. |

---

## 2. Cross-cutting findings

- **Y-004 (High)** — **No search anywhere in the logged-in app.** Not in Conversations, Contacts,
  Employees, Tickets. Every mature SaaS makes search the primary navigation verb at scale. → **R-125**
- **Y-005 (High)** — **No pagination.** Hard caps (100/200) with no "next" and no total. Data silently
  disappears. → **R-126**
- **Y-006 (High)** — **12/15 routes lack loading states; 13/15 lack error boundaries.** → R-117
- **Y-007 (High)** — **Empty states are inert.** They state a fact; they should teach and offer one
  action. This *is* the first-run experience. → R-118
- **Y-008 (Medium)** — **Three different detail-page layouts** (conversation / employee / contact) —
  each invented separately by me. → **R-127**
- **Y-009 (Medium)** — **No cross-page primitives.** Each surface re-implements cards, pills, headers.
  Guarantees drift. → **R-127**

---

## 3. What I now recommend — and what changes

**The IA stands. The presentation layer does not.** Concretely, before the flag can ever be flipped:

1. **Design-system alignment** (Y-002) — one set of platform primitives, visually consistent with the
   Horizon pages that survive. *Was R-096 "cosmetic/low"; now a flip blocker.*
2. **Filter + search parity** (Y-001/Y-004/Y-005) — Conversations must be a superset of Calls, never a
   subset; honest counts.
3. **States** (Y-006/Y-007) — loading, error, and empty-as-onboarding everywhere.

Only after those do the *structural* improvements (Requests merge, action-first dashboard, Settings
restructure) pay off — they'd otherwise land on an inconsistent base.

**Reprioritization:** **R-096 moves UP to P1** (flip blocker, not polish). **R-125/R-126** (search,
pagination) are new P1s — a platform that can't find anything doesn't scale past the first month.
**R-122 (Requests)** and **R-094 (Settings)** stay P1 but *after* the base is coherent. **R-121
(dashboard)** stays P1 — it's the first impression.

---

## 4. Implementation plan (this sprint — all unblocked)

Nothing here needs staging, external APIs, or operator action.

| # | Work | Findings | Why now |
|---|---|---|---|
| **1** | **Platform UI primitives** — Card, PageHeader, StatCard, EmptyState, ErrorState, DataTable shell; refactor all 4 surfaces onto them | Y-002, Y-008, Y-009 | Removes the flip blocker; everything after builds on it |
| **2** | **Loading + error boundaries** for every platform route | Y-006 | Cheapest fix for "unfinished software" |
| **3** | **Empty states as onboarding** (what it is · why empty · one action) | Y-007 | The actual first-run experience |
| **4** | **Conversations: search + date range + outcome filter + honest counts/pagination** | Y-001, Y-003, Y-004, Y-005 | Removes the regression *and* my honesty violation |
| **5** | **Contacts: search + honest counts** | Y-003, Y-004 | Same class |
| **6** | **Action-first Dashboard** — Needs attention → Today → Trends | R-121 | First impression; answers "does anything need me?" |

**Deliberately deferred** (documented, not built): Requests merge (R-122 — structural, deserves its
own sprint on a coherent base) · Settings restructure (R-094 — largest surface, same reason) · mobile
table pass (R-120) · connect wizard (R-103) · outcome analytics (R-124).

**Blocked, not implementable here:** flipping `PLATFORM_UX_ENABLED` (needs staging) · R-020 calendar
(external API) · anything in `docs/LAUNCH_RUNBOOK.md`.

---

## 5. The uncomfortable summary

We have spent four sprints on platform architecture and it is genuinely good — the data model,
channel registry, capability model and manifest versioning will hold for years. But **the surfaces a
paying customer actually touches are the least-designed part of the product**, and the newest ones are
the least-designed of all, because they were built as *proofs that the architecture worked* rather than
as *experiences*.

This sprint fixes that, and nothing in it depends on anyone but me.
