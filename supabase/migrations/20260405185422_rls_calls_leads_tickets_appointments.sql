-- ===================================================================
-- RECOVERED MIGRATION (R-134) — DO NOT EDIT THE BODY
-- Applied directly to production 2026-04-05 18:54:22 UTC and never
-- committed (repo had no commits between 2026-01-29 and 2026-07-07).
-- Body below recovered verbatim from
--   supabase_migrations.schema_migrations.statements
-- on 2026-07-30. Already applied in production: repo-side record only.
-- ===================================================================

-- =============================================
-- RLS: calls tablosu
-- =============================================
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calls_select_own_org" ON public.calls
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "calls_insert_own_org" ON public.calls
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

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

CREATE POLICY "leads_select_own_org" ON public.leads
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "leads_insert_own_org" ON public.leads
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "leads_update_own_org" ON public.leads
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

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

CREATE POLICY "tickets_select_own_org" ON public.tickets
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "tickets_insert_own_org" ON public.tickets
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "tickets_update_own_org" ON public.tickets
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

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

CREATE POLICY "appointments_select_own_org" ON public.appointments
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "appointments_insert_own_org" ON public.appointments
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "appointments_update_own_org" ON public.appointments
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "appointments_delete_owner_admin" ON public.appointments
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );
