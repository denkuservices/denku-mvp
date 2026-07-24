# CURRENT SPRINT — Platform Foundation (Sprint 4.5)

> The active implementation sprint. Model: `skills/platform-architecture.md`; rationale:
> `docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md`; activation: `docs/SPRINT_4.5_MIGRATION.md`.
> Update task status here as you ship; mark the roadmap entry in the same change.

**Sprint 4.5 · Started 2026-07-24 · Status: ✅ `CODE-COMPLETE 2026-07-24` (operator activation pending)**

> Transforms Denku from a Voice-first product into an **AI Employees platform** while
> preserving every Voice capability. Model-first, additive-only, no breaking changes, all
> behavior gated behind **`PLATFORM_MODEL_ENABLED`** (default OFF → byte-for-byte legacy).
> **NOT** WhatsApp/Email, **NOT** a dashboard/onboarding redesign. 175 tests green; build green.

## Sprint Goal

Introduce the channel-agnostic platform backbone — **Employee · Channel · Conversation ·
Contact · Artifact** — and make **Voice and Instagram channel adapters that write into the
shared conversation model**, so future channels plug in as adapters (O(1)) instead of
bolt-ons. Preserve the artifact guarantee, idempotency, billing enforcement, tenancy.

## What shipped (by phase)

### Phase 1 — Platform model  ·  ✅ DONE 2026-07-24
- **4 additive migrations** (`20260724000000..000300`): `employee_channels`; `contacts` +
  `contact_identities` (+`leads.contact_id`); conversations/messages adoption (columns +
  idempotency indexes + `calls.conversation_id` + IG back-links; RLS enabled); artifacts
  generalization (`conversation_id`/`contact_id` on tickets/appointments + `artifacts` view).
  All RLS-locked, each with a documented rollback. `conversations`/`messages` verified EMPTY
  in prod → zero data risk.
- **lib/platform/**: `channels.ts` (registry; only voice `productionReady`), `flags.ts`
  (`PLATFORM_MODEL_ENABLED`, default OFF), `contacts.ts` (`ensureContact`), `conversations.ts`
  (`ensureConversation`/`appendMessage`/`closeConversation`) — all idempotent, org-scoped,
  never-throw, injectable client.

### Phase 2/3 — Shared pipeline + adapter architecture  ·  ✅ DONE 2026-07-24
- `ingest.ts`: **one** pipeline `ingestInboundMessage` (Contact→Conversation→Message→
  [Intent]→[Automation→Artifact]); channel specifics injected — no channel logic in the core.
- `adapters/` : `ChannelAdapter` contract + pure `voice.ts` (`parseTranscriptTurns`) +
  `instagram.ts` + `registry.ts`. New channel = adapter + registry line.

### Phase 4 — Wiring + internal plumbing  ·  ✅ DONE 2026-07-24
- **Voice**: Vapi webhook end-of-call mirrors the call into the shared model via
  `wiring/recordVoiceCall` (flagged, record-only; links call + artifact). Existing intent +
  never-dead-end artifact creation **untouched**.
- **Instagram**: webhook dual-writes DMs as Conversations/Messages (flagged; receive-only
  preserved). Raw-event persist unchanged.
- Fixed the two `/api/conversations/*` routes (dead phantom-table write + session-client
  writes that RLS would block) → `messages` via service-role + org checks.
- `read.ts`: minimal org-scoped read helpers (no UI/API surface yet — later sprint).

### Phase 5 — Documentation  ·  ✅ DONE 2026-07-24
- `skills/platform-architecture.md`, `docs/SPRINT_4.5_MIGRATION.md` (apply/rollback runbook),
  this file, roadmap (R-081..R-086 follow-ups filed), CLAUDE.md, PROJECT_VISION/CHARTER,
  `.env.example` (`PLATFORM_MODEL_ENABLED`), `docs/SPRINT_4.5_REVIEW.md`.

## Hard constraint
Read-only prod; no Vapi/IG write access. Migrations are FILES + the runbook; the flag stays
OFF until an operator applies + verifies on staging. Engineering-done vs operationally-verified.

## Definition of Done
Each phase shipped + roadmap synced; **no breaking changes**; all behavior additive/flagged;
CI green (175 tests); build green; docs synced; no regression to the do-not-regress core.

**+ Operator activation checklist** (`docs/SPRINT_4.5_MIGRATION.md`): apply 4 migrations →
verify schema/RLS/`artifacts` view → confirm flag-OFF is a no-op (voice+IG unchanged) → flip
`PLATFORM_MODEL_ENABLED` on staging → verify voice + IG dual-writes → then prod. Backfill
(R-081) is a later reviewed step.

## Explicitly OUT of scope (approved)
WhatsApp/Email channels · full dashboard/onboarding/settings redesign · Instagram reply/AI ·
read cutover (dashboard still reads legacy stores) · data backfill (R-081, later).

## Expected outcome
A true platform architecture: Voice + Instagram as channel adapters over one shared
conversation model, ready for new channels as adapters — with **zero customer-facing change
until the flag is flipped**. Next: Phase-2 platform UX (unified inbox, IA) in a later sprint.
