-- Add welcome email idempotency to organization_settings (one welcome per org).
-- Used by sendWelcomeOnOnboardingStart when org exists; ensures exactly one welcome email per org.

ALTER TABLE public.organization_settings
ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS welcome_email_last_error text NULL;

COMMENT ON COLUMN public.organization_settings.welcome_email_sent_at IS 'Set when "Welcome to Denku AI" email is sent (Resend). Idempotency per org.';
COMMENT ON COLUMN public.organization_settings.welcome_email_last_error IS 'Last error from welcome email send; cleared on success.';
