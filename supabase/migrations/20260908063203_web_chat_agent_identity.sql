-- Web Chat: give the widget a face and a name of the business's own choosing
--
-- WHAT: two additive, optional columns on `web_chat_connections`.
--
--   `avatar_path`      — storage object key in the private `channel-media` bucket holding the
--                        picture shown at the top of the chat panel. NOT a URL, and deliberately
--                        not an external one either: the widget document is served under a strict
--                        CSP (`img-src 'self' data:`), so a picture on someone else's host would
--                        simply not render, and widening the CSP per connection would put a
--                        customer-entered origin into a security header. The bytes are streamed
--                        back through `/api/webchat/avatar/<site_key>` on our own origin, which
--                        keeps the header untouched and the bucket private.
--
--   `header_subtitle`  — the line under the name ("Customer Support", "E-Ticaret Uzmanı"). It was
--                        a hardcoded English sentence until now, which is the one string in this
--                        product a Turkish shop's visitors were guaranteed to read in English.
--
-- WHY NOT `theme`: that column is colours, validated as strict hex on the way in and rendered
-- into CSS custom properties. A storage key and a sentence are neither, and putting them there
-- would mean `sanitizeTheme` either drops them or stops being a colour validator.
--
-- WHY A PATH AND NOT THE IMAGE: an inline data: URI would be re-sent with the widget document on
-- every single page load of the customer's site, uncached, to every visitor.
--
-- Both are NULL by default and NULL is a complete answer: the widget ships with its own default
-- support-agent avatar (`/webchat/agent-avatar.svg`) and its own subtitle, so an install created
-- before this migration keeps looking finished without anybody touching it.
--
-- Idempotent DDL (safe to re-run).

alter table public.web_chat_connections
  add column if not exists avatar_path text,
  add column if not exists header_subtitle text;

comment on column public.web_chat_connections.avatar_path is
  'Object key in the private channel-media bucket for the widget header avatar. Served via /api/webchat/avatar/<site_key>; never a URL, never public. NULL = the built-in default avatar.';

comment on column public.web_chat_connections.header_subtitle is
  'The line under the name in the widget header. NULL = the widget''s own localised default.';

-- ROLLBACK:
--   alter table public.web_chat_connections drop column if exists avatar_path;
--   alter table public.web_chat_connections drop column if exists header_subtitle;
--   (Uploaded avatars would be orphaned in the bucket, not deleted — remove them separately.)
