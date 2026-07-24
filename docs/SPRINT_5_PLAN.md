# Sprint 5 — Plan: Platform Experience (product-facing)

> **Status: SCOPED — owner decisions locked 2026-07-24; awaiting go-ahead to begin implementation.**
> The first product-facing platform sprint. Builds the AI Employees *experience* on top of the
> Sprint 4.5 foundation. Model reference: `skills/platform-architecture.md`; north star:
> `docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md` (this plan executes §2–§5, §11–§12).

## 0. Owner decisions (locked 2026-07-24)

1. **Rollout:** ship the new IA **behind `PLATFORM_UX_ENABLED`** (default OFF); old nav/routes stay
   live until flipped per-env. Dark-launch, reversible.
2. **Scope:** **Core P0–P3 this sprint** (read model · nav/shell · Conversations · Employees+Channels).
   P4 Contacts · P5 Dashboard reskin · P6 Settings/Onboarding · P7 naming sweep → **Sprint 5.5**.
3. **Onboarding (when reached in 5.5):** **narrative reskin only** — preserve the DB step-machine +
   middleware gating; no step renumbering.
4. **Leads→Contacts (when reached in 5.5):** **rename in place** (present as Contacts) + permanent
   `/leads` 301 redirect; DB column migration deferred.

**⇒ Sprint 5 (this sprint) = P0, P1, P2, P3 only.** Naming + docs for those surfaces travel with them;
the full customer-facing naming sweep (P7) and Contacts/Dashboard/Settings/Onboarding land in 5.5.

## 1. Objective

Turn the Voice-first product experience into an **AI Employees platform experience** — using the
shared model built in 4.5 — so a business perceives: *"I have AI Employees; each works across
Channels; every interaction is a Conversation with a Contact; outcomes are Artifacts."* Redesign the
IA/UX so **WhatsApp/Email will slot in as channels with no further restructuring** — without
implementing them.

**Not** infrastructure. **Not** new channels. Preserve every Voice capability and the do-not-regress core.

## 2. The pivotal architecture decision (validate before building)

**Problem:** the new surfaces (Conversations/Contacts/Channels/Employees) need REAL data now, but the
Sprint-4.5 platform model is (a) forward-populated only, (b) behind `PLATFORM_MODEL_ENABLED` (default
OFF), and (c) missing history until backfill (R-081). If Sprint 5 read straight from `conversations`,
the UI would be empty until an operator flips the flag AND backfills — coupling product UX to an
operator/staging dependency. Unacceptable for a product sprint.

**Decision — a Platform Read Model (presentation layer), decoupled from the dual-write flag.**
Introduce `lib/platform/readModel/*` that presents EXISTING legacy data in platform shape:

- **Conversations** = a unified read over `calls` (voice) + `instagram_webhook_events`/`conversations`
  (IG) → a `ConversationView` list, regardless of the flag. Voice history (in `calls`) shows
  immediately; IG shows what's captured.
- **Contacts** = a read over `leads` (+ `contacts` when present) → `ContactView`.
- **Employees** = a read over `agents` (+ `employee_channels`) → `EmployeeView`.
- **Channels** = a read over `phone_lines` + `instagram_connections` (+ `employee_channels`) →
  `ChannelView`.
- **Artifacts** = the `artifacts` view (already shipped) / `tickets`+`appointments`.

This means the UI reads a **stable platform-shaped interface** while the authoritative store migrates
underneath (dual-write → backfill → read-cutover R-085) with zero UI churn. The read model is the seam
that lets us ship product value now and converge storage later. **This is the cornerstone; everything
else hangs off it.**

Ship the whole new IA behind a **`PLATFORM_UX_ENABLED`** flag (default OFF) so current customers are
undisturbed until we cut over — same staged discipline as 4.5.

## 3. UX / product adjustments identified

- **Navigation** (`nav.tsx`, currently 9 voice-first items → target):
  `Dashboard · AI Employees · Conversations · Contacts · Channels · Tickets · Appointments ·
  Analytics · Settings`. *Phone Lines* + *Instagram* collapse into **Channels**; *Calls* becomes
  **Conversations** (filter `channel=voice`); *Leads* → **Contacts**; *Usage* folds into
  Analytics/Billing. Old routes 301-redirect (no broken bookmarks/muscle memory).
- **Dashboard**: from call-metric cards to **channel-aware + employee-aware** overview
  (conversations handled by channel, employee roster strip, artifacts created cross-channel) — keep
  the R-018 data-honesty (no Potemkin numbers; show "—" when unknown).
- **AI Employees**: a roster (each Employee → connected channels, persona/brain, status). Consolidates
  the two agent settings trees (R-063) into one Employee surface.
- **Conversations**: the unified inbox (voice transcript + chat thread via one `<ConversationThread>`
  with a per-channel renderer). Filters: channel / employee / status.
- **Contacts**: person-centric view with per-channel identities; generalizes Leads.
- **Channels**: connect/configure/monitor per channel (Voice numbers, Instagram connection; **a
  disabled "Connect WhatsApp/Email — coming soon" affordance** proves extensibility without building it).
- **Onboarding**: reframe narrative to *Create workspace → meet your AI Employee → connect a channel
  (Voice today; IG present) → go live*. **Keep the DB step-machine contract intact** (middleware gates
  `onboarding_step>=6`); this is a UI/narrative reskin + an Employee/Channel framing, NOT a step-machine
  rewrite (that risk is called out; deep restructure deferred).
