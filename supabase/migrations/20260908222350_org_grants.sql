-- Operator grants — capacity Denku hands to a workspace without charging for it.
--
-- WHY A NEW TABLE AND NOT A `billing_org_addons` ROW.
-- `lib/billing/chatEntitlement.ts` already argues this for the internal workspace and the
-- argument is the same here: an add-on row with no Stripe subscription behind it puts a
-- $299/month line into every revenue figure the product computes, and a number in a revenue
-- report that nobody pays is a number somebody eventually acts on. Billing tables stay a
-- record of what was actually CHARGED. What was GIVEN lives here.
--
-- Reads are service-role only (RLS on, zero policies — same shape as the channel connection
-- tables). A customer sees the EFFECT of a grant (their chat channel answers, their trial
-- minutes tick down); they do not read the ledger.
--
-- ROLLBACK:
--   drop table if exists public.org_grants;
--   alter table public.phone_lines drop column if exists grant_id;
--   alter table public.organization_settings drop constraint if exists check_paused_reason;
--   alter table public.organization_settings add constraint check_paused_reason
--     check (paused_reason is null or paused_reason = any (array['manual','hard_cap','past_due']));

create table if not exists public.org_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,

  -- What was given. Three kinds because there are exactly three capacity questions the
  -- product asks: how many minutes may this workspace talk, how many chat channels may it
  -- answer on, how many phone lines may it hold.
  kind text not null check (kind in ('voice_minutes', 'chat_slots', 'phone_numbers')),
  amount integer not null check (amount >= 0),

  starts_at timestamptz not null default now(),
  -- Never null. A grant without an end is a plan, and a plan is something you sell.
  expires_at timestamptz not null,

  status text not null default 'active' check (status in ('active', 'revoked')),

  -- Why it was given, in the operator's own words. Shown back in the admin panel so a grant
  -- six weeks old is still explicable.
  note text,

  granted_by uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,

  constraint org_grants_window check (expires_at > starts_at)
);

-- The reader's exact predicate: one org, live right now.
create index if not exists org_grants_active_idx
  on public.org_grants (org_id, status, expires_at);

-- The expiry sweep's predicate: everything about to lapse, across all orgs.
create index if not exists org_grants_expiry_idx
  on public.org_grants (expires_at)
  where status = 'active';

alter table public.org_grants enable row level security;

comment on table public.org_grants is
  'Capacity granted by a platform operator (trials, goodwill). Deliberately NOT in billing_org_addons: those rows mean money changed hands. Service-role only.';

-- A line an operator provisioned for a trial, so revoking the grant knows which number to
-- release back to Vapi. Null for every line a customer bought — those are theirs.
alter table public.phone_lines
  add column if not exists grant_id uuid references public.org_grants(id) on delete set null;

comment on column public.phone_lines.grant_id is
  'Set when Denku provisioned this line for a grant rather than the customer buying it. Released when the grant ends.';

-- `trial_ended` joins the pause vocabulary.
--
-- The alternative was reusing `hard_cap`, and it would have been a lie told by email: the
-- pause notification branches on this value and would have told somebody on a free 30-minute
-- trial that their BILL had hit its ceiling. Same mechanism, different sentence.
alter table public.organization_settings
  drop constraint if exists check_paused_reason;

alter table public.organization_settings
  add constraint check_paused_reason
  check (paused_reason is null or paused_reason = any (array['manual', 'hard_cap', 'past_due', 'trial_ended']));
