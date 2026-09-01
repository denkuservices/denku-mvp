-- Perception (Sprint 8): somewhere to keep what customers send on the chat channels.
--
-- WHY A BUCKET AT ALL. Every link a chat channel hands us dies. A Telegram file URL is valid for
-- about an hour and carries the bot token in its path, so it can never be shown to a human;
-- Instagram's CDN links expire; a Resend attachment lives behind an API key. Storing the URL would
-- mean a business owner who opens the Inbox tomorrow reads "a photo of a cracked screen" and has
-- no way to ever see the crack.
--
-- WHY PRIVATE. These are customer photos and voice notes. A public bucket makes every one of them
-- a guessable URL on the open internet. Reads go through `createSignedUrl` from server code that
-- has already checked the org (`lib/platform/media/store.ts#signedMediaUrl`), and the object key
-- starts with the org id precisely so that check is possible.
--
-- NO RLS POLICIES ON PURPOSE. A bucket with no policies is reachable by the service-role client
-- and by nobody else — which is exactly the access model here: writes come from webhooks, reads
-- come from signed URLs minted server-side. Adding an `authenticated` policy would widen it for no
-- caller that exists.
--
-- Applied to prod 2026-09-01 via Supabase MCP, recorded as version 20260901110952 (this filename
-- is aligned to it deliberately — see landmine #10).
--
-- Idempotent. ROLLBACK: delete from storage.buckets where id = 'channel-media';
--   (objects must be removed first — do not run that on a workspace with real conversations.)

insert into storage.buckets (id, name, public, file_size_limit)
values (
  'channel-media',
  'channel-media',
  false,
  -- 20 MB: the largest thing perception will accept (an audio note), and a ceiling the storage
  -- layer enforces independently of the application in case a future caller forgets to.
  20971520
)
on conflict (id) do nothing;
