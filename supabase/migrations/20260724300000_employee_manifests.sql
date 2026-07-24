-- Sprint 8 (S1/S2 · R-107) — Employee manifest revisions + conversation provenance.
--
-- WHY (audit E-001, Critical): employee configuration is **materialized and unversioned**.
-- `agents.effective_system_prompt` is derived then OVERWRITTEN on every edit, and `calls` records
-- only mutable pointers (`vapi_assistant_id`, `persona_key`). So Denku cannot answer "what prompt /
-- knowledge / model handled this conversation last Tuesday?" — and that history, once unrecorded,
-- is **unrecoverable**. Versioned knowledge, multi-persona, provider switching, A/B tests, audit and
-- rollback all depend on this, and none can be retrofitted for past data.
--
-- MODEL — desired state, versioned:
--   employee_manifests = an **immutable revision** of an Employee's desired configuration.
--     * `revision` increments per employee (1, 2, 3…). Rows are never updated in place.
--     * `content_hash` dedupes: saving without a real change does not mint a revision.
--     * `manifest` (jsonb) holds identity + personality + brain/voice binding + policy + REFERENCES
--       to knowledge/tools (never embedded copies — 500 employees must not mean 500 FAQ copies).
--     * Observed state (cost, KPIs, health) is deliberately NOT stored here: it is computed from the
--       data plane. A revision must be immutable; costs change.
--
-- PROVENANCE — which revision handled a conversation:
--   calls.manifest_revision_id / conversations.manifest_revision_id.
--
-- ADDITIVE + NON-BREAKING: `agents` remains the Employee identity row and keeps working untouched;
-- nothing reads manifests to drive behavior yet (this sprint records history — it is DESCRIPTIVE
-- first, AUTHORITATIVE later, when R-108 provider binding lands). RLS-locked, service-role only.

CREATE TABLE IF NOT EXISTS public.employee_manifests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL,
  -- The Employee this revision describes. `agents` stays the identity row (no rename, no breakage).
  employee_id   uuid        NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  revision      integer     NOT NULL,
  -- Immutable desired-state document. Shape versioned inside as `schemaVersion`.
  manifest      jsonb       NOT NULL,
  -- Stable hash of `manifest` — lets writers be idempotent (no revision churn on no-op saves).
  content_hash  text        NOT NULL,
  -- Why this revision exists (e.g. "settings: business context updated"). Audit breadcrumb.
  reason        text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per (employee, revision) — revisions are append-only.
CREATE UNIQUE INDEX IF NOT EXISTS employee_manifests_employee_revision_uidx
  ON public.employee_manifests (employee_id, revision);

-- Fast "current revision for this employee".
CREATE INDEX IF NOT EXISTS employee_manifests_employee_rev_desc_idx
  ON public.employee_manifests (employee_id, revision DESC);

CREATE INDEX IF NOT EXISTS employee_manifests_org_idx
  ON public.employee_manifests (org_id);

-- Idempotency: the same content for the same employee is never stored twice.
CREATE UNIQUE INDEX IF NOT EXISTS employee_manifests_employee_hash_uidx
  ON public.employee_manifests (employee_id, content_hash);

ALTER TABLE public.employee_manifests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.employee_manifests IS
  'Sprint 8 (R-107): immutable, versioned desired-state revisions of an AI Employee. Observed state (cost/KPIs/health) is computed elsewhere by design. See docs/audits/AI_EMPLOYEE_CORE_AUDIT.md.';

-- --- Provenance: which revision handled a given conversation -----------------
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS manifest_revision_id uuid REFERENCES public.employee_manifests(id) ON DELETE SET NULL;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS manifest_revision_id uuid REFERENCES public.employee_manifests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS calls_manifest_revision_idx ON public.calls (manifest_revision_id);
CREATE INDEX IF NOT EXISTS conversations_manifest_revision_idx ON public.conversations (manifest_revision_id);

COMMENT ON COLUMN public.calls.manifest_revision_id IS
  'Sprint 8 (R-107): the employee manifest revision that handled this call — makes past behavior reconstructable.';

-- ROLLBACK:
--   ALTER TABLE public.conversations DROP COLUMN IF EXISTS manifest_revision_id;
--   ALTER TABLE public.calls DROP COLUMN IF EXISTS manifest_revision_id;
--   DROP TABLE IF EXISTS public.employee_manifests;
-- Safe — additive; nothing depends on these until manifests become authoritative (R-108).
