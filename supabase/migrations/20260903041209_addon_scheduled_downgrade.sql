-- Add-ons a customer drops keep working until the period they paid for ends.
--
-- Dropping an add-on used to do two things at once, both wrong: Stripe was asked to remove the
-- subscription item with its default proration, which credits the unused days back, and the row
-- was flipped to 'inactive' the same second, which took the capacity away immediately. The
-- customer paid for a month, lost the capacity on day two, and had the rest credited — nobody
-- asked for either half.
--
-- These two columns record a downgrade instead of performing it. `qty` keeps meaning "what this
-- workspace is entitled to", so every existing reader is correct without being touched;
-- `scheduled_qty` is what it becomes at `ends_at`, which is the end of the Stripe period already
-- paid for. Enforcement is at READ time (lib/billing/addonSchedule.ts) so the entitlement is
-- never wrong while a sweep is late; the monthly close-month sweep only tidies the rows.
--
-- Additive and idempotent. Existing rows get NULLs, which mean "no downgrade scheduled" and
-- therefore behave exactly as they do today.
--
-- ROLLBACK:
--   alter table public.billing_org_addons drop column if exists ends_at;
--   alter table public.billing_org_addons drop column if exists scheduled_qty;

alter table public.billing_org_addons
  add column if not exists ends_at timestamptz;

alter table public.billing_org_addons
  add column if not exists scheduled_qty integer;

comment on column public.billing_org_addons.ends_at is
  'When a scheduled downgrade takes effect — the end of the Stripe period the customer already paid for. NULL means nothing is scheduled. Enforced at read time by effectiveAddonQty(), not by a cron.';

comment on column public.billing_org_addons.scheduled_qty is
  'The quantity this add-on drops to at ends_at (0 = removed). NULL means nothing is scheduled.';

-- The sweep and every entitlement read filter on this; without it they scan the table.
create index if not exists idx_billing_org_addons_ends_at
  on public.billing_org_addons (ends_at)
  where ends_at is not null;
