-- Create billing_overage_state table for thresholded overage collection
CREATE TABLE IF NOT EXISTS public.billing_overage_state (
  org_id uuid NOT NULL,
  month text NOT NULL, -- YYYY-MM-01 format
  threshold_usd numeric NOT NULL DEFAULT 100,
  hard_cap_usd numeric NOT NULL DEFAULT 250,
  last_collected_overage_usd numeric DEFAULT 0 NOT NULL,
  next_collect_at_overage_usd numeric NOT NULL DEFAULT 100,
  last_collect_attempt_at timestamptz,
  last_collect_invoice_id text,
  last_collect_status text, -- 'pending' | 'succeeded' | 'failed'
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (org_id, month)
);

-- Add updated_at trigger
CREATE TRIGGER update_billing_overage_state_updated_at
  BEFORE UPDATE ON public.billing_overage_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.billing_overage_state ENABLE ROW LEVEL SECURITY;

-- Create RLS policy: users can only read/write their own org's overage state
CREATE POLICY "Users can manage their org's overage state"
  ON public.billing_overage_state
  FOR ALL
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE auth_user_id = auth.uid()
    )
  );

-- Grant service_role full access (for admin operations)
GRANT ALL ON public.billing_overage_state TO service_role;

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_billing_overage_state_org_id 
  ON public.billing_overage_state(org_id);

CREATE INDEX IF NOT EXISTS idx_billing_overage_state_month 
  ON public.billing_overage_state(month);

CREATE INDEX IF NOT EXISTS idx_billing_overage_state_last_collect_status 
  ON public.billing_overage_state(last_collect_status) 
  WHERE last_collect_status IS NOT NULL;
