-- Onboarding phone intent: what the customer actually asked for at the phone step.
--
-- Until now the wizard asked "give your AI a phone line" and then threw the answer away. The
-- only thing that survived was `phone_desired_area_code`, which is a preference about a US
-- number and says nothing about whether a US number was wanted at all. A customer who clicked
-- "I don't need a phone line — I want chat" left no trace of having clicked it, so every screen
-- downstream had to guess from the plan — and before a plan exists there is nothing to guess from.
--
-- Three values, one column:
--   'new'  — claim a US number for me once the plan is paid for (today's default behaviour)
--   'byo'  — I already own a number and will connect it over my carrier's SIP trunk
--   'none' — I want chat, no phone line at all
-- NULL means the customer has not reached the step yet, and reads exactly like 'new' did before
-- this column existed, so nothing changes for a workspace mid-flow.
--
-- Additive and idempotent. ROLLBACK:
--   alter table public.orgs drop constraint if exists check_phone_provisioning_mode;
--   alter table public.orgs drop column if exists phone_provisioning_mode;

alter table public.orgs
  add column if not exists phone_provisioning_mode text;

alter table public.orgs
  drop constraint if exists check_phone_provisioning_mode;

-- Enforced at the database, like check_workspace_status and check_paused_reason: a value outside
-- this set would silently route a customer down the wrong activation branch.
alter table public.orgs
  add constraint check_phone_provisioning_mode
  check (phone_provisioning_mode is null or phone_provisioning_mode in ('new', 'byo', 'none'));

comment on column public.orgs.phone_provisioning_mode is
  'Onboarding phone intent: new = claim a US number, byo = connect a number the customer owns, none = chat only, NULL = not asked yet.';
