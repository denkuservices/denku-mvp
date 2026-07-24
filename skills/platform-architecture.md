# Skill — Platform Architecture (AI Employees model)

> How Denku's channel-agnostic platform model works, introduced in **Sprint 4.5 (Platform
> Foundation)**. Read this before touching conversations, channels, contacts, or adding a
> new channel. Canonical rationale: [docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md](../docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md).

## The idea in one paragraph

A business hires an **AI Employee** and connects **Channels** to it. Every inbound
interaction — a voice call, an Instagram DM, later WhatsApp/Email — is a **Conversation**
made of **Messages**, with a **Contact** (the person) and optional **Artifacts** (ticket /
appointment). Voice and Instagram are **channel adapters** that normalize their native
events into this one model. Adding a channel is an adapter + a connection record + a
registry line — not a new product surface.

## The model (tables)

| Concept | Table(s) | Notes |
|---|---|---|
| **Employee** | `agents` | The brain (prompt, persona, voice, business_context). NOT renamed — `agents.id` IS the employee id. |
| **Channel binding** | `employee_channels` | Employee ↔ channel ↔ connection. `channel` is **free text** (no DB enum) so a new channel needs no migration. `connection_ref` is a **polymorphic** pointer (`phone_lines.id` \| `instagram_connections.id`). |
| **Channel connection** | `phone_lines` (voice), `instagram_connections` (IG) | The channel-native creds/number. |
| **Conversation** | `conversations` | Canonical, channel-agnostic. `channel`, `external_thread_id` (native thread key), `contact_id`, `status`, `last_message_at`. |
| **Message** | `messages` | `role`, `content`, `direction`, `external_message_id` (idempotency). |
| **Contact** | `contacts` + `contact_identities` | Channel-agnostic person + per-channel handle. `UNIQUE(org_id, channel, external_id)` → idempotent resolution. Generalizes `leads` (bridged via `leads.contact_id`). |
| **Artifact** | `tickets`, `appointments` + `artifacts` view | Now carry `conversation_id`/`contact_id` (additive; `call_id` kept). The `artifacts` view is a unified read-only projection. |

Back-links: `calls.conversation_id`, `instagram_webhook_events.conversation_id/message_id`.

**All platform tables are RLS-locked (service-role only)** — same discipline as R-060.

## The code (lib/platform/)

- `channels.ts` — the channel registry (single source of truth). `productionReady` gates
  over-claim (**only voice is production-ready**); `adopted` marks channels with an adapter
  (voice, instagram). Add a channel here first.
- `flags.ts` — `platformModelEnabled()` reads **`PLATFORM_MODEL_ENABLED`** (default OFF).
  The dual-writes land dark; when OFF, legacy behavior is byte-for-byte unchanged.
- `contacts.ts` — `ensureContact()` idempotent identity→contact resolution.
- `conversations.ts` — `ensureConversation()` (idempotent per thread), `appendMessage()`
  (idempotent by `external_message_id`), `closeConversation()`.
- `ingest.ts` — **the one shared inbound pipeline**: `ingestInboundMessage(normalized, {classifyIntent?, runAutomation?, db?})`.
  Contact → Conversation → Message → optional Intent → optional Automation. Never throws.
- `adapters/types.ts` — `NormalizedInbound` + `ChannelAdapter` (pure `normalizeInbound`).
- `adapters/voice.ts` — Voice adapter (`parseTranscriptTurns` → per-turn messages).
- `adapters/instagram.ts` — IG adapter (entry → messages; echoes → assistant/outbound).
- `adapters/registry.ts` — `getChannelAdapter(channel)`.
- `wiring/recordVoiceCall.ts` — voice end-of-call recorder (record-only; links call +
  artifact to the conversation).
- `read.ts` — org-scoped read helpers (list/get conversations, messages, employee channels).

## The Platform Read Model (Sprint 5, P0)

`lib/platform/readModel/*` is the **read** counterpart to the ingest pipeline: a stable,
platform-shaped interface the new IA (Employees · Conversations · Contacts · Channels)
renders, **decoupled from storage**.

- **Sourcing (today):** it reads where data actually lives — **voice ← `calls`**, **chat ←
  `conversations`** (disjoint, no double count); Employees ← `agents`; channel ownership ←
  `phone_lines.assigned_agent_id`; channel inventory ← `phone_lines` + `instagram_connections`.
  So the new surfaces show **real data regardless of `PLATFORM_MODEL_ENABLED`**. At
  read-cutover (**R-085**) the sources swap to `conversations`/`contacts`/`employee_channels`
  with **no change to the view types or the UI**. `ConversationView.source` records provenance.
- **Employee-centric:** `EmployeeView.channels` is the ownership edge — Employees own
  Channels, never the reverse. IG connections are org-level until `employee_channels` is
  backfilled (R-081); we never invent ownership.
- **Channel-tagged for plugin rendering:** every `ConversationView`/`ConversationTurn` carries
  its `channel`, so the conversation thread UI dispatches to a **per-channel renderer via a
  registry** — a new channel's renderer registers without touching the core conversation UI.
- **Coming-soon affordances:** `comingSoonChannelViews()` derives WhatsApp/Email/SMS from the
  registry as disabled entries — extensibility is *visible* without being *built*.
- Files: `readModel/types.ts` (views), `conversations.ts`, `channels.ts`, `employees.ts`.
  Pure row→view mappers are exported for testing; async fns fetch + map, org-scoped, never throw.

The whole new experience is gated by **`PLATFORM_UX_ENABLED`** (`flags.ts`, default OFF) —
independent of `PLATFORM_MODEL_ENABLED`, so the IA dark-launches over the read model.

## Design rules (preserve these)

1. **Model-first, additive-only.** New channels/fields are additive migrations, RLS-locked,
   with a documented rollback. Never a breaking rename (that's why `agents`/`calls` stay).
2. **Idempotent everywhere.** Every write is anchored on a DB unique index (assume webhooks
   fire twice). Adapters are pure; `ingest*` never throws into a webhook hot path.
3. **Dual-write, don't cut over.** Under the flag, channels write BOTH their legacy store
   (`calls`, `instagram_webhook_events`) AND the shared model. Reads stay on legacy until a
   later, explicit cutover sprint. This is what keeps it non-breaking.
4. **No channel business logic in the pipeline.** Channel specifics live in the adapter
   (`normalizeInbound`) and in injected `classifyIntent`/`runAutomation`. Voice keeps its
   existing intent + never-dead-end artifact creation; IG stays receive-only (no reply/AI).
5. **Don't over-claim.** `productionReady` is the honesty gate — never surface a
   non-production channel as available in customer copy.

## Adding a new channel (the O(1) recipe)

1. Add it to `CHANNELS` in `channels.ts` (`adopted:false, productionReady:false` at first).
2. Add a connection table + creds (like `instagram_connections`) — additive, RLS-locked.
3. Write an adapter implementing `normalizeInbound` (pure, never throws) + register it.
4. In its webhook, after the native persist, call `ingestInboundMessage` behind the flag.
5. Register the binding in `employee_channels`. IA/inbox/contacts/artifacts pick it up.

**Do NOT** build WhatsApp/Email yet (out of Sprint 4.5 scope) — the model must be proven
with voice + IG first.

## Known follow-ups (filed, not in Sprint 4.5)

R-081 backfill (`employee_channels` from phone_lines/IG; `leads.contact_id`), R-082 IG→Employee
resolution, R-083 converge voice artifacts through the pipeline's `runAutomation`, R-084 unified
inbox UI, R-085 read cutover, R-086 message-usage billing dimension. See the roadmap.
