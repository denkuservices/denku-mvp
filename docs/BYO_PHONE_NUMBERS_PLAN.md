# Implementation Plan — Bring Your Own Phone Number (BYO SIP trunk)

> Status: **SHIPPABLE (2026-08-31) behind `BYO_NUMBERS_ENABLED` (default OFF). Migration applied
> to prod. No real carrier trunk has been connected yet — that is Phase 0 and it needs an
> operator with carrier credentials.**
> Goal: let a tenant connect a phone number they already own, via their own SIP trunk,
> instead of renting a new US number from Vapi.
> Scope decision owner: product. Engineering sequencing owner: this document.
>
> Built: `sip_trunks` + `phone_lines` columns (`20260831140306_byo_phone_numbers.sql`, applied to
> prod), `lib/vapi/sipTrunk.ts`, `lib/phone-lines/connectByo.ts`, `POST /api/phone-lines/connect`,
> `GET /api/phone-lines/[lineId]/status`, refcounted trunk release on delete,
> `markPhoneLineVerified` in the Vapi webhook, `byoNumbersEnabled`, `test/byo-sip-numbers.test.ts`,
> and the dashboard flow: a mode chooser in `AddPhoneNumberModal`, `ConnectOwnNumberFlow`
> (details → carrier instructions → waiting for the first call), and `ByoConnectionCard` on the
> line detail page so the settings can be read again after the wizard is closed.
>
> **Deliberately NOT built: the onboarding entry point.** Adding BYO to `runActivation` means
> changing the activation state machine so it can finish without provisioning a number — the most
> fragile path in the product, and one another workstream is actively editing (`chat_only` landed
> there the same day). A new workspace still gets a Denku number during onboarding and can connect
> its own from the dashboard immediately afterwards. Doing it properly in onboarding is its own
> change, with its own review.
>
> **To turn it on:** set `BYO_NUMBERS_ENABLED=true` in the environment. Nothing else is gated.

## 0. The carrier this was built against — Netgsm (verified 2026-08-31)

Netgsm publishes its own Vapi integration guide, and it settles the question this plan left open.
**Authentication is register-style (username + password), not a pure IP allowlist** — an earlier
assumption here, and the one the operator started from, was wrong. What is IP/domain-based is the
*delivery*: Netgsm's panel forwards inbound calls to a host you name, which is what makes Vapi
reachable at all.

| Where | Setting | Value |
|---|---|---|
| Vapi credential | `gateways[0].ip` | `sip.netgsm.com.tr` (or `185.88.7.189`) |
| Vapi credential | `outboundAuthenticationPlan` | username + password from Netgsm's panel |
| Vapi number | `numberE164CheckEnabled` | `false` — a `+90` number is refused otherwise |
| Netgsm panel | Ses Hizmeti → Ayarlar → SIP Bilgileri → SIP Trunk | enable |
| Netgsm panel | SIP Trunk adresi / Port | `sip.vapi.ai` / `5060` |
| Netgsm panel | Aranan Prefix | `+90` — the called number MUST arrive as E.164 |
| Netgsm panel | Arayan Prefix | `0` |

**The single most likely silent failure:** the called number Netgsm sends must match the `number`
on the Vapi phone-number object *exactly*. If the prefix is wrong the call reaches Vapi and maps
to nothing — no error anywhere, the line simply never answers. `toE164` in `lib/vapi/sipTrunk.ts`
exists for that reason on our side; the Aranan Prefix is the same guarantee on theirs.

Still unanswered by Netgsm's public docs, so ask their support before relying on it: concurrent
channel limits, codec (G.711 alaw is what we want), and whether they require Vapi's inbound IPs
(`44.229.228.186`, `44.238.177.138`) to be allowlisted.

## 1. What this is, and what it is not

**In scope (v1):** inbound calls only. A tenant provides SIP trunk details, Denku creates a
Vapi `byo-sip-trunk` credential + a `byo-phone-number`, binds it to a backing assistant, and the
existing call pipeline (webhook → intent → never-dead-end artifact) runs unchanged.

**Out of scope (v1), deliberately:**
- Outbound calling over the customer trunk (Denku places no outbound calls today).
- Twilio/Telnyx number *import* (`provider: "twilio"`). Same DB shape, different credential step —
  a follow-up, not a blocker.
- Simple call-forwarding onboarding (the "A" path). Independent and shippable in parallel; it needs
  no code, only copy.
- Non-US numbering. See §9 D1 — this is the one decision that can double the size of the work.

