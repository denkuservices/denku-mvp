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
- Files: `readModel/types.ts` (views), `conversations.ts`, `channels.ts`, `employees.ts`,
  **`aggregate.ts`** (Sprint 5.5 — pure `aggregateBy{Channel,Employee,Intent,Day}` +
  `getConversationAggregates` with an R-018-honest `limited` flag → "recent N", never a fabricated
  all-time total), **`contacts.ts`** (ContactList/DetailView over `leads`; id = lead id so `/leads/:id`
  → `/contacts/:id` is lossless; prefers `contacts`/`contact_identities` post-backfill R-081).
  Pure row→view mappers are exported for testing; async fns fetch + map, org-scoped, never throw.
- **Flagged-variant pages (Sprint 5.5):** the Dashboard home and Analytics route branch at the top —
  `if (platformUxEnabled()) return <Platform…/>` — so the legacy body is untouched and served when the
  flag is OFF (zero regression). New presentational bits live in `dashboard/_platform/` (BarList,
  home/PlatformDashboard, analytics/PlatformAnalytics).

The whole new experience is gated by **`PLATFORM_UX_ENABLED`** (`flags.ts`, default OFF) —
independent of `PLATFORM_MODEL_ENABLED`, so the IA dark-launches over the read model.

## The Platform UI / IA (Sprint 5)

The AI Employees experience is served behind **`PLATFORM_UX_ENABLED`** (`flags.ts`, default OFF).

- **Nav:** `platformNavRoutes` in `horizon-shell/nav.tsx` (Dashboard · AI Employees · Conversations ·
  Contacts · Channels · Tickets · Appointments · Analytics · Settings). The shell picks legacy vs
  platform nav via a server-resolved `platformUx` boolean threaded `(app)/layout.tsx` →
  `AppShellWrapper` → `HorizonShell` (a boolean, never JSX, crosses the boundary).
- **Surfaces** (`app/(app)/dashboard/{employees,conversations,channels,contacts}`) all read the P0
  read model — no duplicated domain logic. Shared bits in `dashboard/_platform/` (PageHeader,
  ChannelBadge, format, serverOrg resolver). New routes `notFound()` when the flag is OFF (fully dark).
