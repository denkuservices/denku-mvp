-- Instagram Foundation (Sprint 1.5)
-- Two Instagram-specific tables that integrate naturally alongside the Voice model.
-- No generic channel/conversation abstraction — mirrors the Vapi pattern
-- (a webhook + a raw-event table), scoped per org.
--
-- SECURITY: both tables hold sensitive data (OAuth tokens; raw inbound events).
-- RLS is ENABLED with NO policies, so ONLY the service-role client (which bypasses
-- RLS) can read/write them — the anon/authenticated PostgREST roles are denied by
-- default. This mirrors `webhook_debug`. Access tokens are ALSO encrypted at the
-- application layer (AES-256-GCM) before insert — see lib/crypto/secretBox.ts.
--
-- Idempotent DDL (safe to re-run).

-- ---------------------------------------------------------------------------
-- instagram_connections: one Instagram Business account connection per org.
-- ---------------------------------------------------------------------------
create table if not exists public.instagram_connections (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null,
  ig_user_id               text not null,               -- Instagram Business account id (from Meta)
  username                 text,
  account_type             text,
  access_token_encrypted   text,                         -- AES-256-GCM packed ("v1:iv:tag:ct"); never plaintext
  token_expires_at         timestamptz,                  -- long-lived IG token expiry (~60d)
  scopes                   text[],
  status                   text not null default 'connected'
                             check (status in ('connected','revoked','error')),
  last_refreshed_at        timestamptz,
  last_error               text,
  connected_by             uuid,                         -- auth user id who connected it
  meta                     jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint instagram_connections_org_unique unique (org_id)
);

create index if not exists idx_instagram_connections_ig_user_id
  on public.instagram_connections (ig_user_id);
create index if not exists idx_instagram_connections_status
  on public.instagram_connections (status);
create index if not exists idx_instagram_connections_expiry
  on public.instagram_connections (token_expires_at)
  where status = 'connected';

alter table public.instagram_connections enable row level security;
-- Intentionally NO policies: service-role only (bypasses RLS). Do not add
-- permissive anon/authenticated policies — this table holds OAuth credentials.

drop trigger if exists trg_instagram_connections_updated_at on public.instagram_connections;
create trigger trg_instagram_connections_updated_at
  before update on public.instagram_connections
  for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- instagram_webhook_events: raw inbound events, persisted for debugging and
-- FUTURE processing. No business logic runs against these yet (Sprint 1.5 scope).
-- ---------------------------------------------------------------------------
create table if not exists public.instagram_webhook_events (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid,                                 -- best-effort resolution from ig_user_id (nullable)
  object           text,                                 -- Meta "object" (e.g. "instagram")
  entry_id         text,                                 -- first entry id (the IG account id)
  ig_user_id       text,
  event_type       text,                                 -- coarse: "messages" | "comments" | "changes" | ...
  payload          jsonb not null,
  headers          jsonb,
  signature_valid  boolean,
  processed        boolean not null default false,       -- reserved for a FUTURE processor
  error_message    text,
  received_at      timestamptz not null default now()
);

create index if not exists idx_instagram_webhook_events_org_received
  on public.instagram_webhook_events (org_id, received_at desc);
create index if not exists idx_instagram_webhook_events_ig_user_id
  on public.instagram_webhook_events (ig_user_id);
create index if not exists idx_instagram_webhook_events_unprocessed
  on public.instagram_webhook_events (received_at)
  where processed = false;

alter table public.instagram_webhook_events enable row level security;
-- Intentionally NO policies: service-role only. Raw inbound payloads may contain PII.
