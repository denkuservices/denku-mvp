-- BYO phone numbers — a tenant connects a number they already own, over their own SIP trunk
--
-- WHAT: `sip_trunks` (one row per customer trunk, service-role only) plus five additive columns
-- on `phone_lines` so a line records WHERE it came from and whether the tenant has proven they
-- control it.
--
-- WHY a table and not a column on `phone_lines`: one trunk can back several numbers. A table
-- gives a refcount on delete (release the Vapi credential only when the last number using it
-- goes), one place to show connection status, and one place to name the trunk in support.
--
-- SECURITY: `sip_trunks` has RLS ENABLED with NO policies → service-role only, exactly like
-- `telegram_connections` and `instagram_connections`. A row here points at a credential that can
-- place calls as the customer's business.
--
-- NOTE ON THE PASSWORD: `auth_password_encrypted` exists but is expected to stay NULL. The
-- connect path sends the SIP password straight to Vapi and keeps only `vapi_credential_id`;
-- there is no product reason to hold it. If a future flow must re-create a credential without
-- re-asking the customer, it goes through `lib/crypto/secretBox.ts` (AES-256-GCM) — never
-- plaintext, and never returned to a browser.
--
-- Idempotent DDL (safe to re-run). See docs/BYO_PHONE_NUMBERS_PLAN.md.

create table if not exists public.sip_trunks (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null,

  -- What the customer calls this trunk, and who provides it. `provider_key` is free text on
  -- purpose: 'netgsm' today, another Turkish or European carrier tomorrow, with no migration.
  name                    text not null,
  provider_key            text,

  -- The Vapi `byo-sip-trunk` credential this trunk maps to. Unique: one credential belongs to
  -- exactly one trunk row, or a delete would release a credential another org still uses.
  vapi_credential_id      text not null,

  -- Where the carrier's SIP lives (host or IP) — for Netgsm, `sip.netgsm.com.tr`.
  gateway_host            text not null,
  gateway_port            integer,

  -- The SIP auth username is an identifier, not a secret, and support needs to read it back.
  auth_username           text,
  auth_password_encrypted text,

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
-- Intentionally NO policies: service-role only.

create or replace function public.sip_trunks_set_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sip_trunks_updated_at on public.sip_trunks;
create trigger trg_sip_trunks_updated_at
  before update on public.sip_trunks
  for each row execute function public.sip_trunks_set_updated_at();

-- ---------------------------------------------------------------------------
-- phone_lines: where the line came from, and whether control has been proven.
-- ---------------------------------------------------------------------------

alter table public.phone_lines
  add column if not exists provider            text not null default 'vapi',
  add column if not exists sip_trunk_id        uuid,
  add column if not exists verification_status text not null default 'verified',
  add column if not exists verified_at         timestamptz,
  add column if not exists connected_by        uuid;

-- Existing rows default correctly by construction: every line so far was provisioned BY Denku
-- ('vapi'), and a number we bought needs no proof of control ('verified'). Only BYO rows are
-- inserted as 'pending'.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'phone_lines_provider_check') then
    alter table public.phone_lines
      add constraint phone_lines_provider_check
      check (provider in ('vapi','byo_sip','twilio'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'phone_lines_verification_status_check') then
    alter table public.phone_lines
      add constraint phone_lines_verification_status_check
      check (verification_status in ('pending','verified','failed'));
  end if;
end $$;

create index if not exists idx_phone_lines_trunk on public.phone_lines (sip_trunk_id);

-- A claimed number belongs to ONE tenant. Today the only uniqueness is
-- (org_id, phone_number_e164), so two orgs could each claim the same number and each believe
-- they own the conversation. Denku-provisioned numbers cannot collide (Vapi hands them out), so
-- the index is partial and only guards numbers a customer asserts.
create unique index if not exists uq_phone_lines_claimed_e164
  on public.phone_lines (phone_number_e164)
  where provider <> 'vapi';

comment on table public.sip_trunks is
  'BYO SIP trunks: a customer''s own carrier trunk mapped to a Vapi byo-sip-trunk credential. Service-role only. See docs/BYO_PHONE_NUMBERS_PLAN.md.';
comment on column public.phone_lines.verification_status is
  'BYO lines start ''pending'' and become ''verified'' when the FIRST real inbound call arrives — a trunk not actually pointed at Vapi never produces one, so the call itself is the proof of control.';
