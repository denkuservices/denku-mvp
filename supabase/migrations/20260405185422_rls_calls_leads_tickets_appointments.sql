-- ===================================================================
-- RECOVERED MIGRATION (R-134) — DO NOT EDIT THE BODY
-- Applied directly to production 2026-04-05 18:54:22 UTC and never
-- committed (repo had no commits between 2026-01-29 and 2026-07-07).
-- Body below recovered verbatim from
--   supabase_migrations.schema_migrations.statements
-- on 2026-07-30. Already applied in production: repo-side record only.
-- R-031 ADDENDUM: a `DROP POLICY IF EXISTS` line was inserted before each
-- CREATE POLICY so this migration replays cleanly after the 20241101000000
-- baseline (which already contains these policies, dumped from production).
-- PostgreSQL has no CREATE POLICY IF NOT EXISTS. Every CREATE POLICY statement
-- below is still the VERBATIM production SQL; only the guards were added.
-- ===================================================================

-- =============================================
-- RLS: calls tablosu
-- =============================================
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calls_select_own_org" ON public.calls;
CREATE POLICY "calls_select_own_org" ON public.calls
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "calls_insert_own_org" ON public.calls;
CREATE POLICY "calls_insert_own_org" ON public.calls
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "calls_update_own_org" ON public.calls;
CREATE POLICY "calls_update_own_org" ON public.calls
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

-- =============================================
-- RLS: leads tablosu
-- =============================================
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_select_own_org" ON public.leads;
CREATE POLICY "leads_select_own_org" ON public.leads
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "leads_insert_own_org" ON public.leads;
CREATE POLICY "leads_insert_own_org" ON public.leads
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "leads_update_own_org" ON public.leads;
CREATE POLICY "leads_update_own_org" ON public.leads
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "leads_delete_own_org" ON public.leads;
CREATE POLICY "leads_delete_own_org" ON public.leads
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- =============================================
-- RLS: tickets tablosu
-- =============================================
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tickets_select_own_org" ON public.tickets;
CREATE POLICY "tickets_select_own_org" ON public.tickets
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tickets_insert_own_org" ON public.tickets;
CREATE POLICY "tickets_insert_own_org" ON public.tickets
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tickets_update_own_org" ON public.tickets;
CREATE POLICY "tickets_update_own_org" ON public.tickets
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tickets_delete_owner_admin" ON public.tickets;
CREATE POLICY "tickets_delete_owner_admin" ON public.tickets
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- =============================================
-- RLS: appointments tablosu
-- =============================================
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appointments_select_own_org" ON public.appointments;
CREATE POLICY "appointments_select_own_org" ON public.appointments
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "appointments_insert_own_org" ON public.appointments;
CREATE POLICY "appointments_insert_own_org" ON public.appointments
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "appointments_update_own_org" ON public.appointments;
CREATE POLICY "appointments_update_own_org" ON public.appointments
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "appointments_delete_owner_admin" ON public.appointments;
CREATE POLICY "appointments_delete_owner_admin" ON public.appointments
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );
