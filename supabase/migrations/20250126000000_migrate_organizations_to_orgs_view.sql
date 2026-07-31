-- Migration: Migrate organizations table to use orgs as source of truth
-- Purpose: Make orgs the canonical org table and create a compatibility VIEW for organizations
-- Strategy: Rename organizations -> organizations_legacy, create VIEW organizations from orgs

-- Step 1: Rename existing organizations table to organizations_legacy
--
-- !! NEUTRALISED 2026-07-30 (R-134) — this step became DESTRUCTIVE after the fact.
--
-- Original statement (unguarded):
--     ALTER TABLE IF EXISTS public.organizations RENAME TO organizations_legacy;
--
-- Why it is now dangerous: as of migration 20260405185521, public.organizations
-- is a VIEW (not a table) and public.organizations_legacy has been DROPPED.
-- In PostgreSQL, ALTER TABLE ... RENAME also renames VIEWS, so re-running the
-- original on a current database would rename the live `organizations` view out
-- from under the application and then resurrect a phantom `organizations_legacy`
-- VIEW. That would change the failure mode of the ~30 code sites still writing
-- to organizations_legacy from a clean "relation does not exist" into a
-- confusing view-write error (see R-133).
--
-- The guard below preserves the ORIGINAL behaviour on a fresh rebuild (where
-- `organizations` is still a real table, relkind='r') and is a no-op against any
-- database that has already advanced past 20260405185521. Production is
-- unaffected either way: this migration is already applied there.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'organizations'
      AND c.relkind = 'r'   -- ordinary table only; never a view
  ) THEN
    EXECUTE 'ALTER TABLE public.organizations RENAME TO organizations_legacy';
  END IF;
END $$;

-- Step 2: Create VIEW organizations that selects from orgs with default values
-- This VIEW provides backward compatibility for code that still references organizations
-- The VIEW exposes: id, name, plan (default 'mvp'), status (default 'active'), phone_number (default ''), created_at
-- Note: Views inherit RLS policies from the underlying table (orgs)
-- R-031 (2026-07-30): the view definition below was REPLACED with the definition
-- actually present in production. The original January-2025 version selected only
-- 6 columns and hard-coded phone_number to ''; production's view exposes 9 columns
-- including display_name, the real phone_number_e164 mapping, vapi_assistant_id and
-- vapi_phone_number_id. Replaying the stale version would have DROPPED columns from
-- the live view (PostgreSQL rejects that outright: "cannot drop columns from view"),
-- so the file now carries production truth. Historical shape remains in git history.
CREATE OR REPLACE VIEW "public"."organizations" AS
 SELECT "id",
    "name",
    COALESCE(NULLIF("name", ''::"text"), 'Workspace'::"text") AS "display_name",
    'mvp'::"text" AS "plan",
    'active'::"text" AS "status",
    "phone_number_e164" AS "phone_number",
    "created_at",
    "vapi_assistant_id",
    "vapi_phone_number_id"
   FROM "public"."orgs" "o";

-- Step 3: Grant necessary permissions (views rely on underlying table policies)
-- The view will use RLS policies from the orgs table
GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.organizations TO service_role;

-- Note: Writes to this VIEW are not supported (views with computed columns are not updatable)
-- Code should be migrated to write directly to orgs table
