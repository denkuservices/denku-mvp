# Skill: Vapi integration

> Everything Denku does with Vapi: assistants, phone numbers, the webhook pipeline, tools, and the
> marketing demo agent. This is the most complex subsystem — read fully before editing.

## Client & auth

- All server-side calls go through `web/src/lib/vapi/server.ts` → `vapiFetch<T>(path, init)`:
  `https://api.vapi.ai` + `Authorization: Bearer ${VAPI_API_KEY}`, `cache: no-store`, logs
  sanitized request/response, throws `Error("Vapi error <status>: <text>")` on non-2xx.
- Error-status parsing convention used by callers: `msg.match(/Vapi error (\d+):/)` → map 400 → 400
  response, anything else → 502.
- Browser demo calls use `@vapi-ai/web` with `NEXT_PUBLIC_VAPI_PUBLIC_KEY`; the assistant ID comes
  from `POST /api/vapi/start` (returns `VAPI_AGENT_ID` env or hardcoded fallback
  `155b21ad-2f8b-4593-b33c-c5021e644328`).

## Assistants — creation rules (hard-won)

**Since 2026-07-08 (R-050/R-077): assemble assistant config through ONE helper —
`lib/vapi/assistantConfig.ts#ensureAssistantConfig` — never hand-roll a `model` PATCH.** It does
GET→merge→PATCH, always keeping `model.toolIds` merged (never replaced) and setting the webhook
`server.url`. All three paths call it: `runActivation`, the purchase route, and `syncAgentToVapi`.

