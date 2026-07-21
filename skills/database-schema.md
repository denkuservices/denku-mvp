# Skill: Database schema (inferred — read the caveats)

> ⚠ **The base schema is NOT in this repo.** `supabase/migrations/` contains only incremental
> changes; core tables were created directly in the live Supabase project. This document is the
> best reconstruction from code as of 2026-07-06. When in doubt, read the querying code — it is
> the ground truth. Also: the Supabase MCP server in this workspace is connected to a DIFFERENT
> project ("BondAI") — its `list_tables` output is NOT Denku.

## Core tables (by domain)

### Tenancy & identity
- **`orgs`** — canonical org. `id uuid PK`, `name`, `created_by uuid NOT NULL`,
  `phone_desired_area_code text`, `created_at`.
- **`organizations_legacy`** — renamed from `organizations`; still dual-written on signup because
  `organization_settings.org_id` FKs to it. Has NOT NULL `phone_number` (write `""`).
- **`organizations`** — read-only compatibility VIEW over `orgs` (plan='mvp', status='active'
  hardcoded). Never write.
- **`profiles`** — `id uuid` (= auth user id), `auth_user_id uuid` (unique, not-null-filtered),
  `email` (unique lower(email)), `org_id`, `full_name`, `phone`, `role` ('owner'|'admin'),
  `updated_at` (trigger), `welcome_email_sent_at`, `welcome_email_last_error`.
  RLS: select/update own via `auth.uid() = auth_user_id`.
- **`organization_settings`** — per-org config/state hub. Known columns: `org_id` (PK/unique,
  FK→organizations_legacy), `onboarding_step int`, `onboarding_language`,
  `workspace_status` ('active'|'paused' + CHECK), `paused_reason`
  ('manual'|'hard_cap'|'past_due' + CHECK), `paused_at`, `billing_status`
  ('active'|'past_due'|'paused' + CHECK), `vapi_assistant_id`, `vapi_phone_number_id`,
  `main_agent_id`, `phone_number_e164`, `phone_number_sip_uri`, `timezone`(?),
  `welcome_email_sent_at`, `welcome_email_last_error`.

### Telephony & AI
- **`agents`** — one row per Vapi assistant. `id uuid`, `org_id`, `name`, `created_by NOT NULL`,
  `language`, `voice`, `timezone`, `vapi_assistant_id`, `vapi_phone_number_id`,
  `default_persona_key`, `behavior_preset`, `agent_type` (e.g. 'phone_line_backing'),
  `first_message`, `emphasis_points jsonb`, `system_prompt_override`, `effective_system_prompt`,
  `vapi_sync_status` ('success'|'error'|'pending'|'paused'), `vapi_synced_at`.
  NOTE: **no `status` column** (a comment in purchase route warns about this).
  RLS: org-member SELECT policy exists.
- **`phone_lines`** — purchased numbers. `id uuid`, `org_id`, `vapi_phone_number_id`,
  `phone_number_e164`, `display_name`, agent linkage, status fields.
- **`calls`** — one row per call, **unique on `vapi_call_id`** (upsert conflict target) and
  correlated by `(org_id, vapi_call_id)`. Columns seen: `org_id`, `agent_id`, `lead_id`,
  `direction` ('inbound'|'outbound'|'unknown'), `from_phone`, `to_phone`, `started_at`, `ended_at`,
  `duration_seconds`, `vapi_assistant_id`, `vapi_phone_number_id`, `raw_payload jsonb`
  (deep-merged; `meta.channel='web'` for webcalls), `call_type` ('webcall'|null), `outcome`,
  `transcript`, `intent`, `intent_confidence`, `persona_key`, `completion_state`, `cost_usd`
  (source of truth for billing, written by `reconcile_call_cost`), `updated_at`.
- **`personas`** — persona catalog: `key` (e.g. 'support_en'), `is_active`. Used by webhook
  persona selection with `support_en` as guaranteed fallback.
- **`call_concurrency_leases`** — `org_id`, `agent_id`, `vapi_call_id`, `acquired_at`,
  `released_at`, `expires_at`, `created_at`, `updated_at`. Active = released_at IS NULL AND
  expires_at > now(). Unique-ish on (org_id, vapi_call_id) — 23505 treated as idempotent success.

### CRM artifacts
- **`leads`** — `org_id`, `phone` (E.164-normalized, dedupe key with org), `email`, `name`,
  `source` ('inbound_call'|'vapi'|'web'|…), `status` ('new'|…), `notes`, `created_at`.
- **`tickets`** — `org_id`, `lead_id` (nullable for webcalls), `call_id` (FK calls, SET NULL),
  `subject`, `description` (≤2000 chars, may end with marker `[System] created_by=deterministic`),
  `status` ('open'|…), `priority`, `requester_name/phone/email/address`, `created_at`,
  `updated_at`. Heavily indexed (org+created/status/priority/lead/call).
  Plus `ticket comments`/`activity` tables used by `lib/tickets/comments.*`/`activity.*`.