**Why this is tractable:** routing, pause/resume and the webhook do not change. A
`byo-phone-number` is an ordinary Vapi phone-number object; `assistantId` still routes calls,
`unbindOrgPhoneNumbers` / `rebindOrgPhoneNumbers` still work, and `resolveAgentByVapi` still
resolves by `vapi_phone_number_id`. The new work is a **connect** path, a **verification** step,
and **credential hygiene**.

## 2. Phase 0 — prove it on the real account before writing code

Do not start Phase 1 until these are true. Each is a `curl` against the live Vapi account, run by
an operator, not code:

1. `POST /credential` with `provider: "byo-sip-trunk"` succeeds on the Denku account (some Vapi
   features are plan-gated — confirm, do not assume).
2. `POST /phone-number` with `provider: "byo-phone-number"` + that `credentialId` returns an id.
3. A real inbound call from a test trunk reaches `/api/webhooks/vapi` and produces a `calls` row
   and an artifact. **This is the whole feature.** If it does not work by hand, no amount of
   product code fixes it.
4. Record the exact successful request/response bodies in this file. Vapi's public docs omit fields
   the API accepts (`port`, `outboundEnabled`, `sipRegisterPlan`, `techPrefix`), so the account's
   real behaviour is the specification, not the docs.

**Known facts to carry into Phase 0:**
- Inbound must be routed by the customer to `{phoneNumber}@<credential_id>.sip.vapi.ai`.
- Signaling IPs to allowlist — US: `44.229.228.186/32`, `44.238.177.138/32`. EU: `63.182.83.170/32`.
- EU-hosted orgs must use `https://api.eu.vapi.ai`. `web/src/lib/vapi/server.ts:4` hardcodes
  `VAPI_BASE_URL = 'https://api.vapi.ai'` — if EU is ever needed this becomes an env var, not an
  inline edit.

## 3. Prerequisite bug — ✅ DONE 2026-08-31 (filed as R-140)

> **Implemented.** `lib/vapi/agentPhoneLink.ts#linkAgentToPhoneNumber` is now called by
> `api/phone-lines/purchase` (step 10b) and by `runActivation`; the backfill lives in
> `supabase/migrations/20260829125306_backfill_agent_phone_number_link.sql`; the regression suite
> is `web/test/workspace-pause-unbind.test.ts`. **The BYO connect path must call the same helper.**
> One thing is still outstanding: an operator has to apply the migration to prod and check its
> warning count. The original write-up follows.

`web/src/app/api/phone-lines/purchase/route.ts` never writes `agents.vapi_phone_number_id`; the
Vapi number id is stored only on `phone_lines`. `unbindOrgPhoneNumbers` selects agents where
**both** `vapi_assistant_id` and `vapi_phone_number_id` are non-null, so **workspace pause does not
unbind purchased extra lines** — a paused workspace keeps answering on them. That breaks the
"billing enforcement is real, not decorative" rule in `CLAUDE.md`.

Required:
1. Set `vapi_phone_number_id` on the backing agent row in the purchase path (and in the new BYO
   path from day one).
2. One-off backfill from `phone_lines` → `agents` for existing lines.
3. A regression test asserting a paused org unbinds *every* line, not just the onboarding one.

Do this first. Otherwise BYO inherits the same hole, and a BYO line that keeps answering while
paused is worse — it is the customer's own published number.

## 4. Phase 1 — data model

New migration `supabase/migrations/20260829120000_byo_phone_numbers.sql`, idempotent DDL, additive
only, following the Telegram/Email channel migrations as the house style.

### 4.1 `sip_trunks` (new, service-role only)

One row per customer trunk; a trunk may back several numbers.

```sql
create table if not exists public.sip_trunks (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null,
  name                    text not null,
  vapi_credential_id      text not null,
  gateway_host            text not null,
  auth_username           text,                    -- identifier, not a secret
  auth_password_encrypted text,                    -- normally NULL — see D3
  status                  text not null default 'active'
                            check (status in ('active','error','revoked')),
  last_error              text,
  connected_by            uuid,
  meta                    jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint sip_trunks_credential_unique unique (vapi_credential_id)
);
create index if not exists idx_sip_trunks_org on public.sip_trunks (org_id);
alter table public.sip_trunks enable row level security;
-- Intentionally NO policies: service-role only, exactly like telegram_connections.
```

### 4.2 `phone_lines` additions

```sql
alter table public.phone_lines
  add column if not exists provider            text not null default 'vapi',
  add column if not exists sip_trunk_id        uuid,
  add column if not exists verification_status text not null default 'verified',
  add column if not exists verified_at         timestamptz,
  add column if not exists connected_by        uuid;
```

