-- Web Chat channel — an embeddable widget on the customer's own website (R-141)
--
-- WHAT: two tables. `web_chat_connections` holds one embed install (its public site key,
-- the origins allowed to use it, branding, and which AI Employee answers). `web_chat_sessions`
-- holds one visitor's continuing thread on that install. Conversations/messages/contacts go
-- straight into the shared platform model (Sprint 4.5), exactly like Telegram — there is no
-- legacy store and nothing to dual-write.
--
-- WHY this channel is different from every other one we have built, and what follows from it:
--
--   Every other channel authenticates with a secret only two parties hold — a bot token, an
--   OAuth token, a webhook signature. **This one runs in a stranger's browser.** The site key
--   is printed in the customer's page source; treating it as a credential would be a lie. So
--   the trust chain is:
--
--     1. `allowed_origins` — the browser-asserted `Origin` header must match one. This is the
--        front door. It defaults to EMPTY and empty REFUSES: a connection that has not been
--        told where it lives answers nobody. Fail-closed, because the failure mode of the
--        alternative is a stranger running a business's AI on their own site.
--     2. A server-signed, short-lived session token issued by /api/webchat/session and required
--        by every later request. The visitor never states which org they belong to — the token
--        does, and it is HMAC'd with a key that never leaves the server.
--     3. Volume caps (in code, counted from `messages` and from this table), because a public
--        endpoint that costs money per request is a bill waiting to happen.
--
--   `site_key` is therefore an ADDRESS, not a password — the same role `connectionId` plays in
--   the Telegram webhook URL. Rotating it is offered anyway: it is the only way to cut off an
--   install whose snippet was copied onto a site the customer no longer controls.
--
-- SECURITY: RLS ENABLED with NO policies on both tables → service-role only. Neither table
-- holds a decryptable credential, but `web_chat_sessions` holds visitor metadata (page URL,
-- user agent) that belongs to one tenant, and the connection row decides who may embed.
--
-- Idempotent DDL (safe to re-run).

create table if not exists public.web_chat_connections (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null,

  -- Public by construction: this is pasted into the customer's HTML. Unique so an inbound
  -- request resolves to exactly one workspace with no ambiguity to guess at.
  site_key            text not null,

  -- What the customer calls this install ("denkushop.com", "Checkout page"). Shown in the
  -- Channels list as the identifier, the way a bot is known by its @handle.
  site_name           text,

  -- Exact origins ("https://shop.com"), scheme + host + optional port, no path. Empty means
  -- the widget is refused everywhere — see the note above.
  allowed_origins     text[] not null default '{}'::text[],

  -- Which AI Employee answers here. Same ownership edge as phone_lines/telegram_connections:
  -- Employees own Channels, never the reverse.
  assigned_agent_id   uuid,

  -- Branding, all optional. The widget falls back to Denku defaults and the Employee's own
  -- name, so a connection created with nothing but a site key still looks finished.
  display_name        text,
  accent_color        text,
  greeting            text,

  -- The vocabulary here is the one `lib/platform/connectionHealth.ts` already speaks, so a
  -- paused widget renders as "Disconnected" with a real remedy rather than "Unknown status".
  status              text not null default 'connected'
                        check (status in ('connected','disconnected','error')),
  last_error          text,
  last_inbound_at     timestamptz,

  created_by          uuid,
  meta                jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint web_chat_connections_site_key_unique unique (site_key)
);

-- Several installs per org are allowed on purpose (a group with three brand sites), so there
-- is no unique constraint on org_id.
create index if not exists idx_web_chat_connections_org
  on public.web_chat_connections (org_id);
create index if not exists idx_web_chat_connections_status
  on public.web_chat_connections (status);
create index if not exists idx_web_chat_connections_agent
  on public.web_chat_connections (assigned_agent_id);

-- One visitor's thread on one install.
--
-- `visitor_id` is a random id the widget keeps in the browser. It is not an identity — it
-- survives a page reload and dies with the browser profile — but it is what makes the
-- conversation continue instead of restarting on every navigation, and it is the contact key
-- the adapter uses. Keeping it here rather than only in a signed token is what lets a returning
-- visitor land back in the SAME conversation the shop owner already replied in.
--
-- `conversation_id` is filled on the first message, not at session creation: a widget that was
-- opened and closed without a word should not litter the Inbox with empty threads.
create table if not exists public.web_chat_sessions (
  id                  uuid primary key default gen_random_uuid(),
  connection_id       uuid not null references public.web_chat_connections(id) on delete cascade,
  org_id              uuid not null,

  visitor_id          text not null,
  conversation_id     uuid,

  -- Context a shop owner actually wants when they read the thread: which page the person was
  -- on when they asked. Stored on the session, mirrored onto the conversation meta.
  page_url            text,
  referrer            text,
  user_agent          text,
  locale              text,

  message_count       integer not null default 0,
  last_message_at     timestamptz,
  last_seen_at        timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint web_chat_sessions_visitor_unique unique (connection_id, visitor_id)
);

create index if not exists idx_web_chat_sessions_org
  on public.web_chat_sessions (org_id);
create index if not exists idx_web_chat_sessions_conversation
  on public.web_chat_sessions (conversation_id);
-- Supports the "how many new sessions has this install opened in the last hour" cap, which is
-- the only thing standing between a rotated visitor id and an unbounded number of threads.
create index if not exists idx_web_chat_sessions_connection_created
  on public.web_chat_sessions (connection_id, created_at desc);

alter table public.web_chat_connections enable row level security;
alter table public.web_chat_sessions enable row level security;
-- Intentionally NO policies on either: service-role only. The public endpoints resolve these
-- rows through the service-role client after checking Origin and the signed session token.

-- Self-contained updated_at trigger, following the Telegram/Instagram migrations: there is no
-- shared public.update_updated_at_column() in this database.
create or replace function public.web_chat_set_updated_at()
  returns trigger language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_web_chat_connections_updated_at on public.web_chat_connections;
create trigger trg_web_chat_connections_updated_at
  before update on public.web_chat_connections
  for each row execute function public.web_chat_set_updated_at();

drop trigger if exists trg_web_chat_sessions_updated_at on public.web_chat_sessions;
create trigger trg_web_chat_sessions_updated_at
  before update on public.web_chat_sessions
  for each row execute function public.web_chat_set_updated_at();

comment on table public.web_chat_connections is
  'One embeddable Web Chat install. site_key is PUBLIC (it lives in the customer page source); allowed_origins is the actual access control and an empty array refuses everywhere.';
comment on column public.web_chat_connections.allowed_origins is
  'Exact origins permitted to embed this install. Empty = refuse all. Fail-closed on purpose.';
comment on table public.web_chat_sessions is
  'One visitor thread per install. visitor_id is a browser-local id, not an identity; it exists so a returning visitor rejoins the same conversation.';

-- ROLLBACK:
--   drop trigger if exists trg_web_chat_sessions_updated_at on public.web_chat_sessions;
--   drop trigger if exists trg_web_chat_connections_updated_at on public.web_chat_connections;
--   drop function if exists public.web_chat_set_updated_at();
--   drop table if exists public.web_chat_sessions;
--   drop table if exists public.web_chat_connections;
--   (Conversations/messages written by the channel are channel-agnostic and survive.)
