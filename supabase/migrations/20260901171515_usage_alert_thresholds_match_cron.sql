-- Usage-alert thresholds must be the ones the cron actually evaluates.
--
-- WHY: the Notifications setting shipped offering 50/80/100, but `lib/billing/usageAlerts.ts`
-- warns at 50/75/90 — so two of the three choices would have been settings that silently did
-- nothing. 100% is not a warning at all: reaching it PAUSES the workspace (owner policy, R-009),
-- and nobody gets to opt out of being told their phone line stopped.

alter table public.organization_settings
  alter column usage_alert_thresholds set default '{50,75,90}';

update public.organization_settings
   set usage_alert_thresholds = '{50,75,90}'
 where usage_alert_thresholds = '{50,80,100}';

-- ROLLBACK:
--   alter table public.organization_settings
--     alter column usage_alert_thresholds set default '{50,80,100}';
-- Safe: a default and a value correction; no column or constraint is added or dropped.
