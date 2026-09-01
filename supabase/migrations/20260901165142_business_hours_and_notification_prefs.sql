-- Structured business hours + notification preferences.
--
-- WHY (business hours): Denku answers a phone. Opening hours existed only as free text inside the
-- AI Employee prompt, so the AI could *say* "we're open until six" and had no way to *behave*
-- differently at seven; the webhook's `isOutsideBusinessHours` was a stub returning "inside hours"
-- for every call ever made, and the phone-line screen's "Business hours" control said Coming soon.
-- Settings meanwhile told the customer their timezone was set so "the AI talks about your hours" —
-- which was true and useless.
--
-- The shape is deliberately a jsonb document rather than seven columns or a rows table: a week is
-- edited as one thing, saved as one thing, and read on every inbound call, and splitting it across
-- rows would buy nothing but joins. Validated in TypeScript (lib/business-hours/schema.ts) and
-- shape-checked here so a malformed write cannot land.
--
-- WHY (notifications): `notify_on_artifacts` was the only preference a customer had, and usage
-- alerts fired at fixed thresholds to an address they could not see or change. Both are now theirs.

alter table public.organization_settings
  add column if not exists business_hours jsonb;

alter table public.organization_settings
  add column if not exists after_hours_behavior text not null default 'take_message';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organization_settings_after_hours_check') then
    alter table public.organization_settings
      add constraint organization_settings_after_hours_check
      check (after_hours_behavior in ('take_message', 'answer_normally', 'say_closed'));
  end if;
end $$;

-- Minimal structural guard. The full rules (open < close, valid HH:MM, ISO dates) live in the
-- application schema; this only refuses something that is not the document shape at all, so a
-- direct SQL write cannot leave the call path parsing garbage at 3am.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organization_settings_business_hours_shape') then
    alter table public.organization_settings
      add constraint organization_settings_business_hours_shape
      check (
        business_hours is null
        or (
          jsonb_typeof(business_hours) = 'object'
          and jsonb_typeof(business_hours -> 'days') = 'array'
        )
      );
  end if;
end $$;

comment on column public.organization_settings.business_hours is
  'Structured opening hours: { days: [{ day: 0-6, closed: bool, intervals: [{ open: "HH:MM", close: "HH:MM" }] }], exceptions: [{ date: "YYYY-MM-DD", closed: bool, intervals: [...], label: text }] }. Interpreted in organization_settings.default_timezone.';

comment on column public.organization_settings.after_hours_behavior is
  'What the AI does on a call that arrives outside business hours: take_message | answer_normally | say_closed.';

-- ---------------------------------------------------------------------------
-- Notification preferences
-- ---------------------------------------------------------------------------
alter table public.organization_settings
  add column if not exists notify_usage_alerts boolean not null default true;

alter table public.organization_settings
  add column if not exists notify_billing_events boolean not null default true;

-- Where operational mail goes when it should NOT go to the billing address. Null = fall back to
-- billing_email, then the owner's profile email (lib/notifications/recipient.ts), unchanged.
alter table public.organization_settings
  add column if not exists notification_email text;

-- The share of the plan's included minutes at which the workspace wants to hear about it.
-- Stored as whole percents; empty array means "do not warn me about usage".
alter table public.organization_settings
  -- 50/75/90 because those are the thresholds `lib/billing/usageAlerts.ts` actually warns at.
-- 100% is not a warning: it PAUSES the workspace (owner policy, R-009), and a customer cannot
-- opt out of being told their line stopped.
add column if not exists usage_alert_thresholds smallint[] not null default '{50,75,90}';

comment on column public.organization_settings.usage_alert_thresholds is
  'Percentages of included minutes at which a usage alert is sent. Empty array disables usage alerts.';

-- ROLLBACK:
--   alter table public.organization_settings
--     drop column if exists usage_alert_thresholds,
--     drop column if exists notification_email,
--     drop column if exists notify_billing_events,
--     drop column if exists notify_usage_alerts;
--   alter table public.organization_settings drop constraint if exists organization_settings_business_hours_shape;
--   alter table public.organization_settings drop constraint if exists organization_settings_after_hours_check;
--   alter table public.organization_settings drop column if exists after_hours_behavior, drop column if exists business_hours;
-- Safe: every column is additive with a default that reproduces today's behaviour.
