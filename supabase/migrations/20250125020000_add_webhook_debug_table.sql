-- Debug table for webhook instrumentation
-- Allows tracking all webhook events for debugging lease issues
CREATE TABLE IF NOT EXISTS public.webhook_debug (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT,
  vapi_call_id TEXT,
  raw_payload JSONB,
  org_id UUID,
  agent_id UUID,
  direction TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  lease_acquired BOOLEAN,
  lease_released BOOLEAN,
  error_message TEXT
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_webhook_debug_vapi_call_id ON public.webhook_debug(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_webhook_debug_created_at ON public.webhook_debug(created_at DESC);

-- Enable RLS (but allow service role to write)
ALTER TABLE public.webhook_debug ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for webhook writes)
CREATE POLICY "Service role can insert webhook_debug"
ON public.webhook_debug
FOR INSERT
TO service_role
WITH CHECK (true);

-- Service role can read webhook_debug
CREATE POLICY "Service role can select webhook_debug"
ON public.webhook_debug
FOR SELECT
TO service_role
USING (true);
