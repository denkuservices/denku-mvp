-- Add welcome email idempotency columns to profiles (server-only Resend welcome email).
-- welcome_email_sent_at: set when welcome email is sent (conditional UPDATE ensures exactly once per user/org).
-- welcome_email_last_error: optional, set when send fails so we can revert sent_at and retry.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz,
ADD COLUMN IF NOT EXISTS welcome_email_last_error text;

COMMENT ON COLUMN public.profiles.welcome_email_sent_at IS 'Set when "Welcome to Denku AI" email is sent (Resend). Used for idempotency.';
COMMENT ON COLUMN public.profiles.welcome_email_last_error IS 'Last error from welcome email send (optional); cleared on success.';
