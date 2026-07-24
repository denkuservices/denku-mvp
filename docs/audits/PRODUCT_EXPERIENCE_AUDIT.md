# Product Experience Audit — every customer-facing surface

> Audited 2026-07-24 against the running code, as Principal Product Designer / Staff UX Engineer /
> PM / founder preparing for first paying customers. Findings are `X-###`, mapped to `R-###`.
> **No code written. Nothing redesigned yet.**

---

## 0. The finding that reframes this entire sprint

**The navigation you pasted is not the product we built. It's the product we're still shipping.**

The repo contains **two complete products**, and the better one is **switched off**:

| Legacy nav (what customers see) | Platform nav (built, dark) |
|---|---|
| Dashboard · Phone Lines · Instagram · Calls · Tickets · Appointments · Usage · Analytics · Settings | Dashboard · **AI Employees** · **Conversations** · **Contacts** · **Channels** · Tickets · Appointments · Analytics · Settings |

`PLATFORM_UX_ENABLED` is unset → **default OFF** → every customer today gets the voice-first CRUD nav.
Sprints 5, 5.5 and 7 built the platform experience; it has **never been switched on**, because
switching it on requires a staging environment to verify, which doesn't exist.

**This means several of your questions are already answered — and implemented:**

| Your question | Status |
|---|---|
| "Should Calls become a filtered Conversation view?" | ✅ Built. `/calls` → `/conversations`, `?channel=voice` |
| "Should Phone Lines become part of Channels?" | ✅ Built. Channels renders every channel; Phone Lines is its management page |
| "Should Instagram be standalone?" | ✅ Built. It's a channel card with real health |
| "Will WhatsApp/Email settings fit naturally?" | ✅ Sprint 7 — they appear automatically as coming-soon |

**So the highest-leverage product-experience work is NOT redesigning the legacy pages.** Most of them
are scheduled for deletion by a flag flip. Redesigning them would be building the thing twice.

**The real work is: close the gaps that keep the platform UX dark, then make it the default.**
That is a fundamentally different — and much cheaper — sprint than "redesign everything," and it's
what I'm going to recommend.

---

## 1. Cross-cutting findings (affect every page)

### X-001 — State coverage is 20% (Severity: **High** · Effort: S · Priority: P1)
Measured across the 15 dashboard routes:

| | Have it | Missing |
|---|---|---|
| `loading.tsx` | 3 / 15 | 12 |
| `error.tsx` | 2 / 15 | 13 |

**Every new platform route (`conversations`, `employees`, `channels`, `contacts`) has neither.** On a
slow connection a customer sees a frozen shell; on a query failure, Next's default error page. This is
the single most visible "unfinished software" signal, and it's cheap to fix. → **R-117**

### X-002 — Empty states are text, not onboarding (Severity: **High** · Effort: S · Priority: P1)
The new surfaces say "No conversations yet" / "No AI Employees yet" — accurate but inert. A
first-time user (who by definition sees *only* empty states) gets no path forward. Linear/Stripe treat
the empty state as the primary onboarding surface: what this is, why it's empty, one action.
**This is the actual first-run experience** and it's currently a dead end. → **R-118**

### X-003 — Dead settings directories (Severity: Low · Effort: XS · Priority: P3)
`settings/add-ons/`, `settings/business-hours/`, `settings/notifications/` exist with **no `page.tsx`**.
Nothing links to them (so no 404s today), but they're debris that will trip the next person. → **R-119**

### X-004 — 8 files render raw `<table>` (Severity: Medium · Effort: M · Priority: P2)
Unwrapped tables overflow on mobile. A business owner checks their phone between jobs — this is the
single most likely real-world viewport. → **R-120**

### X-005 — Four overlapping "agent/employee" surfaces (Severity: **High** · Effort: M · Priority: P1)
`/dashboard/agents`, `/dashboard/settings/agents`, `/dashboard/settings/agents/[id]/advanced`, and
`/dashboard/employees`. Sprint 7 redirected the first to the last (flag-on only). **Settings still owns
two more.** Nobody can answer "where do I configure my AI?" → folded into **R-094**.

---

## 2. Page-by-page

### Dashboard — *reorganize, don't beautify*
**Works:** honest data (R-018 killed the fabricated numbers — genuinely rare and valuable); the
platform version adds channel/employee awareness + a health banner.
**Doesn't:** it's **metrics-first, not action-first.** Legacy shows Est. Savings / Total Calls /
Answer Rate / a per-agent answer-rate table. Even the platform version answers *"what happened?"*
when a daily operator opens the app asking **"does anything need me?"** Nothing surfaces a failed
call, an artifact nobody has actioned, or an employee that stopped answering — except the channel-health
banner (Sprint 7).
**What Linear/Vercel do:** the top of the page is *exceptions and actions*, not vanity totals.
**Recommend:** invert it — **Needs attention** (unhealthy channels, failed calls, unactioned tickets,
usage nearing cap) → **Today** (conversations, outcomes) → **Trends**. Keep KPI tiles, demote them.
**Severity: High · Effort: M · Priority: P1** → **R-121**

