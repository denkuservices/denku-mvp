-- Persist each signed-in user's interface language so transactional email can use it.
alter table public.profiles
  add column if not exists ui_locale text;

update public.profiles
set ui_locale = 'en'
where ui_locale is null
   or ui_locale not in ('en', 'es', 'de', 'tr');

alter table public.profiles
  alter column ui_locale set default 'en',
  alter column ui_locale set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_ui_locale_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_ui_locale_check
      check (ui_locale in ('en', 'es', 'de', 'tr'));
  end if;
end
$$;

comment on column public.profiles.ui_locale is
  'Signed-in interface and transactional-email locale: en, es, de, or tr.';

-- The product default no longer opts a workspace into the earliest 50% warning.
alter table public.organization_settings
  alter column usage_alert_thresholds set default '{75,90}'::smallint[];

-- Migrate only the former untouched default; custom ladders are preserved.
update public.organization_settings
set usage_alert_thresholds = '{75,90}'::smallint[]
where usage_alert_thresholds = '{50,75,90}'::smallint[];

-- Rollback (manual): drop profiles_ui_locale_check and profiles.ui_locale, restore the
-- organization_settings default to '{50,75,90}'. Existing threshold choices should not
-- be blindly backfilled during rollback because they may have changed after this migration.
