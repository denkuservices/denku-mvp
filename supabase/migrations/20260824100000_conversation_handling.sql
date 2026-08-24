-- Redesign Phase 3 (Inbox v1) — who is handling a conversation, on any channel.
--
-- WHY: human takeover is a first-class capability of the Inbox, not an Instagram feature. A
-- business owner needs one answer to "which conversations need a person?" whether the customer
-- called or sent a DM, and the customer's preference not to be handled automatically has to
-- survive whichever channel they use next.
--
-- SUPERSEDES `20260805100000_instagram_thread_states.sql` (parked on
-- `feat/instagram-app-review`, never applied anywhere). That table keyed handling state to an
-- Instagram participant id; this keys it to a conversation, which is the channel-agnostic
-- concept. **When the Instagram branch is un-parked, drop its migration rather than applying
-- both** — one thread is one conversation, so the model carries over directly.
--
-- KEY — `conversation_ref` is the Platform Read Model's stable conversation id, which today is
-- `calls.id` for voice and `conversations.id` for chat (voice has not been cut over to the
-- shared model yet; that is R-085). `source` records which, so the row stays interpretable
-- after the cutover and a backfill can rewrite refs without guessing. Deliberately `text`, not
-- a FK: it points into one of two tables, and a FK to either would be wrong half the time.
--
-- `handling` is a workflow state that is real TODAY — it drives the "Needs a person" filter and
-- the Home alert. It will additionally gate automated replies when those exist.
--
-- `automation_opted_out` is the CUSTOMER's recorded preference: never handle this conversation
-- automatically. Opting out never hides messages — the business still sees everything; it only
-- bars automated processing.
--
-- ADDITIVE + INERT UNTIL APPLIED: every reader fails soft to the default (handling 'ai', not
-- opted out), so the Inbox renders normally before this is applied — only the controls go
-- read-only. Same discipline as `ensureCurrentRevision` in Sprint 8.
--
-- RLS-LOCKED, SERVICE-ROLE ONLY — consistent with every other platform table: RLS enabled with
-- NO policies, so all access goes through the service-role client with an explicit
-- `.eq("org_id", orgId)` filter.

CREATE TABLE IF NOT EXISTS public.conversation_handling (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid        NOT NULL,
  -- Read-model conversation id: calls.id (voice) or conversations.id (chat).
  conversation_ref     text        NOT NULL,
  -- Which store `conversation_ref` points into. Survives the R-085 read cutover.
  source               text        NOT NULL,
  -- Free text, matching the channel registry (no DB enum — a new channel needs no migration).
  channel              text        NOT NULL,
  handling             text        NOT NULL DEFAULT 'ai',
  -- The person who took the conversation over, when handling = 'human'.
  assigned_to          uuid,
  automation_opted_out boolean     NOT NULL DEFAULT false,
  -- Why a human stepped in. Audit breadcrumb, shown in the rail.
  note                 text,
  updated_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_handling_handling_check CHECK (handling IN ('ai', 'human')),
  CONSTRAINT conversation_handling_source_check CHECK (source IN ('calls', 'conversations'))
);

-- One state row per conversation per org — the upsert conflict target.
CREATE UNIQUE INDEX IF NOT EXISTS conversation_handling_org_ref_uidx
  ON public.conversation_handling (org_id, conversation_ref);

-- "Which conversations need a person?" — the Inbox filter and the Home alert.
CREATE INDEX IF NOT EXISTS conversation_handling_org_handling_idx
  ON public.conversation_handling (org_id, handling, updated_at DESC);

ALTER TABLE public.conversation_handling ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.conversation_handling IS
  'Redesign Phase 3: per-conversation handling state (AI vs human takeover) and customer automation opt-out, for any channel. Service-role only (RLS enabled, no policies). Supersedes the parked instagram_thread_states.';

COMMENT ON COLUMN public.conversation_handling.conversation_ref IS
  'Platform Read Model conversation id — calls.id (voice) or conversations.id (chat); see `source`. Text, not a FK: it points into one of two tables.';

COMMENT ON COLUMN public.conversation_handling.automation_opted_out IS
  'Customer preference: never handle this conversation automatically. Must gate any future automated reply. Never hides messages from the business.';

-- ROLLBACK:
--   DROP TABLE IF EXISTS public.conversation_handling;
-- Safe — additive; all readers fail soft to defaults when the table is absent.