- `provider` check: `('vapi','byo_sip','twilio')`. Existing rows default to `'vapi'` — correct by
  construction.
- `verification_status` check: `('pending','verified','failed')`. Existing rows default to
  `'verified'` — a number Denku provisioned needs no proof of control. **New BYO rows insert
  `'pending'` explicitly.**
- Global uniqueness for claimed numbers, which today does not exist (the only unique is
  `(org_id, phone_number_e164)`, so two tenants can claim the same number):

```sql
create unique index if not exists uq_phone_lines_byo_e164
  on public.phone_lines (phone_number_e164)
  where provider <> 'vapi';
```

### 4.3 Squatting mitigation

That global index means org A can block org B by claiming B's number and never verifying. Two
guards, both cheap:
- A pending BYO line **expires after 24h** — a nightly sweep (add to the existing billing cron
  action) deletes pending rows older than 24h and releases the Vapi objects.
- On a unique violation at connect time, if the conflicting row is `pending` and stale, delete it
  and retry once. Documented in the connect orchestrator, not hidden in a catch.

## 5. Phase 2 — libraries

### 5.1 `web/src/lib/vapi/sipTrunk.ts`

Pure builders + thin `vapiFetch` wrappers, mirroring `assistantConfig.ts` (the pure core is what
gets unit-tested):

- `buildTrunkCredentialPayload(input)` → `{ provider: "byo-sip-trunk", name, gateways: [{ ip,
  port?, inboundEnabled: true }], outboundLeadingPlusEnabled, outboundAuthenticationPlan?:
  { authUsername, authPassword } }`.
- `buildByoPhoneNumberPayload(input)` → `{ provider: "byo-phone-number", name, number,
  numberE164CheckEnabled, credentialId, assistantId }`.
- `createSipTrunkCredential()`, `createByoPhoneNumber()`, `deleteCredential()` — `vapiFetch` calls
  reusing the existing `Vapi error (\d+):` status-parsing convention.
- `sipUriForNumber(number, credentialId)` → `{number}@{credentialId}.sip.vapi.ai` — the string the
  customer must configure. One definition, used by the UI, the instructions screen and support.

### 5.2 `web/src/lib/phone-lines/connectByo.ts`

The orchestrator, with explicit compensation (no distributed transaction — house rule):

```
validate → limits/pause/preview gate → reuse-or-create trunk credential
  → create backing assistant → ensureAssistantConfig
  → create byo-phone-number (bound to the assistant at create time)
  → insert phone_lines (provider='byo_sip', verification_status='pending')
  → update agents.vapi_phone_number_id
```

Rollback, in reverse, on any failure: delete the Vapi number → delete the assistant → delete the
agent row → delete the credential **only if this call created it** (a reused trunk must survive).
Every rollback step best-effort and logged, matching `purchase/route.ts`.

### 5.3 `web/src/lib/platform/flags.ts`

Add `byoNumbersEnabled(env)` reading `BYO_NUMBERS_ENABLED`, default OFF, same shape as
`platformModelEnabled`. The connect route and the UI fork both read it.

## 6. Phase 3 — API surface

### 6.1 `POST /api/phone-lines/connect` (new)

A sibling of `purchase`, not a branch inside it — the two share almost no middle steps and
`purchase/route.ts` is already 772 lines.

- Session auth (cookie client) → `org_id` from `profiles`.
- **zod** body: `{ number: E.164, trunk: { gatewayHost, port?, authUsername?, authPassword?,
  name? } | { trunkId: uuid }, lineType, displayName? }`.
- Gates, in this order: flag → `isWorkspacePaused` → preview mode → `getEffectiveLimits()`
  `included_phones` vs current line count (lines of every provider count).
- **No Stripe step at connect time** while within `included_phones`; beyond it the tenant buys the
  `extra_phone` add-on exactly as today (see D2).
- Returns `{ ok: true, lineId, sipUri, allowlistIps, verificationStatus: "pending" }`.

### 6.2 `DELETE /api/phone-lines/[lineId]` (extend)

After the existing Stripe decrement + number release + assistant cleanup, add: if the line has a
`sip_trunk_id` and **no other `phone_lines` row references it**, delete the Vapi credential and
mark the trunk `revoked`. Refcount, never blind-delete — one trunk can back several numbers.

### 6.3 Verification hook in `/api/webhooks/vapi`

After the agent/line is resolved and before artifact work, a best-effort, never-throwing
`markPhoneLineVerified(orgId, vapiPhoneNumberId)`:

```sql
update phone_lines set verification_status='verified', verified_at=now()
where org_id=$1 and vapi_phone_number_id=$2 and verification_status='pending';
```

