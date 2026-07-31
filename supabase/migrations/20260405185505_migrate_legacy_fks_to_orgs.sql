-- ===================================================================
-- RECOVERED MIGRATION (R-134) — DO NOT EDIT THE BODY
-- Applied directly to production 2026-04-05 18:55:05 UTC and never
-- committed. Body recovered verbatim from
--   supabase_migrations.schema_migrations.statements on 2026-07-30.
-- Already applied in production: repo-side record only.
-- ===================================================================

-- calls → orgs
ALTER TABLE public.calls DROP CONSTRAINT calls_org_id_fkey;
ALTER TABLE public.calls
  ADD CONSTRAINT calls_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;

-- leads → orgs
ALTER TABLE public.leads DROP CONSTRAINT leads_org_id_fkey;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;

-- tickets → orgs
ALTER TABLE public.tickets DROP CONSTRAINT tickets_org_id_fkey;
ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;

-- appointments → orgs
ALTER TABLE public.appointments DROP CONSTRAINT appointments_org_id_fkey;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
