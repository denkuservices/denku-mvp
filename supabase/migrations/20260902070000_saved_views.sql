-- Saved views: a named filter someone actually uses, instead of one they rebuild every morning.
--
-- WHY A QUERY STRING AND NOT A FILTER SCHEMA. A view stores the surface's own search params
-- verbatim ("status=open&type=ticket"). Modelling filters as columns would mean a second place
-- that has to know what a filter means, and the two would drift the first time a page gained a
-- control — the page would filter one way and the saved view another. Storing what the page
-- itself reads keeps exactly one definition of a filter, and a param a page later stops
-- supporting is ignored by the page rather than becoming a broken view.
--
-- WHY `shared` AND NOT A ROLE. Two owners of the same workspace want different working sets —
-- "my open requests" is not "everything unassigned". So a view is private to its creator unless
-- they publish it, and publishing is a property of the view rather than of who is reading.
--
-- RLS-LOCKED, SERVICE-ROLE ONLY — RLS enabled with no policies, the same as every other platform
-- table. Access goes through server code with an explicit `org_id` filter, which is also where
-- the private/shared rule is enforced.
--
-- Idempotent. ROLLBACK: drop table if exists public.saved_views;

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  -- Which list this view belongs to: 'requests', 'contacts', …
  surface text not null,
  name text not null,
  -- The surface's own search params, without a leading '?'.
  query text not null default '',
  -- Visible to the whole workspace, or only to whoever made it.
  shared boolean not null default false,
  -- `profiles.id`. Not a FK: a member can be removed while their shared view stays useful to the
  -- workspace, and a view that vanishes when someone leaves is a filter the team has to rebuild.
  created_by uuid,
  -- Manual ordering within a surface. Ties fall back to name.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'saved_views_surface_check') then
    alter table public.saved_views
      add constraint saved_views_surface_check
      check (surface in ('requests', 'contacts', 'appointments', 'calls'));
  end if;
end $$;

-- One name per surface per owner, so "Open this week" cannot exist twice in the same list. Shared
-- and private views of the same name by the same person are still one name — that is the point.
create unique index if not exists saved_views_unique_name_idx
  on public.saved_views (org_id, surface, coalesce(created_by, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create index if not exists saved_views_org_surface_idx
  on public.saved_views (org_id, surface, position, created_at);

alter table public.saved_views enable row level security;

comment on table public.saved_views is
  'Named, per-surface saved filters. Stores the page''s own search params verbatim so there is one definition of a filter. Service-role only (RLS enabled, no policies).';
