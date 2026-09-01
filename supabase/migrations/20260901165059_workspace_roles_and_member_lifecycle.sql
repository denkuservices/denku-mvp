-- Workspace roles and member lifecycle.
--
-- WHY: `profiles.role` was a free-text column with no constraint, `org_invites.role` the same, and
-- there was no way to change someone's role, remove them, revoke a pending invite, or hand the
-- workspace to a different owner. An admin could invite a second owner; nothing stopped the last
-- owner being demoted, which would leave a workspace nobody could take a billing decision in.
--
-- Additive and idempotent. Two SECURITY DEFINER functions are added:
--   * transfer_org_ownership — the only atomic way to move `owner`, callable only by the owner.
--   * org_member_last_sign_in — reads auth.users.last_sign_in_at for one org's members, so the
--     member list can show "last active" without the app being handed the whole auth schema.

-- ---------------------------------------------------------------------------
-- 1) Constrain the role vocabulary. Production holds only 'owner' today, so this cannot fail;
--    it stops a typo ("Owner", "admins") from becoming a role nothing in the app recognises.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('owner', 'admin', 'viewer'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'org_invites_role_check'
  ) then
    alter table public.org_invites
      add constraint org_invites_role_check
      check (role in ('owner', 'admin', 'viewer'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'org_invites_status_check'
  ) then
    alter table public.org_invites
      add constraint org_invites_status_check
      check (status in ('pending', 'accepted', 'revoked', 'expired'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Invite lifecycle columns. "Resend" has to be rate-limitable and "revoke" has to be
--    attributable, which means both need a timestamp of their own rather than a status flip.
-- ---------------------------------------------------------------------------
alter table public.org_invites add column if not exists last_sent_at  timestamptz;
alter table public.org_invites add column if not exists revoked_at    timestamptz;
alter table public.org_invites add column if not exists revoked_by    uuid;

create index if not exists org_invites_org_status_idx
  on public.org_invites (org_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- 3) Ownership transfer.
--
-- Two UPDATEs in application code would leave a window with two owners (or none) if the second
-- failed. This does both inside one statement-level transaction, and refuses unless the CALLER is
-- an owner of that org — so the check cannot be forgotten at a call site.
--
-- SECURITY DEFINER because it writes `profiles` rows other than the caller's own, which RLS
-- correctly forbids. `search_path` is pinned: a definer function that resolves unqualified names
-- through the caller's search_path is how privilege escalation happens.
-- ---------------------------------------------------------------------------
create or replace function public.transfer_org_ownership(
  p_org_id uuid,
  p_to_profile uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_profile uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- The caller's profile row, found the way the app finds it (id first, then auth_user_id —
  -- this project carries both keys across its history).
  select id into v_caller_profile
  from public.profiles
  where org_id = p_org_id
    and (id = v_caller or auth_user_id = v_caller)
    and role = 'owner'
  limit 1;

  if v_caller_profile is null then
    raise exception 'only the workspace owner can transfer ownership' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles where id = p_to_profile and org_id = p_org_id
  ) then
    raise exception 'that person is not a member of this workspace' using errcode = '23503';
  end if;

  if v_caller_profile = p_to_profile then
    return; -- transferring to yourself is a no-op, not an error
  end if;

  update public.profiles set role = 'owner', updated_at = now() where id = p_to_profile;
  update public.profiles set role = 'admin', updated_at = now() where id = v_caller_profile;
end $$;

revoke all on function public.transfer_org_ownership(uuid, uuid) from public;
grant execute on function public.transfer_org_ownership(uuid, uuid) to authenticated;

comment on function public.transfer_org_ownership(uuid, uuid) is
  'Atomically move the owner role to another member of the same org. Caller must be that org''s owner; the caller becomes admin.';

-- ---------------------------------------------------------------------------
-- 4) Last sign-in per member.
--
-- `auth.users` is not reachable through PostgREST, and it should not be — it holds every user on
-- the platform. This returns ONE org's members and ONE column, and only to a caller who is an
-- owner or admin of that org.
-- ---------------------------------------------------------------------------
create or replace function public.org_member_last_sign_in(p_org_id uuid)
returns table (profile_id uuid, last_sign_in_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles
    where org_id = p_org_id
      and (id = v_caller or auth_user_id = v_caller)
      and role in ('owner', 'admin')
  ) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  return query
    select p.id, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = coalesce(p.auth_user_id, p.id)
    where p.org_id = p_org_id;
end $$;

revoke all on function public.org_member_last_sign_in(uuid) from public;
grant execute on function public.org_member_last_sign_in(uuid) to authenticated;

comment on function public.org_member_last_sign_in(uuid) is
  'Last sign-in timestamp for the members of one org. Owner/admin only.';

-- ROLLBACK:
--   drop function if exists public.org_member_last_sign_in(uuid);
--   drop function if exists public.transfer_org_ownership(uuid, uuid);
--   drop index if exists public.org_invites_org_status_idx;
--   alter table public.org_invites drop column if exists revoked_by, drop column if exists revoked_at, drop column if exists last_sent_at;
--   alter table public.org_invites drop constraint if exists org_invites_status_check;
--   alter table public.org_invites drop constraint if exists org_invites_role_check;
--   alter table public.profiles drop constraint if exists profiles_role_check;
-- Safe: every object here is additive; dropping them restores the prior behaviour exactly.
