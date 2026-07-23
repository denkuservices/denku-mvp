-- Sprint 4.5 — Platform Foundation (2/4): contacts + contact_identities
-- Source of truth: docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md (§6, P-004)
--
-- WHAT: a channel-agnostic Contact (the person a business talks to) with per-channel
-- identities. Today `leads` is a proto-contact keyed loosely by phone/email and created
-- per call; it cannot represent "the same person reached us on voice AND Instagram".
--
-- WHY: a Conversation belongs to a Contact regardless of channel. Contacts unify a
-- caller's phone identity, an IG handle, a future WhatsApp number, an email — so history
-- and artifacts attach to a person, not a channel.
--
-- MODEL:
--   contacts             one row per person per org (display_name, primary_phone/email, meta)
--   contact_identities   (contact_id, channel, external_id) — the channel-native handle
--                        e.g. ('voice','+13215551234'), ('instagram','<ig_user_id>')
--                        UNIQUE(org_id, channel, external_id) → idempotent resolution.
--
-- BRIDGE (additive): `leads.contact_id` links an existing lead to its Contact. Nullable;
-- backfilled later by a reviewed data step, NEVER blindly here. `leads` is untouched and
-- keeps working; Contacts is the forward model, leads the compatibility surface.
--
-- ADDITIVE + NON-BREAKING. RLS-locked (service-role only).

CREATE TABLE IF NOT EXISTS public.contacts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL,
  display_name  text,
  primary_phone text,
  primary_email text,
  meta          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contacts_org_idx ON public.contacts (org_id);
CREATE INDEX IF NOT EXISTS contacts_org_phone_idx ON public.contacts (org_id, primary_phone);
CREATE INDEX IF NOT EXISTS contacts_org_email_idx ON public.contacts (org_id, primary_email);

CREATE TABLE IF NOT EXISTS public.contact_identities (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL,
  contact_id  uuid        NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel     text        NOT NULL,
  external_id text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Idempotent identity resolution: one (channel, external_id) per org maps to one contact.
CREATE UNIQUE INDEX IF NOT EXISTS contact_identities_org_channel_ext_uidx
  ON public.contact_identities (org_id, channel, external_id);

CREATE INDEX IF NOT EXISTS contact_identities_contact_idx
  ON public.contact_identities (contact_id);

-- Bridge existing leads → contacts (additive, nullable, no backfill here).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_identities ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.contacts IS
  'Sprint 4.5 platform model: channel-agnostic person. Generalizes leads. See AI_EMPLOYEES_PLATFORM_AUDIT.md.';
COMMENT ON TABLE public.contact_identities IS
  'Sprint 4.5: per-channel handle for a Contact. UNIQUE(org_id,channel,external_id) for idempotent resolution.';

-- ROLLBACK:
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS contact_id;
--   DROP TABLE IF EXISTS public.contact_identities;
--   DROP TABLE IF EXISTS public.contacts;
-- Safe — additive; leads.contact_id is nullable and unread until the platform flag is on.
