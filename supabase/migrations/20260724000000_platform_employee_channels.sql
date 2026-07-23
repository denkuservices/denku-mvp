-- Sprint 4.5 — Platform Foundation (1/4): employee_channels
-- Source of truth: docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md (P-004/P-006)
--
-- WHAT: introduce the channel-agnostic mapping "an AI Employee is connected to a
-- Channel". The Employee already exists as `agents` (its brain: prompt, persona,
-- voice, business_context). This migration does NOT rename `agents` (that would be
-- breaking); it ADDS a join table so one Employee can own N channels.
--
-- WHY (audit): today the only "channel" is implicit — an agent bound to a Vapi phone
-- number (phone_lines) — and Instagram is a separate silo. `employee_channels` is the
-- single extensibility seam: a new channel (WhatsApp/Email/SMS/WebChat, later) becomes
-- a row here + a connection record + an adapter, with NO schema change to the core.
--
-- MODEL:
--   employee_id   → agents.id            (the Employee; FK, cascade)
--   channel       text                   (voice | instagram | web | whatsapp | email …)
--                                         NOT a DB enum on purpose — new channels must
--                                         NOT require a migration; the allowed set is
--                                         validated in code (lib/platform/channels.ts).
--   connection_ref uuid                  POLYMORPHIC pointer to the channel-native
--                                         connection row (phone_lines.id for voice,
--                                         instagram_connections.id for instagram). No FK
--                                         because the target table differs per channel.
--   external_id   text                   channel-native identity (phone_number_e164,
--                                         ig_user_id) — convenience/denormalized.
--   status        text  default 'active' (active | paused | disconnected)
--   config        jsonb default '{}'     per-channel settings (caps, greeting overrides…)
--
-- ADDITIVE + NON-BREAKING: nothing reads this yet; voice/IG keep working unchanged.
-- Backfill of existing bindings is done by a later, separately-reviewed data step
-- (documented in docs/SPRINT_4.5_MIGRATION.md), never blindly here.

CREATE TABLE IF NOT EXISTS public.employee_channels (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL,
  employee_id   uuid        NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  channel       text        NOT NULL,
  connection_ref uuid,
  external_id   text,
  status        text        NOT NULL DEFAULT 'active',
  config        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One binding per (org, channel, connection). connection_ref may be NULL (e.g. a
-- channel configured but not yet connected) — NULLs are distinct in a UNIQUE index,
-- so multiple "unconnected" rows are allowed; the app dedups those at write time.
CREATE UNIQUE INDEX IF NOT EXISTS employee_channels_org_channel_conn_uidx
  ON public.employee_channels (org_id, channel, connection_ref);

CREATE INDEX IF NOT EXISTS employee_channels_employee_idx
  ON public.employee_channels (employee_id);

CREATE INDEX IF NOT EXISTS employee_channels_org_channel_idx
  ON public.employee_channels (org_id, channel);

-- RLS-locked from day one (R-060 discipline): service-role client bypasses RLS;
-- anon/authenticated get zero rows. No policy = no direct client access.
ALTER TABLE public.employee_channels ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.employee_channels IS
  'Sprint 4.5 platform model: maps an AI Employee (agents.id) to a Channel. connection_ref is a polymorphic pointer (phone_lines.id | instagram_connections.id). See docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md.';

-- ROLLBACK: DROP TABLE IF EXISTS public.employee_channels;
-- Safe to drop — additive, nothing depends on it until the platform flag is enabled.