### Phone Lines — *should not be a top-level page*
**Works:** provisioning + per-line detail are real, working capability (rare and hard-won).
**Doesn't:** it's a *voice-specific resource* sitting as a peer of everything else; it cannot scale to
WhatsApp/Telegram/Email without N more nav items.
**Recommend:** **already correct in the platform nav** — Channels is the surface, Phone Lines becomes
"Manage" for the voice channel. **Keep the page, remove the nav item.** Provisioning should move
*into* the channel connect flow over time (R-103), so "add a number" and "connect WhatsApp" feel like
the same action. **Severity: Medium (resolved by flag flip) · Effort: XS · Priority: P1**

### Instagram — *the template for every future channel*
**Works:** real OAuth connect/disconnect; Sprint 7 gave it genuine health (token expiry, errors).
**Doesn't:** still a top-level nav item; the connect flow is **bespoke** — no generic wizard, so
WhatsApp would hand-roll its own; there's a **TEMP admin subscribe button** still shipping (R-078);
troubleshooting is a raw error string, not guided recovery.
**Recommend:** nav item → Channels (done, flag-gated). Generalize connect into a reusable wizard
driven by `connection` method (oauth/credentials/provisioned/embed) — the registry already declares
it. Remove the TEMP button. **Severity: Medium · Effort: M · Priority: P2** → **R-103**, **R-078**

### Calls — *delete the list, keep the detail*
**Works:** rich detail (transcript, recording, cost) — genuinely the best page in the product.
**Doesn't:** as a *list*, it is Conversations filtered to one channel. Keeping both guarantees
divergence.
**Recommend:** **exactly what's already built** — `/calls` list → `/conversations`, detail preserved
and linked from the thread. **Confirmed correct; no further work.** **Severity: resolved by flag flip**

### Tickets — *the naming question, answered*
**Works:** the artifact guarantee behind it is Denku's actual moat ("never dead-end").
**Doesn't:** **"Tickets" is helpdesk jargon.** A plumber or dental clinic doesn't run a ticket queue.
Worse — **Tickets and Appointments are the same concept** (things the AI produced from a conversation),
split across two nav items purely because they're two DB tables.
**On your options:** ❌ **Tasks** — reserve that noun; R-113 needs it for *pending work* (follow-ups,
callbacks). Using it here creates a permanent collision. ❌ **Cases** (legal/enterprise-support flavour),
❌ **Work Items** (Azure jargon).
**Recommend:** merge Tickets + Appointments into one surface — **"Requests"** — with type tabs
(All / Requests / Appointments). The `artifacts` view built in Sprint 4.5 **already models exactly
this** and is unused. Keep "ticket" as an internal type name. Result: 2 nav items → 1, and the customer
sees "what my AI produced." **Severity: High · Effort: M · Priority: P1** → **R-122**

