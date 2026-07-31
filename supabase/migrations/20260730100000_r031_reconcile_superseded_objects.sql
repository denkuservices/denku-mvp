-- R-031 — reconcile objects that historical migrations create but production no longer has.
--
-- Replaying the full migration history onto a fresh database produced a schema that
-- was a strict SUPERSET of production: 4 objects existed in the replay that do not
-- exist in the live database. They were created by early migrations and later
-- dropped or replaced directly in production during the 2026-01-29 → 2026-07-07
-- commit gap, so no migration records their removal.
--
-- This migration records it. Effect:
--   * on a FRESH database  → drops the 4 stragglers, making the replay match production exactly
--   * on PRODUCTION        → pure no-op, every statement is IF EXISTS and none of them exist
--
-- Verified 2026-07-30: with this file, a fresh replay of all 42 migrations yields
-- tables=40 views=10 funcs=11 indexes=166 policies=53 rls_on=40 — identical to production.

-- 1) agents: superseded policy.
-- 20241204000000 created "Users can view agents in their organization". Production
-- instead carries `agents_select_own_org` (same intent, the auth_user_id-scoped naming
-- convention used by calls/leads/tickets/appointments). Keeping both would leave TWO
-- permissive SELECT policies on agents, and PostgreSQL ORs permissive policies together
-- — so the replay would be MORE permissive than production. That is why this one matters.
DROP POLICY IF EXISTS "Users can view agents in their organization" ON public.agents;

-- 2) webhook_debug: superseded policies.
-- 20250125020000 created two service-role policies. Production has RLS enabled on
-- webhook_debug with NO policies (locked by 20260723110000, the R-060 backstop) because
-- the service-role client bypasses RLS entirely and therefore needs no policy.
DROP POLICY IF EXISTS "Service role can insert webhook_debug" ON public.webhook_debug;
DROP POLICY IF EXISTS "Service role can select webhook_debug" ON public.webhook_debug;

-- 3) profiles: superseded index.
-- 20250124000000 created profiles_id_unique. Production does not have it: `id` is
-- already the primary key (profiles_pkey), so the extra unique index is redundant.
DROP INDEX IF EXISTS public.profiles_id_unique;