1. **NEVER send a top-level `tools` field on `POST /assistant`** — Vapi returns 400. Create the
   assistant with model+firstMessage only, then call `ensureAssistantConfig` to attach tools +
   server. (The helper's `buildAssistantConfigPatch` is the pure, unit-tested core.)
2. Tool IDs are **hardcoded** (created once in the Vapi dashboard), now centralized as
   `DENKU_TOOL_IDS` in `assistantConfig.ts`:
   - `create_ticket` = `6c9b0279-dd71-4511-827f-a3e75b884773`
   - `create_appointment` = `5373add8-b7d2-49f0-a866-f60167a1e624`
   If the Vapi account changes, these break.
3. The assistant's `server.url` is the **webhook** (`/api/webhooks/vapi`), set from explicit env
   (`VAPI_WEBHOOK_BASE_URL` → `NEXT_PUBLIC_SITE_URL`; localhost/`VERCEL_URL` refused). When
   `VAPI_WEBHOOK_SECRET` is set, the helper also sends the `x-vapi-secret` header (Task 5 auth).
   ⚠ Note: the two tools are account-level `apiRequest` tools carrying their own **absolute prod
   URLs**, so mid-call tool execution is independent of the assistant `server.url` — the latter is
   only for call events (end-of-call reports → the webhook). ⚠ Assistants created before 2026-07-08
   still carry the old `serverUrl = localhost/api/tools` until the reconcile endpoint is run
   (`POST /api/internal/reconcile-vapi-assistants`).
4. Two assistant flavors exist:
   - **"Main Line"** (onboarding activation): GPT-4o, templated system prompt interpolating the
     workspace name, first message "Hi — thanks for calling {workspaceName}…".
   - **Phone-line backing assistants** (`api/phone-lines/purchase`): name `PL {org4} {ts6}`
     (assistant names must be ≤ 40 chars), generic support prompt, agent row gets
     `agent_type: "phone_line_backing"`, `behavior_preset: "friendly-support"`.
5. Agent settings sync (Settings → Agents) derives the system prompt via
   `dashboard/settings/_lib/prompt-derivation.ts` (`BEHAVIOR_PROMPTS` presets + emphasis points +
   language/timezone + the mandatory fallback sentence "I'll notify our team…"). Sync status is
   tracked on `agents.vapi_sync_status` / `vapi_synced_at`.

## Phone numbers

- Provision: `POST /phone-number` with `{ provider: "vapi", numberDesiredAreaCode, assistantId }`.
  Bind the assistant AT CREATE TIME (avoids a second PATCH).
- Area code: user preference first, **fallback "321"** on availability/4xx errors (detected by
  matching "available"/"no number"/"not found" in the error text). US only.
- Numbers may return `status: "activating"` without an E164 — callers poll `GET /phone-number/{id}`
  until `number`/`phoneNumber` appears (purchase route + `checkPhoneStatus` onboarding action).
- **Routing truth: the phone number's `assistantId` field is the ONLY thing that routes calls.**
  - Pause = `PATCH /phone-number/{id} { assistantId: null }`
  - Resume = PATCH back the stored assistant id
  - Implemented in `web/src/lib/vapi/phoneNumberBinding.ts` (`unbindOrgPhoneNumbers` /
    `rebindOrgPhoneNumbers`). Unbind/rebind iterate agents with both
    `vapi_assistant_id` AND `vapi_phone_number_id`, update `vapi_sync_status`
    (`paused`/`success`), log per-number, and **throw if any number failed** (callers depend on
    that). Rebind is blocked when workspace is paused or when count would exceed
    `getEffectiveLimits().included_phones`.
- Delete line (`DELETE /api/phone-lines/[lineId]`): Stripe add-on decrement (if beyond included) →
  Vapi number release → Vapi assistant delete → `agents` row delete → `phone_lines` row delete.

## The webhook pipeline — `web/src/app/api/webhooks/vapi/route.ts` (3,142 lines)

**⚠ P0: webhook auth is STAGED, not yet enforcing (R-001, In Progress).** Since 2026-07-08 the POST
handler verifies the `x-vapi-secret` header against `VAPI_WEBHOOK_SECRET` (`lib/vapi/webhookAuth.ts`),
but defaults to observe-only `log` mode — it emits a `[VAPI][WEBHOOK][AUTH][…]` canary and **still
processes forged requests**. It rejects with 401 only when `VAPI_WEBHOOK_AUTH_MODE=enforce`. The
check runs before body parse / debug insert, so an enforced reject does zero DB work. Vapi already
sends `x-vapi-secret` from the demo assistant's `server.headers` (confirmed live) — that's the
mechanism this reuses. Enforcement is an ops flip after a verified test call; until then, treat the
webhook as unauthenticated.

Processing order (keep this order when editing):

1. Parse body → insert raw capture into `webhook_debug` (happens twice today — known debt).
2. `extractCallId` — Vapi puts the call id in many places
   (`message.call.id`, `message.summary_table.id`, `message.callId`, …). No id → return 200 ignored.
3. `resolveAgentByVapi` — match `agents` by `vapi_assistant_id` OR `vapi_phone_number_id`.
   Unknown agent → 200 ignored (`agent_not_found`).
4. **Workspace pause check** — if `organization_settings.workspace_status = 'paused'` → audit-log
   `workspace.paused.webhook_ignored`, return 200 `{ ignored: "workspace_paused" }`.
5. Sweep expired leases (best-effort), then detect new-vs-existing call by `vapi_call_id`.
6. Intent + persona (new inbound calls): `detectCallIntent` is a **stub returning "other"**;
   `selectPersonaKeyForCall` picks `support_<lang>` → `agents.default_persona_key` → `support_en`
   (validated against the `personas` table, safe fallback guaranteed).
7. **Upsert `calls` row** — keyed `(org_id, vapi_call_id)`; UPDATE if existing (so
   `/api/webcall/event` rows and webhook rows converge on one row). `raw_payload` is deep-merged;
   webcalls get `meta.channel = 'web'` forced and `call_type = 'webcall'`. Duplicate-key 23505 →
   fetch existing and continue. Webcall detection: `call.type === "webCall"` OR `webCallUrl`
   present OR `transport.provider === "daily"` OR both phones null.
8. **Lease acquire on NEW un-ended call** — `acquireOrgConcurrencyLease` (see
   `skills/database-schema.md`). Reasons `limit_reached` / `org_inactive` / `rpc_no_row` → return
   200 `{ rejected: true, reason }` + audit log. TTL 15 min.
9. **Lease release when the call transitions to ended** (idempotent, best-effort).
10. **Final events** (`end-of-call-report`, or `status-update` with `status === "ended"`):
    - Cost reconciliation via RPC `reconcile_call_cost` (idempotent; `calls.cost_usd` is the source
      of truth; cost rounded to 6 decimals; missing cost = 0, never NaN).
    - Transcript extraction (`call.transcript` → `message.transcript` → `artifact.transcript`).
    - Completion-state inference (`abandoned`/`partial`/`completed`) from duration, user turns
      (`User:` lines), truncated-last-AI-line heuristics, tool usage detection.
    - Guardrails (`lib/guardrails/call-guardrails.ts`): repeat-slot asks (phone/email ×2), missing
      contact, loop caps (12 turns / 3 tool calls) → force ticket + mark partial.
    - **Deterministic artifacts**: `ensureTicketForCall` (support/other) or
      `ensureAppointmentForCall` (appointment) — idempotent by `calls.id ↔ tickets.call_id` /
      `appointments.call_id`. Ticket creation tries the tool route first (phone calls with caller
      phone only), falls back to direct DB insert with the marker line
      `"[System] created_by=deterministic"` appended to the description.
    - Demo abuse (webcalls): >5 min duration or off-topic keywords → `createAbuseTicket`
      ("Demo misuse / exceeded limits").

**Idempotency contract:** the webhook can receive the same event N times and multiple event types
per call. Every write must either upsert on `vapi_call_id` or check-then-insert on `call_id`.

## Tool routes (called by Vapi during calls AND by the webhook as fallback)

- `POST /api/tools/create-ticket`, `POST /api/tools/create-appointment`
- Auth: header `x-denku-secret` must equal env `DENKU_TOOL_SECRET` (the canonical name — ignore
  `TOOL_SECRET`/`DENKU_SECRET`/`X_DENKU_SECRET` which only appear in a debug presence-dump).
- Org resolution: by `to_phone` (the org's line) or by looking up existing leads by contact.
- Both resolve-or-create a `leads` row by `(org_id, phone)`.
- Ticket subject heuristic: keyword buckets → "Billing Question" / "Order Issue" /
  "Scheduling Request" / default "Support Request". Description format has a metadata header
  (`[Channel] / [Caller] / [Agent] / [Vapi] / [Time]`) — analytics may parse it; keep the format.

## Web demo call flow (marketing)

`DemoCallButton` / `LiveAgentModal` → `POST /api/vapi/start` (assistant id) → Vapi Web SDK with
public key → call events also land in the main webhook (webcall detection above) →
`/api/webcall/event` records client-side events onto the same `calls` row. Guardrails are
post-hoc only (no pre-call gating besides in-memory rate limiting, which is ineffective on Vercel).

## When you change Vapi behavior

- Both entry points (onboarding activation AND phone-line purchase) now attach tools/server via the
  same `ensureAssistantConfig` helper, so they stay consistent by construction.
- **Any new assistant config field (tools, server, voice, transcriber, duration caps…) → add it to
  `buildAssistantConfigPatch` in `lib/vapi/assistantConfig.ts`**, not to individual call sites.
  That single helper is where R-051 (voice/transcriber) and R-052 (duration caps) should land next.
- Any webhook change → preserve return-200-on-ignore semantics (Vapi retries on non-200; we rely
  on 200 + `ignored`/`rejected` JSON).