- **Plugin conversation renderer** (`_platform/conversation/`): `<ConversationThread>` dispatches each
  turn to its channel's renderer via `renderers/registry.ts`. Add a channel renderer with
  `registerRenderer(channel, Component)` — the core never changes (requirement #2).
- **Redirects** (`lib/platform/routeRedirects.ts`, run in middleware when the flag is ON): only the
  fully-replaced **calls list** → `/dashboard/conversations`. Detail/management pages (call detail,
  phone-lines, instagram, leads) stay reachable and are **linked from** the new surfaces — capability
  is preserved, not hidden.

## Control plane vs data plane (Sprint 8)

Denku has **two planes and they must not merge** (audit `docs/audits/AI_EMPLOYEE_CORE_AUDIT.md`):

- **Control plane — the Employee.** What an employee *is*: identity, personality, brain/voice
  binding, knowledge + tool **references**, channel bindings, policies. Hundreds of rows per org,
  changed deliberately by humans, needs **versioning, review, rollback, audit**.
- **Data plane — the Conversation.** What actually *happened*: conversations, messages, contacts,
  artifacts, usage. Millions of rows, machine-written, needs throughput and retention.

"Employee is the core" means **core of the control plane** — Conversation remains the core of the
data plane. Hanging conversations off the employee would repeat the voice-first mistake at scale.

### Employee Manifest (R-107) — `lib/platform/manifest/`
An **immutable, versioned revision** of an employee's desired configuration (`employee_manifests`).

- **Two rules encoded in the type** (`manifest/types.ts`):
  1. **Desired state only.** `cost`, `KPIs`, `health` are absent by design — they're computed from
     the data plane. A revision is immutable; metrics are not. `validateManifest` *rejects* them.
  2. **Reference, never embed.** Knowledge/tools/automations are `*Refs`. Embedding would mean 500
     employees = 500 copies of the same FAQ, and shared knowledge would be impossible.
- **Append-only + content-hashed** (`manifest/build.ts`): a no-op save cannot mint a revision; a real
  change always does, and prior revisions are never mutated.
- **`ensureCurrentRevision()`** (`manifest/revisions.ts`) is idempotent, race-safe, never throws, and
  **inert until the migration is applied**.
- **Provenance:** `calls.manifest_revision_id` / `conversations.manifest_revision_id` record *which
  revision handled a conversation* — so "what prompt/model ran last Tuesday?" is answerable. This is
  the part that **cannot be retrofitted**: unrecorded history is unrecoverable.
- **Descriptive first, authoritative later.** The manifest currently *records* what runs (provider,
  model, voice, tools still live in code). R-108 makes the same fields authoritative — no shape
  change, no migration.

**Rule:** when you change how an employee behaves, make sure a revision is minted (pass a `reason`).
Never mutate a stored revision.

**Memory is NOT part of the manifest** — see `docs/MEMORY_CONTRACT.md` (R-110). Memory is
accumulated, per-subject, decaying and **erasable**; knowledge is curated and versioned. Never write
memory into a prompt/knowledge blob.

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

## Adding a new channel — the contract (Sprint 7)

**Adding a channel is backend work. It must require ZERO UI edits.**
`test/channel-contract.test.ts` enforces this: every assertion runs over `CHANNEL_ORDER`, so a
newly-registered channel is covered automatically — if it would need a UI change, a test fails.

1. **Register it** in `CHANNELS` (`channels.ts`) with `adopted:false, productionReady:false`.
   Declare `connection` (provisioned | oauth | credentials | embed) and `capabilities`
   (inbound/outbound/threaded/attachments/meteredByMinutes) — **these drive the UI**, so getting
   them right is the whole job. It immediately appears as a truthful "Coming soon" card.
2. **Add its connection table** (like `instagram_connections`) — additive, RLS-locked — and a
   line in `CONNECTION_SOURCES` (`readModel/channels.ts`) naming its columns
   (`identifierColumn`, `statusColumn`, `expiresColumn`, `errorColumn`, `ownerColumn`). It now
   renders with real health, and Employee↔Channel ownership works.
3. **Write the adapter** (`normalizeInbound`, pure, never throws) + register it. Flip `adopted:true`.
4. **In its webhook**, after the native persist, call `ingestInboundMessage` behind the flag.
5. **Only when it genuinely works end-to-end**, flip `productionReady:true`. Never before —
   that flag is the honesty gate for customer-facing copy.

Everything else — Channels card + health, Conversations filter, channel badge/label/icon,
Employee capabilities, analytics breakdowns, coming-soon states — **derives from the registry**.

**Optional:** a channel-specific turn renderer (`renderers/registry.ts`); without one the default
bubble renders fine. `CHANNEL_ORDER` controls display order.

**Do NOT** build WhatsApp/Telegram/Email integrations until the model is proven live with
voice + Instagram.

## Channel capability, health, and employee capability

- **`channels.ts`** — static per-channel truth: identity (label/description/icon), `connection`
  method, `capabilities`, `productionReady` / `adopted`. **The only place a channel label lives.**
- **`connectionHealth.ts`** (R-101) — per-*connection* runtime state: `not_configured → connecting
  → connected → degraded → error → disconnected` (+ `coming_soon`), derived from status/expiry/
  error. Pure and channel-agnostic: a new channel that reports those gets expiry warnings and
  error surfacing for free (Channels cards + a Dashboard banner).
- **`employeeCapabilities.ts`** (R-104) — what an Employee may *do* on a channel
  (receive/reply/create_artifacts/escalate), derived from channel capability ∩ per-employee
  overrides, with **stated limitations** (Instagram: "can receive but cannot reply yet").

## Known follow-ups (filed, not in Sprint 4.5)

R-081 backfill (`employee_channels` from phone_lines/IG; `leads.contact_id`), R-082 IG→Employee
resolution, R-083 converge voice artifacts through the pipeline's `runAutomation`, R-084 unified
inbox UI, R-085 read cutover, R-086 message-usage billing dimension. See the roadmap.