- **`appointments`** — `org_id`, `lead_id`, `call_id`, `status` ('requested'|…),
  `source` ('voice'|…), `notes` (full transcript + deterministic marker), datetime field(s),
  `created_at`.

### Billing (see skills/billing-and-stripe.md for semantics)
- **`billing_plan_catalog`**, **`org_plan_overrides`** (write), **`org_plan_limits`** (read;
  derived), **`billing_org_addons`**, **`billing_invoice_runs`**, **`billing_overage_state`**.
  Stripe customer mapping lives with the org (managed by `ensureStripeCustomer`).

### Instagram (channel foundation — Sprint 1.5; see skills/instagram-integration.md)
- **`instagram_connections`** — one Instagram Business connection per org (`unique(org_id)`):
  `ig_user_id`, `username`, `account_type`, `access_token_encrypted` (AES-256-GCM packed, never
  plaintext), `token_expires_at`, `scopes text[]`, `status` ('connected'|'revoked'|'error'),
  `last_refreshed_at`, `connected_by`, `meta jsonb`, timestamps. **RLS enabled, NO policies →
  service-role only** (holds OAuth tokens).
- **`instagram_webhook_events`** — raw persisted inbound events: `org_id` (nullable, best-effort),
  `object`, `entry_id`, `ig_user_id`, `event_type`, `payload jsonb`, `headers`, `signature_valid`,
  `processed` (default false — reserved for a FUTURE processor), `received_at`. **RLS enabled, NO
  policies → service-role only** (raw payloads may contain PII). Migration:
  `supabase/migrations/20260708120000_instagram_foundation.sql`.
- **`instagram_data_deletion_requests`** — Meta data-deletion status tracking (compliance):
  `confirmation_code` (unique), `ig_user_id`, `org_id`, `status`
  ('received'|'completed'|'failed'), `requested_at`, `completed_at`. RLS enabled, no policies
  (service-role only; the public status page reads by exact code). Migration:
  `supabase/migrations/20260708130000_instagram_data_deletion.sql`.

### Ops
- **`webhook_debug`** — raw webhook capture: `source` (NOT NULL — always set 'vapi'), `headers`,
  `body`/`raw_payload`, `event_type`, `vapi_call_id`, `org_id`, `agent_id`, `direction`,
  `started_at`, `ended_at`, `lease_acquired`, `lease_released`, `error_message`. RLS: service role
  only. Grows unbounded — candidate for retention policy.
- **`audit_log`** — `org_id`, `actor_user_id` (nullable = system), `action`, `entity_type`,
  `entity_id` (must be UUID-safe), `diff jsonb` ({field: {before, after}}). Writer:
  `lib/audit/log.ts#logAuditEvent`. Viewer: settings → workspace → audit.

## RPC functions (SECURITY DEFINER)

| RPC | Purpose | Caveat |
|---|---|---|
| `acquire_org_concurrency_lease(p_org_id, p_limit, p_agent_id, p_vapi_call_id, p_ttl_minutes)` | Atomic lease acquire under `pg_advisory_xact_lock(hashtext(org_id))` | **DRIFT:** repo migration returns `boolean`; calling code (`lib/concurrency/leases.ts`) expects `TABLE(ok, active_count, limit_value)` — live DB has a newer version not in the repo |
| `release_org_concurrency_lease(p_org_id, p_vapi_call_id)` | Sets released_at | |
| `release_expired_concurrency_leases()` | Sweeper, returns count | Called opportunistically on every Vapi webhook |
| `fn_calls_today_counts_by_phone_number(p_org_id, p_vapi_phone_number_ids[])` | "Today" column on Phone Lines without N+1 | "Today" = server-timezone day boundary |
| `reconcile_call_cost(p_org_id, p_vapi_call_id, p_cost_usd, p_payload, p_source)` | Idempotent cost write to `calls.cost_usd` | **NOT in repo migrations at all** — exists only in live DB |

## Migration conventions & rules

- Files in `supabase/migrations/`; newer ones use `YYYYMMDDHHMMSS_name.sql`, but several are
  UNNUMBERED (`add_agent_configuration_fields.sql`, `add_workspace_status.sql`, …) — ordering is
  not reliable. Number every new migration.
- House style: idempotent DDL (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` + recreate,
  `ON CONFLICT DO UPDATE` seeds) — keep it; migrations get re-run.
- `update_updated_at_column()` trigger function is shared; reuse it for new `updated_at` columns.
- **Before relying on any column not listed here, grep the code for it.** The DB has drifted and
  this doc can too. High-value TODO: snapshot the live schema into a baseline migration.
