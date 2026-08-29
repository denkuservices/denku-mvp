-- Email channel — per-tenant forwarding connections + the shared draft store.
--
-- WHAT: two tables. `email_connections` holds one business's email channel (the address we
-- gave them to forward to, the domain we are allowed to send as, and how the AI is allowed
-- to answer). `conversation_drafts` holds an AI reply that has been WRITTEN but not SENT.
--
-- WHY FORWARDING AND NOT OAUTH (decided 2026-08-28): Gmail's read scopes
-- (gmail.readonly / gmail.modify / gmail.compose / gmail.metadata) are all in Google's
-- RESTRICTED class, which means a CASA Tier 2 security assessment plus annual
-- re-certification before a single customer can connect. That is the Instagram situation
-- again — code finished, shipping blocked on someone else's review queue. A forwarding
-- address costs the customer two minutes in their own mail settings, works identically on
-- Gmail, Outlook, and any cPanel host, and depends on no external approval at all.
-- (`gmail.send` alone is merely SENSITIVE — no CASA — which is why the "send from their
-- real Gmail" upgrade stays open as a later, optional convenience.)
--
-- WHY A DEDICATED ADDRESS AND NOT THE WHOLE MAILBOX: only mail the customer's own customers
-- send should become a Conversation. Mirroring an entire inbox would drown the Inbox in
-- newsletters and invoices, put the owner's private correspondence in front of the AI, and
-- turn Denku into a worse Gmail. Forwarding a single published address (info@, support@)
-- enforces that boundary by construction rather than by a classifier that can be wrong.
--
-- SECURITY: RLS ENABLED with NO policies on both tables -> service-role only, consistent with
-- `telegram_connections` and `instagram_connections`. A leaked `email_connections` row would
-- let someone send mail as the customer's business.
--
-- Idempotent DDL (safe to re-run).

create table if not exists public.email_connections (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null,

  -- The address WE issue and the customer forwards to (e.g. acme-a7f3@in.denku.io). This is
  -- addressing, not a credential: anyone who learns it can post mail at us, which is exactly
  -- what an email address is for. Inbound is authenticated by the Resend webhook signature,
  -- never by this string being secret.
  inbound_address       text not null,

  -- The customer's own published address that forwards here (info@sirketi.com). Two jobs:
  -- it is the human-readable identifier in the Channels UI, and it is one of the addresses
  -- the loop guard refuses to open a conversation for.
  forward_from_address  text,
  forward_verified_at   timestamptz,
  -- Gmail (unlike Outlook) emails a confirmation code to the forwarding target before it
  -- will forward anything. That mail lands at `inbound_address`, so the webhook can read the
  -- code and complete the handshake instead of making the customer copy it by hand.
  forward_verification_code text,

  -- Sending identity. A reply must arrive as the BUSINESS — a customer answered from
  -- notifications@denku.io is precisely the over-claim the honesty rules forbid — so nothing
  -- is sent until the org has a DKIM-verified domain of their own.
  sending_domain        text,
  sending_domain_status text not null default 'unverified'
                          check (sending_domain_status in ('unverified','pending','verified','failed')),
  resend_domain_id      text,
  from_name             text,
  from_address          text,

  -- How the AI is allowed to answer. 'draft' (the default) means it writes and the owner
  -- sends; 'auto' means it sends by itself, like Telegram. Email defaults to draft because an
  -- email reply is a record: it is forwarded, kept, and occasionally legally meaningful, and
  -- unlike a chat message it cannot be walked back.
  reply_mode            text not null default 'draft'
                          check (reply_mode in ('draft','auto')),

  -- Which AI Employee answers on this address. Same ownership edge as
  -- `telegram_connections.assigned_agent_id` and `phone_lines.assigned_agent_id`.
  assigned_agent_id     uuid,

  status                text not null default 'connected'
                          check (status in ('connected','revoked','error')),
  last_error            text,
  last_inbound_at       timestamptz,

  connected_by          uuid,
  meta                  jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- One inbound address resolves to exactly ONE connection, globally. This is how the
  -- webhook turns a delivery into an org; an ambiguous address would route a customer's mail
  -- into another tenant's Inbox.
  constraint email_connections_inbound_address_unique unique (inbound_address)
);

-- Multiple addresses per org are allowed on purpose (info@ and support@ may want different
-- employees, or different reply modes), so there is no unique constraint on org_id.
create index if not exists idx_email_connections_org
  on public.email_connections (org_id);
create index if not exists idx_email_connections_status
  on public.email_connections (status);
create index if not exists idx_email_connections_agent
  on public.email_connections (assigned_agent_id);

alter table public.email_connections enable row level security;
-- Intentionally NO policies: service-role only. This row grants the ability to send mail as
-- the customer's business.

create table if not exists public.conversation_drafts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,

  -- What the AI would have said.
  body            text not null,
  -- Artifacts created while generating it, so the approval UI can show "this also booked
  -- Thursday 3 PM" rather than leaving the owner to discover it in their calendar.
  artifacts       jsonb not null default '[]'::jsonb,

  generated_at    timestamptz not null default now(),
  -- Stamped when the owner sends or dismisses it. Kept rather than deleted so "the AI drafted
  -- something and a person threw it away" stays visible.
  discarded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One pending draft per conversation: the upsert target. A second inbound message replaces
  -- the draft rather than queueing a second answer to a question that has moved on.
  constraint conversation_drafts_org_conversation_unique unique (org_id, conversation_id)
);

create index if not exists idx_conversation_drafts_org_pending
  on public.conversation_drafts (org_id, generated_at desc)
  where discarded_at is null;

alter table public.conversation_drafts enable row level security;
-- Intentionally NO policies: service-role only, like every other platform table.

-- Self-contained updated_at trigger. There is no shared public.update_updated_at_column() in
-- this database (see the Instagram and Telegram migrations), so this defines its own.
create or replace function public.email_channel_set_updated_at()
  returns trigger language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_email_connections_updated_at on public.email_connections;
create trigger trg_email_connections_updated_at
  before update on public.email_connections
  for each row execute function public.email_channel_set_updated_at();

drop trigger if exists trg_conversation_drafts_updated_at on public.conversation_drafts;
create trigger trg_conversation_drafts_updated_at
  before update on public.conversation_drafts
  for each row execute function public.email_channel_set_updated_at();

comment on table public.email_connections is
  'Per-tenant email channel: the forwarding address we issue, the DKIM-verified domain we may send as, and the AI reply mode. Service-role only.';
comment on column public.email_connections.inbound_address is
  'The address we issue for the customer to forward to. Addressing, not a secret - inbound is authenticated by the Resend webhook signature.';
comment on column public.email_connections.reply_mode is
  'draft = AI writes, a person sends (default; an email reply cannot be walked back). auto = AI sends by itself.';
comment on table public.conversation_drafts is
  'An AI reply written but NOT sent. Deliberately not in `messages`: the Inbox must never show a message the customer did not receive.';

-- ROLLBACK:
--   drop trigger if exists trg_conversation_drafts_updated_at on public.conversation_drafts;
--   drop trigger if exists trg_email_connections_updated_at on public.email_connections;
--   drop function if exists public.email_channel_set_updated_at();
--   drop table if exists public.conversation_drafts;
--   drop table if exists public.email_connections;
--   (Conversations/messages written by the channel are channel-agnostic and survive.)
