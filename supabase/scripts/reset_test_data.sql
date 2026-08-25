-- =====================================================================================
-- DENKU — PRODUCTION TEST-DATA RESET
-- =====================================================================================
-- Purpose: wipe every tenant row from production before the first real customer,
--          while preserving seed/catalog data the product needs to function.
--
-- ⚠️  THIS IS DESTRUCTIVE AND IRREVERSIBLE. Take a Supabase backup first
--     (Dashboard → Database → Backups → "Create backup", wait for it to complete).
--
-- ⚠️  NOT A MIGRATION. Do not put this in supabase/migrations/ — it must never run
--     automatically in CI or on deploy. Run it by hand in the SQL editor, once.
--
-- Context (verified 2026-08-25 against project kebqwsdguxxjsijahrox):
--   39 orgs · 25 profiles · 60 auth users · 182 calls · 93 tickets · 0 appointments
--   6 phone_lines · 12 agents with a Vapi assistant · 18 stripe customers · 3,248 webhook_debug
--   Zero real customers: 16 profiles on a disposable-email domain, 14 orgs with no user at all,
--   one workspace holding 181 of the 182 calls (founder testing). Last call: 2026-02-20.
--
-- ❗ BEFORE RUNNING — external resources are NOT cleaned up by this script:
--   1. VAPI: 6 phone numbers are provisioned and billing monthly, and 12 assistants exist.
--      Deleting the DB rows does NOT release them. Release/delete them in the Vapi dashboard
--      (or abandon the whole account if you are switching — see docs/GO_LIVE_FIRST_CUSTOMER.md).
--   2. STRIPE: 18 customers exist. Deleting the DB rows does NOT cancel subscriptions.
--      Confirm they are TEST-mode; cancel any live-mode subscription in the Stripe dashboard.
--   3. SUPABASE AUTH: 60 auth users. Step 5 removes them; read its warning first.
-- =====================================================================================


-- =====================================================================================
-- STEP 1 — BEFORE snapshot. Run alone, keep the output.
-- =====================================================================================
SELECT 'orgs' t, count(*) n FROM orgs
UNION ALL SELECT 'profiles',            count(*) FROM profiles
UNION ALL SELECT 'auth.users',          count(*) FROM auth.users
UNION ALL SELECT 'agents',              count(*) FROM agents
UNION ALL SELECT 'calls',               count(*) FROM calls
UNION ALL SELECT 'tickets',             count(*) FROM tickets
UNION ALL SELECT 'appointments',        count(*) FROM appointments
UNION ALL SELECT 'leads',               count(*) FROM leads
UNION ALL SELECT 'phone_lines',         count(*) FROM phone_lines
UNION ALL SELECT 'webhook_debug',       count(*) FROM webhook_debug
UNION ALL SELECT 'contact_requests',    count(*) FROM contact_requests
-- seed tables — these must be UNCHANGED at the end
UNION ALL SELECT 'SEED billing_plan_catalog',  count(*) FROM billing_plan_catalog
UNION ALL SELECT 'SEED billing_addon_catalog', count(*) FROM billing_addon_catalog
UNION ALL SELECT 'SEED billing_stripe_prices', count(*) FROM billing_stripe_prices
UNION ALL SELECT 'SEED personas',              count(*) FROM personas
UNION ALL SELECT 'SEED persona_tools',         count(*) FROM persona_tools
ORDER BY 1;


-- =====================================================================================
-- STEP 2 — Inspect the 2 marketing contact-form submissions before destroying them.
--          These are the ONLY rows in this database that might be a real human who
--          asked to be contacted. Read them; export them if they matter.
-- =====================================================================================
SELECT * FROM contact_requests ORDER BY created_at;


-- =====================================================================================
-- STEP 3 — THE WIPE (tenant data). Runs as one transaction: all or nothing.
--
-- TRUNCATE ... CASCADE is used deliberately: it resets identity sequences and cannot
-- leave a half-deleted graph behind. Every table below is tenant data. The seed tables
-- (billing_plan_catalog / billing_addon_catalog / billing_stripe_prices / personas /
-- persona_tools) are NOT listed and hold no FK to these, so CASCADE cannot reach them.
-- =====================================================================================
BEGIN;

