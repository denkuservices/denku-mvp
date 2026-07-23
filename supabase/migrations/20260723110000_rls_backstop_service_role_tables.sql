-- R-060 — RLS backstop on service-role-only tables (2026-07-23)
--
-- Supabase's advisor flagged 10 public tables with RLS DISABLED — fully exposed to
-- the anon/authenticated PostgREST roles (anyone with the public anon key could
-- read/write every row). This migration closes the exposure on the subset that is
-- SAFE to lock with zero app impact, by enabling RLS with NO policy: anon/
-- authenticated then get zero rows, while the app's `service_role` client
-- (`lib/supabase/admin.ts`) BYPASSES RLS and is unaffected.
--
-- ⚠️ NOT auto-applied to prod. Live access was read-only; apply this via the normal
-- migration path and verify (checklist below). Enabling RLS is reversible
-- (`ALTER TABLE … DISABLE ROW LEVEL SECURITY;`) if anything regresses.
--
-- SAFE HERE (verified 2026-07-23): each of these 7 tables is (a) accessed in code
-- ONLY via the service-role admin client, and (b) referenced by NO view (pg_depend
-- check) — so locking them cannot break an anon read directly or via a view:
--   webhook_debug       → written only by the Vapi webhook (admin)
--   personas            → read only by the Vapi webhook (admin)
--   persona_tools       → no code .from() usage
--   onboarding_activation_lock → no code .from() usage (RPC-managed lock)
--   billing_stripe_customers   → billing routes (admin)
--   billing_stripe_prices      → billing routes (admin)
--   billing_invoice_runs       → billing routes + close-month (admin)
--
-- DEFERRED (the remaining 3 of the 10 — do NOT lock without tested policies):
--   orgs               → READ via the anon client in the dashboard
--                        (getDashboardOverview, DashboardHeader) and feeds the
--                        org_plan_limits + organizations views. Needs a SELECT
--                        policy scoping authenticated users to their own org, e.g.
--                        USING (id IN (SELECT org_id FROM profiles WHERE
--                        auth_user_id = auth.uid())) — but that subquery + view
--                        interaction must be tested on a branch/staging first
--                        (a wrong policy blanks the dashboard). Tracked in R-060.
--   audit_log_changes  → READ via the anon client in the audit viewer
--                        (settings/workspace/audit). Needs an org-scoped SELECT
--                        policy (or switch that read to the admin client).
--   org_plan_overrides → feeds the org_plan_limits view (view-security model must
--                        be verified: security_invoker vs owner) before locking.
--
-- Follow-on (R-060, still open): the deferred 3 with tested policies, and a
-- `orgScoped(table, orgId)` query helper so an unscoped tenant query is hard to write.

ALTER TABLE public.webhook_debug ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_activation_lock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_stripe_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoice_runs ENABLE ROW LEVEL SECURITY;

-- POST-APPLY VERIFICATION (operator):
--  1. Deploy is unaffected: place a demo/live call → ticket still created (webhook
--     uses service-role); billing summary + close-month still read their tables.
--  2. Re-run Supabase advisor `rls_disabled` → it should now list only orgs,
--     audit_log_changes, org_plan_overrides (the deferred 3).
--  3. With the anon key alone, `select * from webhook_debug` (etc.) returns 0 rows.
