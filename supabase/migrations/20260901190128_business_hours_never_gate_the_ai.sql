-- Opening hours describe when STAFF are in. They never decide whether the AI answers.
--
-- WHY (owner decision, 2026-09-01): every Denku product works 24/7. A business paying for an AI
-- employee is buying the eleven-at-night call its competitors miss, and a schedule that made the
-- assistant hang up would be selling that back to them.
--
-- The vocabulary shipped hours earlier carried `say_closed` — "state the opening hours and end the
-- call politely without collecting anything" — which is an option that switches the product off.
-- It is removed. `take_message` is renamed to `note_hours`, which is what it now means: mention
-- that the business is closed, then carry on answering, booking and collecting exactly as usual.
--
-- Safe: verified before applying that no row had `business_hours` set and none used `say_closed`.
-- The UPDATE is written to be re-runnable regardless of what a given environment holds.

alter table public.organization_settings
  drop constraint if exists organization_settings_after_hours_check;

alter table public.organization_settings
  alter column after_hours_behavior drop default;

update public.organization_settings
   set after_hours_behavior = 'note_hours'
 where after_hours_behavior in ('take_message', 'say_closed');

alter table public.organization_settings
  alter column after_hours_behavior set default 'note_hours';

alter table public.organization_settings
  add constraint organization_settings_after_hours_check
  check (after_hours_behavior in ('note_hours', 'answer_normally'));

comment on column public.organization_settings.after_hours_behavior is
  'How the AI talks about opening hours when a customer arrives outside them: note_hours (say the business is closed, then keep helping) | answer_normally (do not raise it). Neither stops the AI answering — hours never gate the product.';

-- ROLLBACK:
--   alter table public.organization_settings drop constraint if exists organization_settings_after_hours_check;
--   alter table public.organization_settings alter column after_hours_behavior set default 'take_message';
--   alter table public.organization_settings
--     add constraint organization_settings_after_hours_check
--     check (after_hours_behavior in ('take_message','answer_normally','say_closed'));
-- Note: rolling back restores the VOCABULARY, not the rows — anything already migrated to
-- 'note_hours' would need mapping back to 'take_message' by hand.
