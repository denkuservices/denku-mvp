-- Commerce integrations — a per-org connection to a customer's e-commerce backend (IdeaSoft first)
--
-- WHAT: one table. A row is one store an org has connected. `provider` says which backend, so the
-- second provider (İkas, Ticimax, Shopify) is a row value and an adapter, never a second table.
--
-- WHY this is NOT a channel table, and why that matters here:
--
--   A channel is where a customer TALKS to the business. This is where the business KEEPS ITS
--   FACTS. The customer messaging on Telegram at 23:40 has an order that lives in IdeaSoft: the
--   channel is Telegram, the source is IdeaSoft. Modelling it as a channel would put a "channel"
--   nobody can message into every surface that iterates channels. See skills/commerce-integrations.md.
--
-- WHAT IS DELIBERATE HERE, each with the failure it prevents:
--
--   1. `refresh_token_encrypted` and `refresh_lock_until` exist together because IdeaSoft's
--      refresh token is SINGLE-USE. Two concurrent refreshes = one wins and the other's token is
--      already dead, which kills the connection outright. The lock column is how a refresh is
--      claimed before it is attempted — the same conditional-UPDATE claim as `email_dispatch_log`.
--
--   2. Tokens are NULLABLE even though a working connection always has them. A connection is
--      created BEFORE the OAuth redirect (we need somewhere to keep the client credentials and the
--      `state` nonce while the customer is away approving on their own panel), so `status =
--      'pending'` is a real state with no tokens in it. Nothing may read a pending row as usable.
--
--   3. `granted_scope` stores what the token response RETURNED, not what we asked for. R-079 is
--      exactly this bug on Instagram — requested scopes persisted as if they had been granted —
--      and it is why an integration can look connected while being unable to read anything.
--
--   4. `client_secret_encrypted` is encrypted; `client_id` is not. IdeaSoft's own documentation
--      says the client id "is public" and the secret "must be kept private". Encrypting the id too
--      would only make debugging harder for no gain.
--
--   5. `store_base_url` is an SSRF surface — we make server-side requests to a URL a customer
--      typed. The column is the record; `lib/commerce/storeUrl.ts` is the guard (https only,
--      origin only, no private/loopback ranges). Never write this column from raw user input.
--
-- SECURITY: RLS ENABLED with NO policies → service-role only. The row holds two live credentials
-- and a refresh token worth two months of access to a real business's catalogue and orders.
--
-- ROLLBACK: drop table public.commerce_connections;
--
-- Idempotent DDL (safe to re-run).

create table if not exists public.commerce_connections (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null,

  -- Which backend. Free text rather than an enum for the same reason `conversations.channel` is:
  -- adding a provider should be code, not a migration.
  provider                text not null,

  -- The store's origin, normalized: scheme + host (+ port), no path, no query, https only.
  -- Both `https://shop.myideasoft.com` and a custom domain `https://www.shop.com` are valid.
  store_base_url          text not null,

  -- What the customer calls this store in the UI. Falls back to the host.
  store_label             text,

  -- OAuth app credentials. IdeaSoft mints these per store, in the store owner's own admin panel
  -- (Entegrasyonlar → API → Ekle), which is why they are per-connection and not env vars.
  client_id               text not null,
  client_secret_encrypted text not null,

  -- Tokens. Null while `status = 'pending'` — see note 2 above.
  access_token_encrypted  text,
  refresh_token_encrypted text,
  access_expires_at       timestamptz,
  refresh_expires_at      timestamptz,
  granted_scope           text,

  -- CSRF nonce for the authorization redirect, and its deadline. Cleared once consumed, so a
  -- replayed callback finds nothing to match.
  oauth_state             text,
  oauth_state_expires_at  timestamptz,

  -- pending  : created, waiting for the customer to approve on their own panel
  -- connected: usable
  -- revoked  : the store withdrew access, or the refresh token died — needs re-authorization
  -- error    : reachable but failing; `last_error` says how
  status                  text not null default 'pending',
  last_error              text,
  last_verified_at        timestamptz,

  -- Single-flight refresh claim. See note 1.
  refresh_lock_until      timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.commerce_connections enable row level security;

-- One connection per store per workspace. Reconnecting updates the row rather than accumulating
-- dead credentials beside live ones.
create unique index if not exists commerce_connections_org_provider_store_uniq
  on public.commerce_connections (org_id, provider, store_base_url);

-- The read every inbound tool call makes: "does this workspace have a usable store?"
create index if not exists commerce_connections_org_status_idx
  on public.commerce_connections (org_id, status);

-- The callback's only lookup. Partial, because a consumed state is nulled out.
create unique index if not exists commerce_connections_oauth_state_uniq
  on public.commerce_connections (oauth_state)
  where oauth_state is not null;

-- The refresh cron's sweep: connected rows whose access token is closest to expiry.
create index if not exists commerce_connections_refresh_due_idx
  on public.commerce_connections (access_expires_at)
  where status = 'connected';

comment on table public.commerce_connections is
  'One connected e-commerce backend per org (IdeaSoft first). Service-role only. See skills/commerce-integrations.md.';
