-- Redesign Phase 4 (CRM v1) — timestamped, authored notes on a contact.
--
-- WHY: the CRM is the AI workforce's shared memory, and the contact timeline is its spine —
-- conversations, calls and requests in one reverse-chronological stream. A human observation
-- ("prefers mornings", "owns two properties") belongs in that stream too, and cannot be, because
-- `leads.notes` is a single overwritable text blob with no author and no timestamp. Appending to
-- it destroys who wrote what and when, which is exactly the information a timeline exists to
-- preserve.
--
-- `leads.notes` is deliberately LEFT ALONE — it stays the lead's free-form description, is still
-- rendered, and nothing migrates out of it. This table is additive alongside.
--
-- NOT ADDED, deliberately: no `lifecycle_stage` column. `leads.status` is ALREADY the lifecycle
-- (`new | contacted | qualified | unqualified`, enforced by zod in the lead create action), so a
-- second column would mean two sources of truth for one fact. The CRM presents `leads.status` as
-- the lifecycle instead.
--
-- KEY — `contact_ref` is the Contacts read model's id, which today is `leads.id` (the read model
-- sources contacts from `leads`, 1:1, which is what makes /leads/:id → /crm/contacts/:id
-- lossless). It becomes `contacts.id` after the R-081 backfill. Text, not a FK, for the same
-- reason as `conversation_handling.conversation_ref`: the target table changes at cutover.
--
-- ADDITIVE + INERT UNTIL APPLIED: the reader fails soft to an empty list, so the contact timeline
-- renders without notes rather than erroring, and the composer reports a clean failure.
--
-- RLS-LOCKED, SERVICE-ROLE ONLY — consistent with every other platform table.

CREATE TABLE IF NOT EXISTS public.contact_notes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL,
  -- Contacts read-model id: leads.id today, contacts.id after R-081.
  contact_ref text       NOT NULL,
  body       text        NOT NULL,
  -- auth user id of whoever wrote it. Nullable so a note survives a deleted account.
  author_id  uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_notes_body_not_blank CHECK (btrim(body) <> '')
);

-- The timeline query: this contact's notes, newest first.
CREATE INDEX IF NOT EXISTS contact_notes_org_contact_created_idx
  ON public.contact_notes (org_id, contact_ref, created_at DESC);

ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.contact_notes IS
  'Redesign Phase 4: timestamped, authored notes forming part of the contact timeline. Additive alongside leads.notes (which is left alone). Service-role only (RLS enabled, no policies).';

COMMENT ON COLUMN public.contact_notes.contact_ref IS
  'Contacts read-model id — leads.id today, contacts.id after the R-081 backfill. Text, not a FK: the target table changes at cutover.';

-- ROLLBACK:
--   DROP TABLE IF EXISTS public.contact_notes;
-- Safe — additive; the reader fails soft to an empty list when the table is absent.