The conditional UPDATE makes it idempotent, so repeated webhook deliveries never rewrite
`verified_at`. **The first real inbound call is the proof of control** — a trunk that is not
actually pointed at Vapi never produces one, so no separate OTP mechanism is needed. A pending line
still answers; it must, or verification could never happen.

## 7. Phase 4 — UI

- `AddPhoneNumberModal`: step 1 forks into "Get a new number" (today's flow) / "Connect my own
  number" (behind `byoNumbersEnabled`).
- BYO branch: trunk form → **instructions screen** (copyable SIP URI + IP allowlist + "point your
  trunk here") → **waiting-for-test-call** screen polling `verification_status`.
- The instructions screen determines the support load. Write it as if the reader is the customer's
  telecom vendor, not the business owner.
- Line detail page: provider badge, trunk name, verification state, and a way to re-open the
  instructions.
- Read model: add `provider` and `verification_status` to `CONNECTION_SOURCES.voice.metaColumns`
  in `lib/platform/readModel/channels.ts`.
- Channel registry: voice is now connectable two ways. Add an optional
  `alternateConnections?: ConnectionMethod[]` to `ChannelMeta` and set
  `alternateConnections: ["credentials"]` on voice. An optional field means no other channel
  changes and `test/channel-contract.test.ts` keeps passing.

## 8. Phase 5 — tests (`web/test/`)

- `byo-sip-payloads.test.ts` — pure builders: no top-level `tools`, `inboundEnabled: true`,
  `numberE164CheckEnabled` handling, `sipUriForNumber` shape.
- `byo-connect-guards.test.ts` — refusals: flag off, workspace paused, preview mode, over
  `included_phones`, duplicate claimed number, missing org scope.
- `byo-verification.test.ts` — pending→verified once; a second delivery does not rewrite
  `verified_at`; a verified line is never reset.
- Extend the pause regression from §3 to cover a BYO line.
- All Supabase mocked, per the existing suite convention.

## 9. Open decisions (product, not engineering)

**D1 — Non-US numbers.** BYO's real value is a tenant's Turkish/EU number, but the platform is
hard US-only: `purchase` rejects `country !== "US"`, the area-code fallback is `321`, and the
`normalizePhone` helpers and timezone defaults assume NANP. Allowing non-US numbers means
`numberE164CheckEnabled: false`, revisiting normalization/masking, per-line timezone, and possibly
EU Vapi hosting. **This is a separate epic.** Ship BYO for US numbers first, or accept the larger
scope explicitly.

**D2 — Pricing.** A BYO line costs Denku no number rental but consumes concurrency and minutes.
Recommendation: count BYO lines against `included_phones` (this keeps `getEffectiveLimits` and the
rebind limit check honest) and decide separately whether `extra_phone` is charged at the same rate
beyond the included count.

**D3 — Do we store the SIP password?** Recommendation: **no.** Pass it to Vapi at credential
creation and keep only `vapi_credential_id`. `auth_password_encrypted` exists in the schema for the
case where re-creating a credential without re-asking the customer becomes necessary; if it is ever
used it must go through `lib/crypto/secretBox.ts` on a service-role-only table, like the Telegram
bot token. Never return it to the browser in any form.

**D4 — `sip_trunks` table or just a column?** A column on `phone_lines` is smaller; the table pays
for itself the first time one trunk backs two numbers (refcounted delete, one instructions screen,
one status). This plan assumes the table.

**D5 — `employee_channels`.** Nothing in app code writes this table yet (R-081 backfill pending).
The connect path is a natural first writer, but adopting it here mixes two migrations' worth of
risk. Recommendation: leave it out of v1 and let the R-081 backfill pick BYO lines up like any
other line.

## 10. Rollout

1. Phase 0 curl proof on the real account, bodies recorded in this file.
2. §3 prerequisite bug + backfill, shipped on its own.
3. Migration applied to prod by an operator, per `docs/MIGRATION_DEPENDENCY_GRAPH.md` — never via
   MCP (read-only by policy).
4. Code merged with `BYO_NUMBERS_ENABLED` OFF.
5. Internal org connects a real trunk end-to-end: connect → instructions → test call → verified →
   artifact → owner email.
6. Flag ON for one design-partner tenant; watch `[PHONE_LINES][CONNECT][*]` logs.
7. General availability plus a support runbook holding the SIP URI format and the IP allowlist.

**Definition of done:** a tenant connects their own number, a real call to that number produces a
ticket or appointment in the dashboard, pausing the workspace stops it answering, and deleting the
line releases both the number and — if it was the last one — the credential.
