-- Migration: Migrate organizations table to use orgs as source of truth
-- Purpose: Make orgs the canonical org table and create a compatibility VIEW for organizations
-- Strategy: Rename organizations -> organizations_legacy, create VIEW organizations from orgs

-- Step 1: Rename existing organizations table to organizations_legacy
ALTER TABLE IF EXISTS public.organizations RENAME TO organizations_legacy;

-- Step 2: Create VIEW organizations that selects from orgs with default values
-- This VIEW provides backward compatibility for code that still references organizations
-- The VIEW exposes: id, name, plan (default 'mvp'), status (default 'active'), phone_number (default ''), created_at
-- Note: Views inherit RLS policies from the underlying table (orgs)
CREATE OR REPLACE VIEW public.organizations AS
SELECT
  o.id,
  o.name,
  'mvp'::text AS plan,  -- Default plan (will be moved to dedicated model soon)
  'active'::text AS status,  -- Default status (workspace_status in organization_settings is source of truth)
  ''::text AS phone_number,  -- Default empty string (TODO: migrate phone_number mapping if needed)
  o.created_at
FROM public.orgs o;

-- Step 3: Grant necessary permissions (views rely on underlying table policies)
-- The view will use RLS policies from the orgs table
GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.organizations TO service_role;

-- Note: Writes to this VIEW are not supported (views with computed columns are not updatable)
-- Code should be migrated to write directly to orgs table
