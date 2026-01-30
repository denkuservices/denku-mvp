-- RPC: Return today's inbound call count per phone number for an org.
-- Used by Phone Lines list to show "Today" column without N+1 queries.
-- "Today" = day boundary in server timezone (date_trunc('day', now())).

CREATE OR REPLACE FUNCTION public.fn_calls_today_counts_by_phone_number(
  p_org_id uuid,
  p_vapi_phone_number_ids text[]
)
RETURNS TABLE(vapi_phone_number_id text, today_inbound_calls bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.vapi_phone_number_id::text AS vapi_phone_number_id,
    COUNT(*)::bigint AS today_inbound_calls
  FROM public.calls c
  WHERE c.org_id = p_org_id
    AND (c.direction IS NULL OR c.direction = 'inbound')
    AND c.started_at >= date_trunc('day', now())
    AND c.vapi_phone_number_id IS NOT NULL
    AND c.vapi_phone_number_id = ANY(p_vapi_phone_number_ids)
  GROUP BY c.vapi_phone_number_id;
$$;
