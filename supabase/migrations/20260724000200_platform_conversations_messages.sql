-- Sprint 4.5 — Platform Foundation (3/4): adopt conversations/messages as canonical
-- Source of truth: docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md (§6/§7, P-004 — Critical)
--
-- WHAT: enrich the existing (but minimal, empty, unused) `conversations`/`messages`
-- tables into the canonical channel-agnostic interaction layer for ALL channels, and add
-- back-links so the channel-native records (calls, instagram_webhook_events) point at the
-- conversation they belong to.
--
-- WHY: this is THE platform backbone. Voice conversations live in `calls`, Instagram in
-- raw `instagram_webhook_events` — two divergent stores. After this, a call and an IG
-- thread are both a `conversation` with `messages`; artifacts/intent run once, per channel.
--
-- These two tables were verified EMPTY in prod (0 rows) at migration time, so enriching
-- them carries no data-migration risk. All columns are additive/nullable.
--
-- conversations gets:
--   contact_id        → contacts.id      (who the conversation is with)
--   external_thread_id text              channel-native thread key (vapi_call_id, IG thread)
--   status            text default 'open'(open | closed)
--   last_message_at   timestamptz        newest message time (denormalized for inbox sort)
--   meta              jsonb default '{}' channel-specific extras
-- messages gets:
--   external_message_id text             channel-native message id → idempotent append
--   direction           text            inbound | outbound
--   meta                jsonb default '{}'
--
-- Back-links (additive, nullable):
--   calls.conversation_id                     voice call → its conversation
--   instagram_webhook_events.conversation_id  IG event  → its conversation (traceability)
--   instagram_webhook_events.message_id       IG event  → the message it produced
--
-- ADDITIVE + NON-BREAKING. RLS: conversations/messages currently have RLS DISABLED (they
-- predate R-060 and are unused); we ENABLE it here (service-role only) — consistent with
-- the platform tables and safe because no anon path reads them (the one route that tried
-- targeted a non-existent table).

-- conversations enrichments
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS contact_id         uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_thread_id text,
  ADD COLUMN IF NOT EXISTS status             text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS last_message_at    timestamptz,
  ADD COLUMN IF NOT EXISTS meta               jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Idempotent conversation resolution per channel thread (partial: only when thread key set).
CREATE UNIQUE INDEX IF NOT EXISTS conversations_org_channel_thread_uidx
  ON public.conversations (org_id, channel, external_thread_id)
  WHERE external_thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversations_org_lastmsg_idx
  ON public.conversations (org_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS conversations_contact_idx
  ON public.conversations (contact_id);

-- messages enrichments
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS external_message_id text,
  ADD COLUMN IF NOT EXISTS direction           text,
  ADD COLUMN IF NOT EXISTS meta                 jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Idempotent message append: never double-insert the same channel-native message.
CREATE UNIQUE INDEX IF NOT EXISTS messages_convo_extid_uidx
  ON public.messages (conversation_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS messages_convo_created_idx
  ON public.messages (conversation_id, created_at);

-- Channel-native back-links
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS calls_conversation_idx ON public.calls (conversation_id);

ALTER TABLE public.instagram_webhook_events
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_id      uuid REFERENCES public.messages(id) ON DELETE SET NULL;

-- Lock the canonical layer (service-role only).
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.conversations IS
  'Sprint 4.5 platform backbone: canonical channel-agnostic interaction. channel=voice|instagram|web|… external_thread_id = channel-native thread. See AI_EMPLOYEES_PLATFORM_AUDIT.md.';
COMMENT ON COLUMN public.messages.external_message_id IS
  'Channel-native message id; (conversation_id, external_message_id) is UNIQUE for idempotent append.';

-- ROLLBACK:
--   ALTER TABLE public.instagram_webhook_events DROP COLUMN IF EXISTS message_id, DROP COLUMN IF EXISTS conversation_id;
--   ALTER TABLE public.calls DROP COLUMN IF EXISTS conversation_id;
--   DROP INDEX IF EXISTS public.messages_convo_extid_uidx, public.messages_convo_created_idx;
--   ALTER TABLE public.messages DROP COLUMN IF EXISTS meta, DROP COLUMN IF EXISTS direction, DROP COLUMN IF EXISTS external_message_id;
--   DROP INDEX IF EXISTS public.conversations_org_channel_thread_uidx, public.conversations_org_lastmsg_idx, public.conversations_contact_idx;
--   ALTER TABLE public.conversations DROP COLUMN IF EXISTS meta, DROP COLUMN IF EXISTS last_message_at, DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS external_thread_id, DROP COLUMN IF EXISTS contact_id;
--   (Optionally ALTER TABLE … DISABLE ROW LEVEL SECURITY; to restore prior RLS state.)
-- Safe — tables were empty and unread at apply time.
