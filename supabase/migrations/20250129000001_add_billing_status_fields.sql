-- Add billing_status fields to organization_settings for pause guardrails
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS billing_status text DEFAULT 'active' NOT NULL,
  ADD COLUMN IF NOT EXISTS paused_reason text,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

-- Add constraint for valid billing_status values
ALTER TABLE public.organization_settings
  DROP CONSTRAINT IF EXISTS check_billing_status;

ALTER TABLE public.organization_settings
  ADD CONSTRAINT check_billing_status 
  CHECK (billing_status IN ('active', 'past_due', 'paused'));

-- Add index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_organization_settings_billing_status 
  ON public.organization_settings(billing_status) 
  WHERE billing_status != 'active';

-- Update existing rows to have 'active' billing_status if null
UPDATE public.organization_settings
SET billing_status = 'active'
WHERE billing_status IS NULL;
