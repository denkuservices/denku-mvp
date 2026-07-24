# CURRENT SPRINT — Platform Experience: Depth & Consistency (Sprint 5.5)

> The active implementation sprint. Proposal + finalized order: `docs/SPRINT_5.5_PROPOSAL.md`;
> model: `skills/platform-architecture.md`; review: `docs/SPRINT_5.5_REVIEW.md`.

**Sprint 5.5 · Started 2026-07-24 · Status: ✅ CORE COMPLETE 2026-07-24 — operator flag-flip pending**

> Made the daily-use surfaces platform-shaped on top of the Sprint 5 IA — all behind
> **`PLATFORM_UX_ENABLED`** (default OFF → legacy dashboard/analytics served unchanged),
> read-model-first, zero regression. Scope = **core Q0–Q3**; Settings reorg (R-094),
> Onboarding reframe (R-095), Horizon/UX consistency (R-096), nav polish (R-097) → **Sprint 6**.

## Finalized execution order (leaves before hub — architecture review 2026-07-24)
Q0 read-model depth → **Contacts** → **Analytics** → **Dashboard (last)**. Rationale: build the
hub (Dashboard links to Contacts/Analytics) last over a proven aggregation layer; prove that layer
on Analytics before the honesty-sensitive Dashboard; ascending risk. Zero customer cost (all flagged).

## What shipped

### Q0 — Read-model depth  ·  ✅ DONE
- `readModel/aggregate.ts` (pure aggregateBy{Channel,Employee,Intent,Day} + `getConversationAggregates`
  with an R-018-honest `limited` flag + `getArtifactCounts`); `readModel/contacts.ts` (ContactList/
  DetailView over `leads`, id = lead id → lossless redirect; history matched by contact id/handle). 8 tests.

### Contacts (was Q2)  ·  ✅ DONE
- Real `/dashboard/contacts` list + `contacts/[id]` detail (identities, notes, conversation history);
  conversation detail → contact link; `/dashboard/leads[/:id]` → `/contacts[/:id]` redirect (lossless;
  create form kept reachable).

### Analytics (was Q3)  ·  ✅ DONE
- Flagged `PlatformAnalytics` variant: KPI tiles + conversations by channel / employee / intent + 14-day
  trend over the aggregation layer; dependency-free `BarList`. Legacy analytics served when flag OFF.

### Dashboard (was Q1, built last)  ·  ✅ DONE
- Flagged `PlatformDashboard` home: KPI tiles, by-channel, employee roster strip, recent conversations,
  deep-links to every platform surface. `/dashboard/agents[/:id]` → `/employees[/:id]` redirect
  (consolidates the standalone agent roster; NOT settings/agents) + "AI Employee" naming (R-092).

## Definition of Done
Dashboard + Contacts + Analytics live behind `PLATFORM_UX_ENABLED`, reading the read model, legacy
fallbacks intact (zero regression); CI (202 tests) + build green; docs synced. Operator flips the flag
on staging to walk the full experience.

## Explicitly OUT of scope (→ Sprint 6)
Settings reorganization (R-094) · onboarding reframe (R-095) · Horizon/`_platform` UX consistency (R-096)
· nav polish (R-097) · full customer-facing naming sweep across legacy pages (R-065) · R-081 backfill ·
read cutover (R-085).

## Expected outcome
On login (flag ON) a business sees a channel/employee-aware Overview, a real Contacts book, and
cross-channel Analytics — the product now *feels and measures* like an AI Employees platform, with the
current experience byte-for-byte unchanged until the flag is flipped.