TRUNCATE TABLE
  -- conversation / artifact graph
  ticket_activity,
  ticket_comments,
  tickets,
  appointments,
  leads,
  messages,
  conversations,
  conversation_handling,
  contact_notes,
  contact_identities,
  contacts,
  calls,
  -- employees & channels
  employee_manifests,
  employee_channels,
  agents,
  phone_lines,
  instagram_webhook_events,
  instagram_connections,
  instagram_data_deletion_requests,
  -- billing (org-scoped only; catalogs preserved)
  billing_org_addons,
  billing_overage_state,
  billing_invoice_runs,
  billing_usage_alerts,
  billing_anomaly_events,
  billing_stripe_customers,
  org_plan_overrides,
  org_plan_limits,
  -- operational
  call_concurrency_leases,
  onboarding_activation_lock,
  audit_log_changes,
  audit_log,
  webhook_debug,
  contact_requests,
  org_invites,
  -- tenancy roots (last)
  organization_settings,
  profiles,
  orgs
RESTART IDENTITY CASCADE;

COMMIT;


-- =====================================================================================
-- STEP 4 — Verify the wipe AND that the seed data survived.
--          Expect: every tenant row = 0, every SEED row unchanged from Step 1
--          (plan_catalog 3 · addon_catalog 2 · stripe_prices 3 · personas 18 · persona_tools 117).
-- =====================================================================================
SELECT 'orgs' t, count(*) n FROM orgs
UNION ALL SELECT 'profiles',         count(*) FROM profiles
UNION ALL SELECT 'agents',           count(*) FROM agents
UNION ALL SELECT 'calls',            count(*) FROM calls
UNION ALL SELECT 'tickets',          count(*) FROM tickets
UNION ALL SELECT 'phone_lines',      count(*) FROM phone_lines
UNION ALL SELECT 'webhook_debug',    count(*) FROM webhook_debug
UNION ALL SELECT 'SEED billing_plan_catalog  (expect 3)',  count(*) FROM billing_plan_catalog
UNION ALL SELECT 'SEED billing_addon_catalog (expect 2)',  count(*) FROM billing_addon_catalog
UNION ALL SELECT 'SEED billing_stripe_prices (expect 3)',  count(*) FROM billing_stripe_prices
UNION ALL SELECT 'SEED personas              (expect 18)', count(*) FROM personas
UNION ALL SELECT 'SEED persona_tools         (expect 117)',count(*) FROM persona_tools
ORDER BY 1;


-- =====================================================================================
-- STEP 5 — Auth users (60). Run ONLY after Step 4 looks right.
--
-- ⚠️  This deletes every login, including YOUR OWN. You will need to sign up again
--     (which is good: it exercises the real signup → onboarding path you are about to
--     sell). Supabase cascades auth.identities / auth.sessions / auth.refresh_tokens.
--
--     Preferred alternative: Dashboard → Authentication → Users → select all → Delete.
--     Same result, and it goes through Supabase's own admin path.
--
--     To keep your own account instead, add a WHERE clause:
--         DELETE FROM auth.users WHERE email <> 'you@example.com';
--     — but note a kept auth user will have NO profile/org after Step 3, so the app will
--     treat it as a fresh signup anyway. Deleting everything is cleaner.
-- =====================================================================================
-- DELETE FROM auth.users;          -- uncomment to run
-- SELECT count(*) AS auth_users_remaining FROM auth.users;


-- =====================================================================================
-- STEP 6 — Post-reset sanity (run after the app is redeployed)
-- =====================================================================================
--  [ ] Vapi dashboard: 0 phone numbers, 0 assistants you do not intend to keep
--  [ ] Stripe dashboard: no active subscription for a deleted customer
--  [ ] Sign up fresh → onboarding completes → agent activates → number connects
--  [ ] Place a real call → it becomes a ticket OR appointment (the never-dead-end guarantee)
--  [ ] /admin/readiness is green
-- =====================================================================================
