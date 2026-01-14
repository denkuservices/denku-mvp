-- Create billing_plan_catalog table as canonical source of plan definitions
CREATE TABLE IF NOT EXISTS public.billing_plan_catalog (
  plan_code text PRIMARY KEY,
  display_name text NOT NULL,
  monthly_fee_usd numeric NOT NULL,
  included_minutes int NOT NULL,
  overage_rate_usd_per_min numeric NOT NULL,
  concurrency_limit int NOT NULL,
  included_phone_numbers int NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_billing_plan_catalog_updated_at
  BEFORE UPDATE ON public.billing_plan_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.billing_plan_catalog ENABLE ROW LEVEL SECURITY;

-- Create read policy for authenticated users (plan metadata is globally readable)
CREATE POLICY "Allow authenticated users to read plan catalog"
  ON public.billing_plan_catalog
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed plan data
INSERT INTO public.billing_plan_catalog (
  plan_code,
  display_name,
  monthly_fee_usd,
  included_minutes,
  overage_rate_usd_per_min,
  concurrency_limit,
  included_phone_numbers
) VALUES
  ('starter', 'Starter', 149.00, 400, 0.22, 1, 1),
  ('growth', 'Growth', 399.00, 1200, 0.18, 4, 2),
  ('scale', 'Scale', 899.00, 3600, 0.13, 10, 5)
ON CONFLICT (plan_code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  monthly_fee_usd = EXCLUDED.monthly_fee_usd,
  included_minutes = EXCLUDED.included_minutes,
  overage_rate_usd_per_min = EXCLUDED.overage_rate_usd_per_min,
  concurrency_limit = EXCLUDED.concurrency_limit,
  included_phone_numbers = EXCLUDED.included_phone_numbers,
  updated_at = now();
