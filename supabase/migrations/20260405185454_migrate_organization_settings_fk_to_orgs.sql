-- ===================================================================
-- RECOVERED MIGRATION (R-134) — DO NOT EDIT THE BODY
-- Applied directly to production 2026-04-05 18:54:54 UTC and never
-- committed. Body recovered verbatim from
--   supabase_migrations.schema_migrations.statements on 2026-07-30.
-- Already applied in production: repo-side record only.
--
-- NOTE: this is the migration that makes CLAUDE.md landmine #4 stale.
-- organization_settings.org_id now references orgs(id), NOT
-- organizations_legacy.
-- ===================================================================

-- organization_settings FK'ını organizations_legacy'den orgs'a taşı
ALTER TABLE public.organization_settings
  DROP CONSTRAINT organization_settings_org_id_fkey;

ALTER TABLE public.organization_settings
  ADD CONSTRAINT organization_settings_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