### Appointments — *merge, then make booking real*
**Works:** deterministic creation from booking intent (Sprint 4's R-019) is real.
**Doesn't:** no calendar integration — an appointment that doesn't land in the owner's calendar is a
row in a table, not a booking. This is the biggest **customer-value** gap in the product.
**Should it live under Contacts?** No — it's an outcome, not an attribute of a person. It belongs with
artifacts and *appears on* the contact (already does, via conversation history).
**Recommend:** merge into **Requests**; ship **R-020 calendar sync** as the value item.
**Severity: High (R-020) · Effort: L · Priority: P1 for value**

### Usage — *not a page; and it doesn't yet earn trust*
**Works:** the underlying math is baselined and golden-master tested (R-075) — better than most SaaS.
**Doesn't:** **`/dashboard/usage` is a pure `redirect()`** into Settings — a top-level nav item that
isn't a page. And the real page shows an estimate without explaining the rule that customers actually
dispute: **every call is rounded up to the next minute, individually** (`Σ ceil(sec/60)`). A 20-second
call bills as 1 minute. If a business owner can't reconcile the number, they don't trust the invoice —
and trust is the whole product.
**Recommend:** delete the nav item; fold usage into **Billing**; show the per-call rounding rule
explicitly with a worked example and a link to the calls that comprise the total.
**Severity: High (trust) · Effort: M · Priority: P1** → **R-123**

### Analytics — *useful, not prettier*
**Works:** Sprint 5.5's platform version is genuinely cross-channel (by channel/employee/intent + trend)
and honest about bounded windows.
**Doesn't:** it reports **activity**, not **outcomes**. "127 conversations" doesn't tell an owner
whether the AI is *working*. Missing: booking/resolution rate, missed-vs-handled, containment
(handled without escalation), and any **comparison** (vs. last period).
**Recommend:** reframe around outcomes — Handled / Booked / Escalated / Missed, each with a trend and
a drill-through to the conversations behind the number. Drop anything not tied to a decision.
**Severity: Medium · Effort: M · Priority: P2** → **R-124**

### Settings — *the weakest area, confirmed*
**Measured:** 11 pages across **three inconsistent hierarchies** (`settings/*`, `settings/account/*`,
`settings/workspace/*`), plus **two** agent surfaces, plus **three empty directories**.
**Doesn't:** organised by *when it was built*, not by the product's model. "Where do I set business
hours?" has no discoverable answer. WhatsApp settings have no natural home. Won't scale to enterprise
(no roles/SSO/data-retention surfaces).
**Recommend:** restructure around the platform model:
- **AI Employees** — per-employee brain, personality, knowledge, channels, capabilities *(absorbs both
  agent trees + advanced)*
- **Channels** — per-channel connection + config
- **Organization** — profile, team, billing & usage, audit, security
- **Integrations** — calendar, future tools
- *(future)* Knowledge · Automations
**Severity: High · Effort: L · Priority: P1** → **R-094** (re-scoped)

---

## 3. Does this feel like a modern AI product or a CRUD admin panel?

Honest answer: **the legacy nav is a CRUD admin panel** — one nav item per database table (Phone Lines,
Calls, Tickets, Appointments, Usage). The platform nav is a modern product — nouns a customer thinks in
(Employees, Conversations, Contacts, Channels).

**We already built the modern product. We're shipping the CRUD one.**

---

## 4. Priorities — and a changed recommendation

| Priority | Item |
|---|---|
| **P0** | **Close the gaps that keep the platform UX dark, then flip it** (states, empty states, parity) |
| **P1** | Requests merge (R-122) · action-first dashboard (R-121) · billing trust (R-123) · settings restructure (R-094) |
| **P1 (value)** | **R-020 calendar sync** — the appointment gap |
| **P2** | Outcome analytics (R-124) · mobile tables (R-120) · connect wizard (R-103) |
| **P3** | Dead dirs (R-119) · TEMP IG button (R-078) |

**Reprioritization I'm recommending:** R-094 (settings) moves **up** — it's the weakest surface and the
one a paying customer hits when something goes wrong. R-096/R-097 (visual polish, nav polish) move
**down** — cosmetic next to trust and IA. R-095 (onboarding reframe) stays deferred: first-run is
better served by **empty states (R-118)**, which are far cheaper and reach every surface.

---

## 5. Proposed Sprint 8.5 — "Ship the Platform Experience"

**Not a redesign sprint. A finish-and-ship sprint.** Redesigning legacy pages the flag deletes would
be building the product twice.

- **E1 — States everywhere (R-117/R-118).** `loading.tsx` + `error.tsx` for all platform routes;
  empty states rewritten as first-run onboarding (what it is · why empty · one action).
- **E2 — Requests (R-122).** Merge Tickets + Appointments into one surface over the existing
  `artifacts` view, with type tabs. Old routes redirect. 2 nav items → 1.
- **E3 — Action-first Dashboard (R-121).** Needs attention → Today → Trends.
- **E4 — Billing trust (R-123).** Fold Usage into Billing; explain per-call rounding with a worked
  example; link to the underlying calls. Delete the redirect-only nav item.
- **E5 — Settings restructure (R-094).** Four groups above; consolidate the agent surfaces; delete the
  dead dirs (R-119).
- **E6 — Parity + flip readiness.** A checklist proving no capability is lost with the flag ON, so the
  owner can flip it the moment staging exists.

**Explicitly out:** visual re-theming, onboarding step-machine rework (R-095), connect wizard (R-103),
mobile table pass (R-120 — unless E1 makes it trivial), R-020 calendar (**bigger customer value —
deserves its own sprint, and I'd support doing it *instead* of this one**).

**Definition of done:** every platform surface has loading/error/empty states; Requests replaces
Tickets+Appointments; the dashboard leads with what needs attention; a customer can understand their
bill; Settings is organised by the product's model; and a documented parity checklist says the flag is
safe to flip.

---

## 6. The alternative I'd equally support

If the goal is *first paying customer value* rather than *product coherence*, the honest alternative
is **R-020 calendar sync** — appointments that don't reach the owner's calendar are the product's
biggest broken promise, and no amount of IA fixes that. Sprint 8.5 makes the product feel finished;
R-020 makes it *work*. Both are defensible; they answer different questions.
