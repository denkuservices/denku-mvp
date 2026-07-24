# CURRENT SPRINT — Channel Readiness (Sprint 7)

> The active implementation sprint. Audit: `docs/audits/CHANNEL_READINESS_AUDIT.md`; model:
> `skills/platform-architecture.md` ("Adding a new channel — the contract"); review:
> `docs/SPRINT_7_REVIEW.md`.

**Sprint 7 · Started 2026-07-24 · Status: ✅ CODE-COMPLETE 2026-07-24**

> **Goal: make adding a channel *backend-only work*.** Not building WhatsApp/Telegram/Email —
> making the product architecturally + visually ready so each one is an adapter, not a redesign.
> 272 tests green; build green; voice untouched; nothing pretends to work.

## The audit finding that shaped the sprint
Applied a concrete test — *"list every file a developer must edit to add WhatsApp."* Answer: **~6
files, 4 of them UI.** The **data model + ingest pipeline were genuinely channel-agnostic** (good),
but the **presentation layer was hardcoded per channel**. So the sprint was reshaped: **make existing
surfaces registry-driven** rather than build more per-channel UI. Proof it was real — adding
`telegram` to the registry immediately **broke the build**.

## What shipped

### A — Channel capability model (R-100, R-102)  ·  ✅
`channels.ts` now carries identity (label/description/icon — the **only** place a label lives),
`connection` method (provisioned | oauth | credentials | embed) and `capabilities`
(inbound/outbound/threaded/attachments/meteredByMinutes). **Telegram added**, Web Chat surfaced,
`CHANNEL_ORDER` defines order. Instagram stays `outbound:false` (receive-only).

### B — Registry-driven presentation (R-099)  ·  ✅
`CONNECTION_SOURCES` descriptors (table + column semantics) + **one generic mapper** replace
per-channel queries/mappers; `listChannelViews` iterates the registry; Conversations filters,
ChannelBadge label/icon, and employee↔channel ownership (`ownerColumn`) all derive from it.

### C — Connection lifecycle + health (R-101, R-103 partial)  ·  ✅
`connectionHealth.ts`: `not_configured → connecting → connected → degraded → error → disconnected`,
derived from data the DB already had **and we were discarding** (IG `token_expires_at`/`last_error`).
One generic `ChannelCard` renders every channel/state; a Dashboard banner flags channels needing
attention. Silent token death is fixed — for every future OAuth channel too.

### D — The guardrail  ·  ✅
`test/channel-contract.test.ts` asserts every `CHANNEL_ORDER` channel resolves an icon, label,
ChannelView, renderer and truthful coming-soon state. **A future channel is covered the moment it's
registered** — if adding one would need a UI edit, a test fails.

### E — Employee capability model (R-104)  ·  ✅
`employeeCapabilities.ts` derives receive/reply/create_artifacts/escalate from channel capability ∩
per-employee overrides, with **stated limitations** ("can receive but cannot reply yet"). Shown on
Employee detail.

## Definition of Done — met
Adding a channel = registry entry + connection table + `CONNECTION_SOURCES` line + adapter +
creds route. **Zero UI edits**, enforced by test. Everything additive, `PLATFORM_UX_ENABLED`-gated,
truthful (unbuilt channels are disabled "Coming soon", `productionReady:false`).

## Explicitly OUT of scope
WhatsApp / Telegram / Email / SMS / Web Chat **integrations** · onboarding reframe (R-095) ·
settings reorg (R-094) · UX/nav polish (R-096/R-097) · knowledge model (R-105) · automations
surface (R-106) · read cutover (R-085) · backfill (R-081).

## Next
Owner review of product direction. Still blocking launch: **a staging env** (P0) → run
`docs/LAUNCH_RUNBOOK.md`. Then product depth (R-020 calendar, R-066 instrumentation).
