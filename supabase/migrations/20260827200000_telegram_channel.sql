-- Telegram channel — per-tenant bot connections (Sprint D0 → P4 "Then Telegram")
--
-- WHAT: one table, `telegram_connections`, holding the BotFather credentials for a
-- business's own bot. Nothing else: Telegram has NO legacy store to dual-write into, so
-- its conversations/messages/contacts go straight into the shared platform model added in
-- Sprint 4.5 (`conversations`, `messages`, `contacts`, `contact_identities`).
--
-- WHY a table per channel rather than a generic credentials store: the same reason
-- `instagram_connections` exists — each channel's credentials have a different shape and a
-- different lifecycle, and `readModel/channels.ts#CONNECTION_SOURCES` already knows how to
-- render an arbitrary connection table by naming its columns. This is the declared
-- extension point, not a new pattern.
--
-- The bot model (decided 2026-08-27): **each customer creates their own bot** in BotFather
-- and pastes the token. So the bot carries the business's own brand, the token's rate limit
-- is theirs alone, and revoking one customer never touches another. The trade-off — we hold
-- a credential that can send messages as that business — is why the token is encrypted at
-- the application layer (AES-256-GCM, lib/crypto/secretBox.ts) ON TOP of a service-role-only
-- table, exactly like the Instagram token.
--
-- SECURITY: RLS ENABLED with NO policies → service-role only. Never add a permissive
-- anon/authenticated policy here; a leaked row is a bot takeover.
--
-- Idempotent DDL (safe to re-run).

create table if not exists public.telegram_connections (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null,

  -- Identity, from getMe. `bot_id` is the numeric id Telegram assigns; `bot_username` is
  -- what a customer types to find the bot (@my_shop_bot) and is what the UI shows.
  bot_id                text not null,
  bot_username          text,
  bot_name              text,

  -- AES-256-GCM packed ("v1:iv:tag:ct"). NEVER plaintext — the app refuses to store a
  -- token when no encryption key is configured.
  bot_token_encrypted   text not null,

  -- Our half of the webhook handshake. Telegram echoes this back in the
  -- `X-Telegram-Bot-Api-Secret-Token` header on every delivery, and the webhook rejects
  -- anything that does not match. Unlike Meta's HMAC there is no signature over the body,
  -- so this shared secret IS the authentication — it must be random per connection and
  -- must never appear in a URL (which would land it in access logs).
  webhook_secret        text not null,
  webhook_set_at        timestamptz,

  -- Which AI Employee answers on this bot. Same ownership edge as
  -- `phone_lines.assigned_agent_id` — Employees own Channels, never the reverse.
  assigned_agent_id     uuid,

  status                text not null default 'connected'
                          check (status in ('connected','revoked','error')),
  last_error            text,
  last_inbound_at       timestamptz,

  connected_by          uuid,
  meta                  jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- A given bot belongs to exactly ONE org. Without this, two orgs pasting the same token
  -- would each believe they own the conversation, and inbound updates would resolve
  -- arbitrarily between them.
  constraint telegram_connections_bot_id_unique unique (bot_id)
);

-- Multiple bots per org are allowed on purpose (a shop may want one bot per location or
-- per language), so there is no unique constraint on org_id — unlike Instagram.
create index if not exists idx_telegram_connections_org
  on public.telegram_connections (org_id);
create index if not exists idx_telegram_connections_status
  on public.telegram_connections (status);
create index if not exists idx_telegram_connections_agent
  on public.telegram_connections (assigned_agent_id);

alter table public.telegram_connections enable row level security;
-- Intentionally NO policies: service-role only (bypasses RLS). This table holds a
-- credential that can post as the customer's business.

-- Self-contained updated_at trigger. There is no shared public.update_updated_at_column()
-- in this database (see the Instagram migration's note), so this defines its own.
create or replace function public.telegram_set_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_telegram_connections_updated_at on public.telegram_connections;
create trigger trg_telegram_connections_updated_at
  before update on public.telegram_connections
  for each row execute function public.telegram_set_updated_at();

comment on table public.telegram_connections is
  'Per-tenant Telegram bot credentials (BotFather token, encrypted). Service-role only. Conversations land in the shared platform model, not here.';
comment on column public.telegram_connections.webhook_secret is
  'Echoed by Telegram in X-Telegram-Bot-Api-Secret-Token. This IS the webhook auth — there is no body signature. Never put it in a URL.';

-- ROLLBACK:
--   drop trigger if exists trg_telegram_connections_updated_at on public.telegram_connections;
--   drop function if exists public.telegram_set_updated_at();
--   drop table if exists public.telegram_connections;
--   (Conversations/messages written by the channel are channel-agnostic and survive.)
