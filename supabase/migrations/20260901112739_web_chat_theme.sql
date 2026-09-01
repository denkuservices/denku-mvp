-- Web Chat: the colours a business can make its own (R-141 follow-up)
--
-- WHAT: one additive `theme` column on `web_chat_connections`.
--
-- WHY a column and not `meta`: `meta` is the bag for incidental per-channel extras. How a
-- widget looks on a customer's website is not incidental — it is the first thing their visitors
-- see, and the first thing they asked to change after installing it. Naming it makes the intent
-- readable and keeps `meta` from becoming the place everything ends up.
--
-- WHY jsonb and not four colour columns: these values are one coherent thing that is read and
-- written together, and the set will grow (bubble colour, launcher icon, corner radius) without
-- deserving a migration each time. Nothing queries an individual colour.
--
-- **Every value is validated in the application, not here.** These strings are rendered into a
-- page as CSS custom properties, so `lib/webchat/theme.ts` accepts strict hex only and drops
-- anything else. A CHECK constraint on jsonb contents would duplicate that rule in a second
-- place where it could drift, and the write path already refuses bad input before it arrives.
--
-- Shape (all optional; anything missing falls back to the widget's own defaults):
--   { "accent": "#1B6E6E", "surface": "#F7F5F1", "headerBg": "#1B6E6E", "headerText": "#FFFFFF" }
--
-- Idempotent DDL (safe to re-run).

alter table public.web_chat_connections
  add column if not exists theme jsonb not null default '{}'::jsonb;

comment on column public.web_chat_connections.theme is
  'Widget colours (accent, surface, headerBg, headerText). Hex only; validated in lib/webchat/theme.ts, never here.';

-- ROLLBACK:
--   alter table public.web_chat_connections drop column if exists theme;
--   (accent_color is untouched and remains the fallback for `accent`.)