- **Settings**: reorganize into **per-Employee** (brain/persona/business-context/voice) + **per-Channel**
  (Voice caps/numbers; IG connection/scopes) + workspace/billing. Fixes the two-agent-tree split (R-063).
- **Naming consistency** (R-065 extended): customer-facing **AI Employee** (not "agent"/"AI line"),
  **Conversation** (not "call" as the generic unit), **Contact** (not "lead"), **Channel**. Code
  identifiers migrate gradually behind the rename.
- **Design system**: stay on Horizon (dashboard). Reconcile the shadcn-settings split (R-064) only
  where the settings reorg touches it. **No visual re-theming for its own sake.**

## 4. Proposed phases (each = small atomic commits; flag-gated)

- **P0 — Platform Read Model + flag.** `lib/platform/readModel/*` (Conversation/Contact/Employee/
  Channel views over legacy+platform data), `PLATFORM_UX_ENABLED` flag, route scaffolding + redirects.
  *Pure/testable read layer first — the foundation for every screen.*
- **P1 — Navigation + shell.** New nav (flagged), route groups (`/dashboard/{employees,conversations,
  contacts,channels}`), redirects from old routes. Naming pass in shared chrome.
- **P2 — Conversations (the centerpiece, R-084).** Unified list + `<ConversationThread>` (voice +
  chat renderers). `/calls` → conversations?channel=voice.
- **P3 — AI Employees + Channels.** Employee roster + detail; Channels surface (Voice + IG cards +
  disabled WhatsApp/Email "coming soon"). Collapse phone-lines/instagram.
- **P4 — Contacts.** Contacts list/detail over leads+contacts; `/leads` redirect.
- **P5 — Dashboard reskin.** Channel/employee-aware overview (honest data).
- **P6 — Settings reorg + Onboarding reframe.** Per-Employee / per-Channel settings (R-063);
  onboarding narrative reskin (DB contract preserved).
- **P7 — Naming sweep + docs.** Finish customer-facing rename; update all docs; Sprint 5 review.

Recommended cut line if scope must shrink: **P0–P3 are the core** ("Employees + Conversations +
Channels" is the platform's felt shape); P4–P6 can trail into a Sprint 5.5.

## 5. Roadmap adjustments required

- **Consumes:** R-084 (unified inbox — the P2 centerpiece), and audit findings P-001 (nav), P-002
  (onboarding), P-003 (settings/design split), P-005 (naming). R-063 (two agent trees → Employee
  settings) folds into P3/P6. R-065 (AI-not-agent) extends to "AI Employee". R-010 (broken member
  invites) + R-047 (support dead-end) are natural to fix while in Settings.
- **New items to file:**
  - **R-087 (High)** — Platform Read Model (presentation layer decoupling UI from the dual-write
    flag/backfill). The Sprint-5 enabler.
  - **R-088 (Medium)** — Route back-compat: 301 redirects old→new routes; keep deep links working.
  - **R-089 (Low)** — `<ConversationThread>` channel-renderer registry (voice transcript vs chat).
- **Sequencing note:** R-085 (read cutover to `conversations` as authoritative) stays LATER and is now
  *decoupled* from UX by R-087 — the UI won't need to change when storage cuts over. R-081 backfill
  still needed before the model is the source of truth, but no longer blocks Sprint 5's UX.
- **Marketing (R-004):** the platform reframe must not appear in customer copy as "WhatsApp/Email
  available" — the Channels "coming soon" affordance is the only forward signal.

## 6. Risks & mitigations

- **Empty-UI risk** (biggest): new surfaces with no data. → **R-087 read model over legacy data** =
  real data from day one, flag-independent.
- **Disrupting live customers** during a redesign. → **`PLATFORM_UX_ENABLED` flag** + old-route
  redirects; ship dark, enable per-env.
- **Onboarding fragility** (step machine + middleware gate). → reskin narrative only; preserve the DB
  step contract; no step renumbering this sprint.
- **Naming churn / broken deep links.** → redirects (R-088); code identifiers migrate gradually behind
  customer-facing labels (R-065 discipline).
- **Scope (this is a large sprint).** → hard phase cut line (P0–P3 core); everything flag-gated so
  partial ship is safe.
- **Design-system drift** (Horizon vs shadcn). → reuse Horizon; touch shadcn only where settings reorg
  requires; no re-theme.

## 7. Definition of Done

New platform IA (Employees/Conversations/Contacts/Channels) live **behind `PLATFORM_UX_ENABLED`**,
reading real data via the platform read model; old routes redirect; naming consistent customer-facing;
Voice + IG both visible in Conversations; a "coming soon" Channels affordance for WhatsApp/Email;
**zero regression** to current (flag-off) experience; CI + build green; docs synced (roadmap,
CURRENT_SPRINT, skills, Sprint 5 review). Operator can flip the flag on staging to preview.

## 8. Explicitly OUT of scope

WhatsApp/Email implementation · new marketing site · visual re-theming · deep onboarding step-machine
rewrite · read-cutover to `conversations` (R-085) · data backfill (R-081) · Instagram reply/AI.

## 9. Open questions for the owner (before build)

1. **Flag strategy:** ship the whole new IA behind `PLATFORM_UX_ENABLED` (recommended, safe) — or
   replace the current nav directly (faster, riskier)?
2. **Scope depth:** all of P0–P7 in Sprint 5, or core **P0–P3** now + P4–P6 as Sprint 5.5?
3. **Onboarding:** reskin-only this sprint (recommended), or a fuller Employee→Channel restructure?
4. **Leads→Contacts:** rename in place, or keep `/leads` as a redirecting alias indefinitely?
