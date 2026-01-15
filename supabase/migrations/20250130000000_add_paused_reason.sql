-- Add paused_reason column to organization_settings
-- Values: 'manual' | 'hard_cap' | 'past_due'
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS paused_reason TEXT NULL;

-- Add constraint for valid paused_reason values
ALTER TABLE public.organization_settings
  DROP CONSTRAINT IF EXISTS check_paused_reason;

ALTER TABLE public.organization_settings
  ADD CONSTRAINT check_paused_reason 
  CHECK (paused_reason IS NULL OR paused_reason IN ('manual', 'hard_cap', 'past_due'));

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_organization_settings_paused_reason 
  ON public.organization_settings(paused_reason) 
  WHERE paused_reason IS NOT NULL;
