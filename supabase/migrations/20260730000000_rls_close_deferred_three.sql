-- R-060 (completion) — close the 3 tables 20260723110000 deliberately deferred.
--
-- That migration locked 7 of the 10 RLS-disabled tables and left these three,
-- documenting exactly what had to be verified first. Verified 2026-07-30:
--
--   * ALL public views (organizations, org_plan_limits, plan_pricing,
--     org_daily_usage, org_monthly_invoice_preview, …) are owned by `postgres`
--     with security_invoker = false. A non-invoker view executes with its
--     OWNER's privileges, so RLS on a base table does NOT propagate through the
--     view. Locking these tables therefore cannot blank a view-backed read.
--     This was the open question in 20260723110000; it is now answered.
--
--   * org_plan_overrides: all 5 code accesses use the service-role admin client
--     (onboarding/page.tsx, billing/checkout/complete, billing/plan/change,
--     billing/stripe/sync-checkout, webhooks/stripe). Zero anon reads.
--
--   * orgs: read via the ANON/cookie client in several places
--     (getDashboardOverview, DashboardHeader, DashboardTopBar,
--     settings/_actions/workspace + agents) and UPDATEd by the workspace-rename
--     action. All INSERT/UPSERT paths use the admin client (signupAction,
--     ensureDefaultOrg). So orgs needs real SELECT + UPDATE policies, not a bare lock.
--
--   * audit_log_changes: read via the anon client in the audit viewer. It has NO
--     org_id column, so it must be scoped through its parent audit_log.org_id.
--
-- SEVERITY: before this migration `anon` held SELECT *and INSERT* on all three.
-- The sharpest edge was org_plan_overrides: anyone holding the public anon key
-- (which is published in the browser bundle by design) could INSERT a row
-- granting their own org a paid plan — a privilege-escalation path into billing.
--
-- Reversible: ALTER TABLE ... DISABLE ROW LEVEL SECURITY; / DROP POLICY.

-- ===================================================================
-- 1) org_plan_overrides — service-role only. Lock with NO policy.
--    anon/authenticated get zero rows; admin client bypasses RLS;
--    org_plan_limits (non-invoker view) keeps working.
-- ===================================================================
ALTER TABLE public.org_plan_overrides ENABLE ROW LEVEL SECURITY;

-- ===================================================================
-- 2) orgs — tenant-scoped SELECT, owner/admin UPDATE.
--    orgs has no org_id column; its own `id` IS the org id.
--    Matches the auth_user_id pattern used by calls/leads/tickets/appointments.
-- ===================================================================
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orgs_select_own_org ON public.orgs;
CREATE POLICY orgs_select_own_org ON public.orgs
  FOR SELECT USING (
    id IN (
      SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

-- UPDATE mirrors the in-code guard in settings/_actions/workspace.ts, which
-- already rejects non owner/admin with "Only owners and admins can update
-- workspace settings." This makes the database enforce the same rule.
DROP POLICY IF EXISTS orgs_update_owner_admin ON public.orgs;
CREATE POLICY orgs_update_owner_admin ON public.orgs
  FOR UPDATE USING (
    id IN (
      SELECT org_id FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Deliberately NO INSERT or DELETE policy: org creation is admin-client only
-- (signupAction, ensureDefaultOrg) and orgs are never deleted from the app.

-- ===================================================================
-- 3) audit_log_changes — scoped through parent audit_log.org_id.
--    The audit viewer already filters by audit_log_id from an org-scoped
--    audit_log query; this makes that scoping enforced rather than assumed.
-- ===================================================================
ALTER TABLE public.audit_log_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_changes_select_own_org ON public.audit_log_changes;
CREATE POLICY audit_log_changes_select_own_org ON public.audit_log_changes
  FOR SELECT USING (
    audit_log_id IN (
      SELECT al.id FROM public.audit_log al
      WHERE al.org_id IN (
        SELECT org_id FROM public.profiles WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Writes are admin-client only (lib/audit/log.ts), so no INSERT policy.
