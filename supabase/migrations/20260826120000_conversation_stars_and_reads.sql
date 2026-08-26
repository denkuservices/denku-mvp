-- Inbox v2 (split-view redesign) — the two pieces of per-conversation state the new Inbox needs
-- and the product did not yet hold: a star, and who has read what.
--
-- WHY THESE TWO EXIST AT ALL: the redesigned Inbox shows a "Starred" facet and an unread counter
-- on every row. Both are affordances a business owner reads as FACTS about their own data, so
-- neither may be faked — an unread badge derived from nothing, or a star that forgets itself on
-- reload, is worse than no badge at all (CLAUDE.md honesty rule). They are therefore stored.
--
-- WHY TWO TABLES AND NOT ONE:
--   * A star is a property of the CONVERSATION, shared by the whole org — "the shop flagged this
--     one", not "I flagged this one". Two people looking at the same inbox must see the same
--     flags, exactly like `conversation_handling`.
--   * A read is a property of the PERSON. The owner having opened a conversation says nothing
--     about whether their colleague has, so the row is keyed by user as well as conversation.
-- Merging them would force one of the two to lie.
--
-- KEY — `conversation_ref` is the Platform Read Model's stable conversation id, exactly as in
-- `conversation_handling` (see that migration's note): `calls.id` for voice, `conversations.id`
-- for chat, with `source` recording which. Deliberately `text`, not a FK: it points into one of
-- two tables, so a FK to either would be wrong half the time. This also means the R-085 read
-- cutover can rewrite refs by `source` without guessing.
--
-- ADDITIVE + INERT UNTIL APPLIED: every reader fails soft (no stars, nothing read → no badges),
-- so the Inbox renders normally before this is applied; only the star control goes read-only and
-- the unread counters stay hidden. Same discipline as `conversation_handling`.
--
-- RLS-LOCKED, SERVICE-ROLE ONLY — RLS enabled with NO policies, consistent with every other
-- platform table: all access goes through the service-role client with an explicit
-- `.eq("org_id", orgId)` filter.

CREATE TABLE IF NOT EXISTS public.conversation_stars (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL,
  -- Read-model conversation id: calls.id (voice) or conversations.id (chat).
  conversation_ref text        NOT NULL,
  -- Which store `conversation_ref` points into. Survives the R-085 read cutover.
  source           text        NOT NULL,
  -- Free text, matching the channel registry (no DB enum — a new channel needs no migration).
  channel          text        NOT NULL,
  -- Who flagged it. Breadcrumb only: the star itself belongs to the org.
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_stars_source_check CHECK (source IN ('calls', 'conversations'))
);

-- A conversation is starred or it is not — the upsert conflict target, and what makes
-- "unstar" a plain DELETE rather than a search.
CREATE UNIQUE INDEX IF NOT EXISTS conversation_stars_org_ref_uidx
  ON public.conversation_stars (org_id, conversation_ref);

-- The "Starred" facet: newest first, one index scan.
CREATE INDEX IF NOT EXISTS conversation_stars_org_created_idx
  ON public.conversation_stars (org_id, created_at DESC);

ALTER TABLE public.conversation_stars ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.conversation_stars IS
  'Inbox v2: org-shared star on a conversation, any channel. Service-role only (RLS enabled, no policies).';

CREATE TABLE IF NOT EXISTS public.conversation_reads (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL,
  -- The person, not the org: unread is a fact about a reader.
  user_id          uuid        NOT NULL,
  conversation_ref text        NOT NULL,
  source           text        NOT NULL,
  -- Everything in the conversation at or before this instant has been seen by this user.
  last_read_at     timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_reads_source_check CHECK (source IN ('calls', 'conversations'))
);

-- One watermark per person per conversation — the upsert conflict target.
CREATE UNIQUE INDEX IF NOT EXISTS conversation_reads_org_user_ref_uidx
  ON public.conversation_reads (org_id, user_id, conversation_ref);

-- "What have I not read?" — the Inbox's per-row badge lookup, fetched as one `IN` query.
CREATE INDEX IF NOT EXISTS conversation_reads_org_user_idx
  ON public.conversation_reads (org_id, user_id, last_read_at DESC);

ALTER TABLE public.conversation_reads ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.conversation_reads IS
  'Inbox v2: per-user read watermark for a conversation. Everything at or before last_read_at has been seen. Service-role only (RLS enabled, no policies).';

COMMENT ON COLUMN public.conversation_reads.last_read_at IS
  'Watermark, not a counter: unread is computed by comparing a conversation''s last activity against this instant, so it stays correct as new messages arrive.';

-- ROLLBACK:
--   DROP TABLE IF EXISTS public.conversation_reads;
--   DROP TABLE IF EXISTS public.conversation_stars;
-- Safe — additive; all readers fail soft to "no stars, nothing read" when the tables are absent.
