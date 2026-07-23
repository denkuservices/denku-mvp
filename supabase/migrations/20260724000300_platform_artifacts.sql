-- Sprint 4.5 — Platform Foundation (4/4): generalize artifacts
-- Source of truth: docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md (§6/§7, P-007)
--
-- WHAT: make the two artifact types (tickets, appointments) channel-agnostic by linking
-- them to a Conversation and a Contact (additive; call_id/lead_id kept for compatibility),
-- and expose a unified read-only `artifacts` view so "every conversation produces an
-- artifact" holds regardless of channel.
--
-- WHY: today tickets/appointments are call_id/lead_id-coupled — i.e. voice-only. An
-- Instagram (or future) conversation must be able to produce the same artifacts. Adding
-- conversation_id/contact_id (not replacing call_id) preserves the voice path exactly.
--
-- The `artifacts` VIEW is a projection, not a table: zero write-path change, zero risk to
-- the never-dead-end guarantee. It gives platform surfaces one list to read.
--
-- ADDITIVE + NON-BREAKING.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id      uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id      uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tickets_conversation_idx      ON public.tickets (conversation_id);
CREATE INDEX IF NOT EXISTS tickets_contact_idx           ON public.tickets (contact_id);
CREATE INDEX IF NOT EXISTS appointments_conversation_idx ON public.appointments (conversation_id);
CREATE INDEX IF NOT EXISTS appointments_contact_idx      ON public.appointments (contact_id);

-- Unified, read-only artifact projection across the artifact types. Common shape:
--   (id, org_id, artifact_type, status, title, body, call_id, conversation_id,
--    contact_id, lead_id, occurs_at, created_at, updated_at)
-- Extend the UNION when a new artifact type is added. security_invoker so the caller's
-- privileges (service-role in app code) apply; RLS on the base tables is respected.
CREATE OR REPLACE VIEW public.artifacts
WITH (security_invoker = true) AS
  SELECT
    t.id,
    t.org_id,
    'ticket'::text        AS artifact_type,
    t.status,
    t.subject             AS title,
    t.description         AS body,
    t.call_id,
    t.conversation_id,
    t.contact_id,
    t.lead_id,
    NULL::timestamptz     AS occurs_at,
    t.created_at,
    t.updated_at
  FROM public.tickets t
  UNION ALL
  SELECT
    a.id,
    a.org_id,
    'appointment'::text   AS artifact_type,
    a.status,
    'Appointment'::text   AS title,
    a.notes               AS body,
    a.call_id,
    a.conversation_id,
    a.contact_id,
    a.lead_id,
    a.start_at            AS occurs_at,
    a.created_at,
    a.updated_at
  FROM public.appointments a;

COMMENT ON VIEW public.artifacts IS
  'Sprint 4.5: unified read-only projection of artifact types (ticket|appointment) across channels. Write via the underlying tables. See AI_EMPLOYEES_PLATFORM_AUDIT.md.';

-- ROLLBACK:
--   DROP VIEW IF EXISTS public.artifacts;
--   ALTER TABLE public.appointments DROP COLUMN IF EXISTS contact_id, DROP COLUMN IF EXISTS conversation_id;
--   ALTER TABLE public.tickets      DROP COLUMN IF EXISTS contact_id, DROP COLUMN IF EXISTS conversation_id;
-- Safe — additive columns are nullable and unread until the platform flag is on; the view is a projection.
