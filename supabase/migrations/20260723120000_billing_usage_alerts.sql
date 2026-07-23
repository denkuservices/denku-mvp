-- R-009 — proactive usage-threshold alert markers (2026-07-23)
--
-- Idempotency ledger for the 50/75/90%-of-included-minutes warning emails: one row
-- per (org, month, threshold) so the daily usage-alerts cron never re-sends a
-- threshold it has already alerted. Service-role only (RLS enabled, no policy).

CREATE TABLE IF NOT EXISTS public.billing_usage_alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  month         date NOT NULL,               -- first of the month (UTC)
  threshold_pct integer NOT NULL,            -- 50 | 75 | 90
  sent_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, month, threshold_pct)
);

ALTER TABLE public.billing_usage_alerts ENABLE ROW LEVEL SECURITY;
-- No policy ⇒ service-role only (the cron uses the admin client; anon gets nothing).
