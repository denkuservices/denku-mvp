-- Sprint 6 (L4 / R-010) — org_invites: real, reachable member invitations.
--
-- WHY: the member-invite flow was broken — the customer form POSTed to /api/admin/members/
-- invite (Basic-Auth-gated → 401 for customers) and the handler faked success without
-- persisting anything. A paying business adding a teammate hit a dead end. This table backs
-- a real, session-authed invite: create a pending invite, email the invitee a signup link,
-- and attach them to the inviting org on signup (acceptance by email match).
--
-- Members are `profiles` sharing an org_id (no members table). An invite is a pending
-- intent consumed at signup. Additive + RLS-locked (service-role only). No existing table changed.

CREATE TABLE IF NOT EXISTS public.org_invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL,
  email       text        NOT NULL,
  role        text        NOT NULL DEFAULT 'admin',
  token       text        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending',  -- pending | accepted | revoked
  invited_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS org_invites_token_uidx ON public.org_invites (token);

-- One pending invite per (org, email). Case-insensitive on email.
CREATE UNIQUE INDEX IF NOT EXISTS org_invites_org_email_pending_uidx
  ON public.org_invites (org_id, lower(email))
  WHERE status = 'pending';

-- Look up pending invites by the signup email (acceptance path).
CREATE INDEX IF NOT EXISTS org_invites_email_pending_idx
  ON public.org_invites (lower(email))
  WHERE status = 'pending';

ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.org_invites IS
  'Sprint 6 (R-010): pending member invitations. Consumed at signup by email match. Service-role only.';

-- ROLLBACK: DROP TABLE IF EXISTS public.org_invites;
-- Safe — additive, nothing else depends on it; the invite route degrades gracefully if absent.
