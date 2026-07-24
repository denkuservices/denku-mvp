# CURRENT SPRINT — Platform Experience (Sprint 5)

> The active implementation sprint. Plan: `docs/SPRINT_5_PLAN.md`; model: `skills/platform-architecture.md`;
> north star: `docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md`. Update task status here as you ship.

**Sprint 5 · Started 2026-07-24 · Status: 🚧 IN PROGRESS — P0 done; P1–P3 pending**

> The first product-facing platform sprint: turn the Voice-first UI into an **AI Employees
> experience** on the Sprint 4.5 foundation. Everything ships **behind `PLATFORM_UX_ENABLED`**
> (default OFF → current dashboard unchanged). Scope = **core P0–P3**; Contacts, dashboard
> reskin, settings reorg, onboarding reframe, naming sweep → **Sprint 5.5**. Additive-only,
> zero regressions. NOT WhatsApp/Email, NOT a re-theme.
>
> Sprint 4.5 (Platform Foundation) is code-complete; operator activation pending
> (`docs/SPRINT_4.5_MIGRATION.md`).

## Owner decisions (locked 2026-07-24)
Rollout **behind `PLATFORM_UX_ENABLED`** · scope **core P0–P3** (rest → 5.5) · onboarding
**reskin-only** (5.5) · Leads→Contacts **rename + `/leads` redirect** (5.5).

## Design invariants (owner requirements)
1. **Employees own Channels** — the read/UI model is Employee-centric, never channel-resource-centric.
2. **Plugin conversation renderer from day one** — the thread UI dispatches per-channel via a
   registry; new channel renderers (WhatsApp/Email/SMS/WebChat) register without core changes.

## Phases (this sprint = P0–P3)

### P0 — Platform Read Model + flag  ·  ✅ DONE 2026-07-24
- `PLATFORM_UX_ENABLED` flag; `lib/platform/readModel/*` — Conversation/Employee/Channel views
  over **existing legacy data** (voice←`calls`, chat←`conversations`, employees←`agents`,
  channels←`phone_lines`+`instagram_connections`), decoupled from `PLATFORM_MODEL_ENABLED`.
  Channel-tagged views (renderer seam), Employee-centric ownership, coming-soon affordances.
  11 tests; 186 total green; typecheck clean.

### P1 — Navigation + shell  ·  ⏳ NEXT
- New flagged nav (`Dashboard · AI Employees · Conversations · Contacts · Channels · Tickets ·
  Appointments · Analytics · Settings`); route groups `/dashboard/{employees,conversations,
  contacts,channels}`; 301 redirects old→new (calls→conversations, phone-lines/instagram→channels,
  leads→contacts). Naming pass in shared chrome. Old nav served when flag OFF.

### P2 — Conversations (centerpiece, R-084)  ·  ⏳
- Unified inbox over `listConversationViews`; **plugin `<ConversationThread>`** with a
  per-channel renderer registry (voice transcript + IG chat renderers registered; core
  untouched by future channels). `/calls` → `/dashboard/conversations?channel=voice`.

### P3 — AI Employees + Channels  ·  ⏳
- Employee roster/detail (`listEmployeeViews`; Employees own channels). Channels surface
  (`listChannelViews`) collapsing Phone Lines + Instagram + disabled "Connect WhatsApp/Email —
  coming soon".

## Definition of Done (Sprint 5)
New IA (Employees/Conversations/Channels) live **behind `PLATFORM_UX_ENABLED`**, reading real
data via the read model; old routes redirect; Voice + IG both in Conversations; renderer
registry plugin-based; **zero regression** to the flag-off experience; CI + build green; docs
synced (this file, roadmap, skills, Sprint 5 review). Operator can flip the flag on staging.

## Explicitly OUT of scope
WhatsApp/Email · full dashboard/onboarding/settings redesign (5.5) · Contacts surface (5.5) ·
visual re-theme · read-cutover (R-085) · backfill (R-081).

## Roadmap items in flight
R-084 (unified inbox, P2) · R-087 (read model, P0 ✅) · R-088 (route redirects, P1) · R-089
(conversation renderer registry, P2). Audit P-001 (nav), P-003 (settings, 5.5), P-005 (naming).
