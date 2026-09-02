-- Which brain answers the phone, per employee.
--
-- Additive and idempotent. `standard` is what every line already runs, so an existing agent that
-- takes the default is unchanged by definition — this column can be added to a live workspace
-- without altering a single call.
--
-- Deliberately a free-text column with a CHECK rather than an enum: the tier NAMES are a product
-- promise ("Standard", "Advanced") while the models behind them will be replaced, and a Postgres
-- enum makes adding a third tier a migration instead of a deploy.
--
-- ROLLBACK: alter table public.agents drop column if exists model_tier;

alter table public.agents
  add column if not exists model_tier text not null default 'standard';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'agents_model_tier_check'
  ) then
    alter table public.agents
      add constraint agents_model_tier_check
      check (model_tier in ('standard', 'advanced'));
  end if;
end $$;

comment on column public.agents.model_tier is
  'Which model tier answers for this employee. Standard is the shipped default; Advanced is an upgrade only. See web/src/lib/llm/modelTiers.ts.';
