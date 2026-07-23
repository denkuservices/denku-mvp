-- R-008 — Ticket/appointment notifications (Sprint 2, 2026-07-23)
--
-- Adds the idempotency marker for per-artifact "owner has been emailed" state, plus
-- a per-org opt-out flag. All additive + IF NOT EXISTS so it is safe to re-run and
-- safe to apply to prod out-of-band (same operational pattern as the Instagram
-- migrations). No backfill: existing rows get NULL notified_at, which is correct —
-- we only notify on NEW artifacts going forward (a one-time notify of the entire
-- history backlog would be spammy and is explicitly NOT wanted).
--
-- notified_at semantics: NULL = not yet emailed. Set to now() by a conditional
-- UPDATE (…WHERE notified_at IS NULL) that atomically CLAIMS the send, mirroring the
-- welcome-email idempotency lock (organization_settings.welcome_email_sent_at).

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

-- Per-org opt-out for artifact notifications. Defaults to true (owners want to know
-- when their AI captured a lead). A settings-UI toggle is a fast-follow; the column
-- exists now so the notification path can honor it from day one.
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS notify_on_artifacts boolean NOT NULL DEFAULT true;
