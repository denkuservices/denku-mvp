# Sprint 7 Review & Retrospective — Channel Readiness

- **Sprint:** 7 · **Window:** 2026-07-24 · **Status:** **code-complete**
- **Goal (verbatim):** Not to build WhatsApp/Email/Telegram — to make Denku *ready* for them, so
  implementing each new channel is mostly backend/API work instead of redesigning the product.
- **One-line verdict:** **Adding a channel is now backend-only, and a test enforces it.** The
  registry gained capability + lifecycle models; every channel surface derives from it; a contract
  test makes regressions impossible. **6 commits, 272 tests green, build green, voice untouched.**

---

## 1. The audit came first, and it changed the plan

I applied one concrete test instead of a feelings-based review: **"list every file a developer must
edit to add WhatsApp."** Answer: **~6 files, 4 of them UI** (`readModel/channels.ts` mapper+query+
coming-soon array, `ChannelBadge` icon/label maps, the Conversations filter array).

That produced a precise diagnosis: **Sprints 4.5/5/5.5 built the right surfaces but wired them
per-channel.** The data model and ingest pipeline are genuinely channel-agnostic; the *presentation*
layer was hardcoded.

**Where I disagreed with the brief, and why.** The request listed many *new* things to build (channel
pages, connection pages, dashboards, analytics, UI states). But the pages already existed — building
more would have added surface area without removing a single per-channel edit. So I reshaped the
sprint to: **make existing surfaces registry-driven, and enrich the registry with the capability +
lifecycle model the UI needs to render any channel generically.** Less code, less risk, better result.
(Documented in `docs/audits/CHANNEL_READINESS_AUDIT.md` §1.)

**I also challenged whether this should happen at all now** — the product has zero paying customers
and isn't activated, and Sprint 6 argued that scaffolding before validation is negative leverage. It
survives that challenge for three reasons: the launch is blocked on *operator* work I can't do (so
this competes with nothing); we generalize from **two real, structurally different channels** (voice =
telephony/session, Instagram = OAuth/threaded) rather than from imagination; and the owner's stated
constraint is that channel work should later be backend-only.

## 2. What shipped

| Item | Delivered | Roadmap |
|---|---|---|
| **A — Capability model** | `connection` method (provisioned/oauth/credentials/embed) + `capabilities` (inbound/outbound/threaded/attachments/meteredByMinutes) + description/icon; **Telegram added**, Web Chat surfaced; `CHANNEL_ORDER`. | **R-100, R-102 ✅** |
| **B — Registry-driven presentation** | `CONNECTION_SOURCES` descriptors + **one** generic mapper; `listChannelViews` iterates the registry; filters/badges/labels/ownership derive from it. | **R-099 ✅** |
| **C — Lifecycle + health** | `connectionHealth.ts` (6 states) from data we were discarding; generic `ChannelCard`; Dashboard "needs attention" banner. | **R-101 ✅, R-103 partial** |
| **D — Contract test** | `channel-contract.test.ts` over `CHANNEL_ORDER` — icon, label, ChannelView, renderer, truthful coming-soon. | the guardrail |
| **E — Employee capabilities** | receive/reply/create_artifacts/escalate from channel ∩ overrides, with stated limitations; on Employee detail. | **R-104 ✅** |

## 3. The moment that validated the whole thesis

Adding `telegram` to the registry **immediately broke the build** — `ChannelBadge`'s
`Record<Channel, …>` maps demanded a new entry. That is exactly the leak the audit predicted (C-001/
C-005), demonstrated live rather than argued. After the refactor, the same addition requires nothing.

## 4. Design decisions

- **Registry as the single source of truth.** Labels/icons/descriptions live in exactly one place;
  components read them. The old duplicate `LABELS` map is gone.
- **Descriptors over per-channel code.** A channel declares *where its connections live* (table +
  column semantics); one mapper does the rest. This is what removed the biggest leak.
- **Derived, not stored, capabilities.** Employee capability = channel capability ∩ overrides, so a
  new channel is correct on day one with no backfill or config.
- **Health is channel-agnostic and pure.** Any channel reporting status/expiry/error inherits expiry
  warnings and error surfacing — the Instagram silent-token-death class of bug is closed generically.
- **Honesty is structural, not editorial.** An unbuilt channel *cannot* render a Connect button; the
  card only offers disabled "Coming soon", and `productionReady` gates customer-facing claims.

## 5. Metrics

| Metric | Value |
|---|---|
| Commits | 6 (audit+roadmap · A/B/D · C · E · docs) |
| New modules | `connectionHealth.ts`, `employeeCapabilities.ts`, `_platform/channels/ChannelCard.tsx` |
| Removed | per-channel mappers/queries, duplicate label map, hardcoded filter + coming-soon arrays |
| Channels registered | 7 (voice, instagram + **telegram**, whatsapp, email, sms, web) |
| Tests | 220 → **272** (+52: channel model, contract, capabilities) |
| Build | passes · typecheck clean |
| Breaking changes | **0** (additive, flag-gated; voice path untouched) |
| Roadmap | R-099/R-100/R-101/R-102/R-104 done, R-103 partial; 47 completed / 57 open |

## 6. Lessons

- **Make the goal testable or it isn't real.** "Ready for channels" is a feeling; "adding a channel
  edits zero UI files, proven by a test over `CHANNEL_ORDER`" is a contract. The guardrail is the
  most valuable artifact here — it outlives the refactor.
- **The break was the proof.** Letting the `telegram` addition fail the build first turned an
  assertion into evidence, and told me exactly which files leaked.
- **Answer the goal, not the shopping list.** The brief asked for many new surfaces; the goal was
  removing per-channel edits. Those pointed in different directions — following the goal produced
  less code and a better outcome.
- **Discarded data is a latent product bug.** `token_expires_at` and `last_error` had been in the DB
  since Sprint 1.5, unread. A customer's Instagram would simply have gone quiet.

## 7. What remains

- **R-103 (partial):** per-channel OAuth *connect wizards* — genuinely per-channel backend work, and
  correctly deferred until a real channel needs one.
- **Filed, not built:** R-105 channel-agnostic knowledge model (business_context is still
  voice-prompt-shaped), R-106 automations as a product surface.
- **Still voice-first, deliberately deferred:** onboarding (R-095), settings (R-094), UX/nav polish
  (R-096/R-097), voice-minute-only billing (R-086).
- **Unchanged blocker:** launch needs a **staging env** (P0) → `docs/LAUNCH_RUNBOOK.md`.

## 8. Is Sprint 7 code-complete?

**Yes.** The stated goal is met and enforced: adding a channel = registry entry + connection table +
one `CONNECTION_SOURCES` line + adapter + creds route, with **zero UI edits**. Everything is additive,
flag-gated, and truthful — no channel claims to work before it does.

---

*Companion to `docs/audits/CHANNEL_READINESS_AUDIT.md` and the "Adding a new channel — the contract"
section of `skills/platform-architecture.md`.*
