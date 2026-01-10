-- RPC function to atomically acquire an org-level concurrency lease
-- Uses pg_advisory_xact_lock to serialize acquires per org within the transaction
CREATE OR REPLACE FUNCTION public.acquire_org_concurrency_lease(
  p_org_id uuid,
  p_limit int,
  p_agent_id uuid DEFAULT NULL,
  p_vapi_call_id text DEFAULT NULL,
  p_ttl_minutes int DEFAULT 15
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_active_count int;
  v_expires_at timestamptz;
BEGIN
  -- Serialize acquires per org using advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));
  
  -- Count active leases for this org (released_at IS NULL AND expires_at > now())
  SELECT COUNT(*)
  INTO v_active_count
  FROM public.call_concurrency_leases
  WHERE org_id = p_org_id
    AND released_at IS NULL
    AND expires_at > now();
  
  -- Check if we've reached the limit
  IF v_active_count >= p_limit THEN
    RETURN false;
  END IF;
  
  -- Calculate expires_at
  v_expires_at := now() + make_interval(mins => p_ttl_minutes);
  
  -- Insert new lease
  INSERT INTO public.call_concurrency_leases (
    org_id,
    agent_id,
    vapi_call_id,
    acquired_at,
    released_at,
    expires_at
  ) VALUES (
    p_org_id,
    p_agent_id,
    p_vapi_call_id,
    now(),
    NULL,
    v_expires_at
  );
  
  RETURN true;
END;
$$;

-- RPC function to release an org-level concurrency lease by vapi_call_id
CREATE OR REPLACE FUNCTION public.release_org_concurrency_lease(
  p_org_id uuid,
  p_vapi_call_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.call_concurrency_leases
  SET released_at = now()
  WHERE org_id = p_org_id
    AND vapi_call_id = p_vapi_call_id
    AND released_at IS NULL;
END;
$$;

-- RPC function to clean up expired leases (can be called periodically)
CREATE OR REPLACE FUNCTION public.release_expired_concurrency_leases()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.call_concurrency_leases
  SET released_at = now()
  WHERE released_at IS NULL
    AND expires_at < now();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
