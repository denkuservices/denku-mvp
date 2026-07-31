-- Concurrency lease RPCs.
--
-- R-031 (2026-07-30): the definitions in this file were REPLACED with the
-- definitions actually present in production. The original January-2025 versions
-- had drifted badly from the live database — CLAUDE.md landmine #9 documented
-- exactly this ("never assume a migration file describes the current function
-- signature"). Concretely, this file used to declare
--     acquire_org_concurrency_lease(p_org_id uuid, p_limit int, p_agent_id uuid, ...)
-- while production has
--     acquire_org_concurrency_lease(p_org_id uuid, p_agent_id uuid, p_vapi_call_id text,
--                                   p_limit integer, p_ttl_minutes integer DEFAULT 10)
--                                   RETURNS TABLE(ok boolean, active_count integer, limit_value integer)
-- Replaying the stale version would have REGRESSED production's signature, so the
-- file now carries production truth. The historical shape remains in git history.
-- Definitions below are verbatim from the 20241101000000 baseline (a production dump).

CREATE OR REPLACE FUNCTION "public"."acquire_org_concurrency_lease"("p_org_id" "uuid", "p_agent_id" "uuid", "p_vapi_call_id" "text", "p_limit" integer, "p_ttl_minutes" integer DEFAULT 10) RETURNS TABLE("ok" boolean, "active_count" integer, "limit_value" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_active integer;
begin
  -- Clean up expired leases first
  update public.call_concurrency_leases
    set released_at = now()
  where org_id = p_org_id
    and released_at is null
    and expires_at <= now();

  -- Count active leases for org
  select count(*) into v_active
  from public.call_concurrency_leases
  where org_id = p_org_id
    and released_at is null
    and expires_at > now();

  -- If already have a lease for this vapi_call_id, treat as ok (idempotent)
  if exists (
    select 1
    from public.call_concurrency_leases
    where org_id = p_org_id
      and vapi_call_id = p_vapi_call_id
      and released_at is null
      and expires_at > now()
  ) then
    ok := true;
    active_count := v_active;
    limit_value := p_limit;
    return next;
    return;
  end if;

  -- Enforce limit
  if v_active >= p_limit then
    ok := false;
    active_count := v_active;
    limit_value := p_limit;
    return next;
    return;
  end if;

  -- Acquire lease
  insert into public.call_concurrency_leases (
    org_id,
    agent_id,
    vapi_call_id,
    acquired_at,
    expires_at,
    released_at
  )
  values (
    p_org_id,
    p_agent_id,
    p_vapi_call_id,
    now(),
    now() + make_interval(mins => p_ttl_minutes),
    null
  )
  on conflict do nothing;

  -- Recount after insert (best-effort)
  select count(*) into v_active
  from public.call_concurrency_leases
  where org_id = p_org_id
    and released_at is null
    and expires_at > now();

  ok := true;
  active_count := v_active;
  limit_value := p_limit;
  return next;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."release_org_concurrency_lease"("p_org_id" "uuid", "p_vapi_call_id" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_updated integer;
begin
  update public.call_concurrency_leases
    set released_at = now(),
        updated_at = now()
  where org_id = p_org_id
    and vapi_call_id = p_vapi_call_id
    and released_at is null
    and expires_at > now();

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."release_expired_concurrency_leases"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  n integer;
begin
  update public.call_concurrency_leases
     set released_at = now(),
         updated_at = now()
   where released_at is null
     and expires_at <= now();

  get diagnostics n = row_count;
  return n;
end;
$$;
