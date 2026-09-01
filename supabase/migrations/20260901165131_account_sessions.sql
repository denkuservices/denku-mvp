-- Account security: see and revoke individual sessions.
--
-- WHY: Settings → Account offered exactly one session control — "sign out everywhere" — which is
-- the right button to have and the wrong one to be the only button. Someone who left a session
-- open on a shared laptop had to sign themselves out of their phone, their desktop and the tab
-- they were reading the setting in, and had no way to know a stale session existed in the first
-- place.
--
-- Supabase Auth stores sessions in `auth.sessions`, which PostgREST cannot reach and must not:
-- it is every session on the platform. These two functions expose exactly the caller's own rows,
-- and nothing else. SECURITY DEFINER with a pinned search_path, filtered on auth.uid() inside the
-- function body — never on a parameter the caller supplies.

create or replace function public.list_my_sessions()
returns table (
  id           uuid,
  created_at   timestamptz,
  refreshed_at timestamptz,
  user_agent   text,
  ip           text,
  aal          text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return query
    select s.id,
           s.created_at,
           -- auth.sessions.refreshed_at is `timestamp WITHOUT time zone` while updated_at is
           -- `timestamptz`; coalescing them raw is a type error. The stored value is UTC.
           coalesce(s.refreshed_at at time zone 'UTC', s.updated_at) as refreshed_at,
           s.user_agent,
           host(s.ip)::text as ip,
           s.aal::text
    from auth.sessions s
    where s.user_id = v_user
      and (s.not_after is null or s.not_after > now())
    order by coalesce(s.refreshed_at at time zone 'UTC', s.updated_at) desc nulls last;
end $$;

revoke all on function public.list_my_sessions() from public;
grant execute on function public.list_my_sessions() to authenticated;

comment on function public.list_my_sessions() is
  'The calling user''s own active sessions. Never returns another user''s rows.';

-- Revoking one session. The id is checked against auth.uid() in the WHERE clause, so passing
-- someone else''s session id deletes nothing rather than deleting theirs.
create or replace function public.revoke_my_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_deleted int;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from auth.sessions where id = p_session_id and user_id = v_user;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end $$;

revoke all on function public.revoke_my_session(uuid) from public;
grant execute on function public.revoke_my_session(uuid) to authenticated;

comment on function public.revoke_my_session(uuid) is
  'Sign one of the calling user''s own sessions out. Returns false if the session is not theirs.';

-- ROLLBACK:
--   drop function if exists public.revoke_my_session(uuid);
--   drop function if exists public.list_my_sessions();
-- Safe: additive; the Settings page degrades to the existing "sign out everywhere" control.
