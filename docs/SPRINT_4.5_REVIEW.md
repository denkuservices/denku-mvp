# Sprint 4.5 Review & Retrospective — Platform Foundation

- **Sprint:** 4.5 · **Window:** 2026-07-24 · **Status:** **code-complete; operator activation pending**
- **Goal (verbatim):** Transform Denku from a Voice-first product into an AI Employees platform while
  preserving every existing Voice capability — model-first, additive-only, no breaking changes, all
  behavior feature-flag friendly, no WhatsApp/Email, no dashboard/onboarding redesign.
- **One-line verdict:** **The channel-agnostic platform backbone is built and adopted behind a flag.**
  Voice and Instagram are now channel adapters writing into one shared conversation model; a new
  channel is an adapter + connection + registry line. 175 tests green, build green, 6 atomic commits,
  **zero customer-facing change until `PLATFORM_MODEL_ENABLED` is flipped.**

---

## 1. What shipped

| Phase | Delivered |
|---|---|
| **1 — Model** | 4 additive, RLS-locked migrations: `employee_channels`; `contacts`/`contact_identities` (+`leads.contact_id`); conversations/messages adoption (columns, idempotency indexes, `calls.conversation_id`, IG back-links); artifacts generalization + `artifacts` view. `lib/platform/` channels registry, flag, idempotent `ensureContact`/`ensureConversation`/`appendMessage`. |
| **2/3 — Pipeline + adapters** | One shared `ingestInboundMessage` pipeline (Contact→Conversation→Message→[Intent]→[Automation]); pure `ChannelAdapter` contract + voice/instagram adapters + registry. No channel logic in the core. |
| **4 — Wiring + plumbing** | Voice (`recordVoiceCall`) + Instagram dual-writes into the shared model (flagged); fixed 2 latent `/api/conversations/*` defects; org-scoped read helpers. |
| **5 — Docs** | `skills/platform-architecture.md`, `SPRINT_4.5_MIGRATION.md` (apply/rollback), roadmap (R-081..R-086), CLAUDE/CHARTER/VISION, `.env.example`, this review. |

## 2. Architectural decisions (validated against the audit)

- **Employee = `agents` (no rename).** A breaking rename of `agents`/`calls` was rejected; the audit's
  "generalize agents" is achieved additively via `employee_channels`. Backward compatibility preserved.
- **Adopt the EXISTING `conversations`/`messages`** (P-004) rather than new tables — they were present,
  empty (verified 0 rows in prod), and already had API routes. Enriched additively; zero data risk.
- **`channel` stays free text (no DB enum).** A new channel needs code, not a migration — the audit's
  O(1)-per-channel goal. The allowed set is a code registry (`channels.ts`) with a `productionReady`
  honesty gate (only voice today — no over-claim).
- **Dual-write, not cut over.** Under the flag, channels write BOTH legacy (`calls`,
  `instagram_webhook_events`) AND the shared model; reads stay legacy. This is what makes the whole
  sprint non-breaking. Read cutover is a later sprint (R-085).
- **Adapters pure; pipeline never throws; intent/automation injected.** Voice keeps its existing
  end-of-call intent + never-dead-end artifact creation untouched (a deliberate NON-convergence this
  sprint — see R-083); Instagram stays receive-only (no reply/AI). The pipeline's `runAutomation` hook
  is the seam to unify voice later, safely.
- **RLS-locked from day one** on every new table (+ conversations/messages), continuing R-060.

## 3. The hard constraint (why "code-complete", not "verified")

Read-only prod; no Vapi/IG write access; no staging env. Migrations are FILES + a runbook; the flag
stays OFF until an operator applies the 4 migrations and verifies the dual-writes on a real
call / signed IG Test event. So this is engineering-done; `docs/SPRINT_4.5_MIGRATION.md` is the gate.

## 4. Operator activation (the go-live gate)

Full steps in `docs/SPRINT_4.5_MIGRATION.md`. In short: apply the 4 `20260724*` migrations → verify
schema + RLS + the `artifacts` view → confirm **flag-OFF is a no-op** (voice + IG behave exactly as
before) → flip `PLATFORM_MODEL_ENABLED` on **staging** → verify a call creates a `conversations`
row + per-turn `messages` + linked `calls.conversation_id`/artifact, and an IG Test message creates a
conversation/message → then prod. Backfill (`employee_channels`, `leads.contact_id`) is a separate
reviewed step (R-081).

## 5. Metrics

| Metric | Value |
|---|---|
| Commits | 6 (migrations · lib · pipeline+adapters · wiring · read plumbing · docs) |
| New tables | 3 (`employee_channels`, `contacts`, `contact_identities`) + 1 view (`artifacts`) |
| New migrations | 4 (all additive, RLS-locked, rollback documented) |
| New lib | `web/src/lib/platform/*` (channels, flags, contacts, conversations, ingest, adapters, wiring, read) |
| New env | `PLATFORM_MODEL_ENABLED` (default OFF) |
| Tests | 139 → **175** (+36 platform), all green |
| Build | passes |
| Breaking changes | **0** (additive + flagged; 2 dead/broken routes strictly improved) |
| Roadmap | +6 follow-ups (R-081..R-086); 31 completed / 53 open |

## 6. Lessons

- **The backbone was already sketched — the win was adoption, not invention.** The single highest-
  leverage finding (P-004) was that `conversations`/`messages` existed but were unused. Confirming they
  were empty in prod turned a "risky migration" into a safe enrichment.
- **A latent bug surfaced by adoption.** The old `/api/conversations/message` route wrote to a
  non-existent `conversation_messages` table (dead), and both routes used the session client that the
  new RLS would block. Adopting the model forced — and got — the fix. Enabling RLS on a table you
  touch means auditing every writer to it.
- **Non-convergence can be the right call.** Routing voice's artifact creation through the shared
  pipeline was tempting but would destabilize the 3,100-line webhook + the never-dead-end guarantee.
  Recording-only + a documented `runAutomation` seam (R-083) is the safe order: prove the model, then
  converge.
- **Flag-gated dual-write is the non-breaking superpower.** Every behavioral change is inert until one
  env var flips, and reversible by unflipping — no code revert needed to roll back.

## 7. Follow-ups filed (NOT in scope; for later sprints)

R-081 backfill · R-082 IG→Employee resolution · R-083 converge voice artifacts via `runAutomation` ·
R-084 unified Conversations inbox UI (Phase-2 platform UX) · R-085 read cutover · R-086 message-usage
billing dimension.

## 8. Handoff → next

**Operator:** run `docs/SPRINT_4.5_MIGRATION.md` (needs a staging env — the standing prerequisite).
**Product/eng next sprint:** Phase-2 platform UX (R-084) — the unified inbox + Employee/Contacts/
Channels surfaces — now that the model can back them. WhatsApp/Email remain deferred until the model
is proven live with voice + IG.

---

*Living companion to the roadmap. Sprint 4.5 is done-in-code; it is operationally verified when the
§4 activation is green on staging with the flag on.*
