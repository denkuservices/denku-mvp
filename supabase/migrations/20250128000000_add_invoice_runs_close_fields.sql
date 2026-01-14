-- Add fields needed for month close operations to billing_invoice_runs
-- These fields support idempotent invoice finalization and webhook reconciliation

-- Add lock fields for concurrent-safe processing
ALTER TABLE public.billing_invoice_runs
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS lock_token text;

-- Add timestamp fields for invoice lifecycle tracking
ALTER TABLE public.billing_invoice_runs
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- Add error message field for detailed error tracking
ALTER TABLE public.billing_invoice_runs
  ADD COLUMN IF NOT EXISTS error_message text;

-- Add index on lock_token for faster lock lookups (if needed)
CREATE INDEX IF NOT EXISTS idx_billing_invoice_runs_lock_token 
  ON public.billing_invoice_runs(lock_token) 
  WHERE lock_token IS NOT NULL;

-- Add index on status for filtering by invoice state
CREATE INDEX IF NOT EXISTS idx_billing_invoice_runs_status 
  ON public.billing_invoice_runs(status) 
  WHERE status IS NOT NULL;

-- Add index on stripe_invoice_id for webhook lookups
CREATE INDEX IF NOT EXISTS idx_billing_invoice_runs_stripe_invoice_id 
  ON public.billing_invoice_runs(stripe_invoice_id) 
  WHERE stripe_invoice_id IS NOT NULL;
