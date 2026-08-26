-- The AI employee could never be configured. This is the missing policy.
--
-- SYMPTOM (found 2026-08-27, during the D0 pre-flight): filling in the Knowledge tab and pressing
-- "Save changes" returned *"Database update failed: Cannot coerce the result to a single JSON
-- object"* and wrote nothing. Every agent in production had `business_context = null` — not
-- because nobody tried, but because nobody could.
--
-- CAUSE: `public.agents` has RLS enabled with exactly one policy, `agents_select_own_org`
-- (`20241204000000_agents_rls_select_policy`) — **SELECT only**. `updateAgentConfiguration` writes
-- through the request-scoped cookie client, as a user-triggered tenant write should, so the UPDATE
-- matched zero rows; `.single()` then raised PGRST116, which the UI printed verbatim. Reads worked,
-- inserts worked (onboarding and phone-line purchase both insert with the service-role client), and
-- only the one path a customer touches by hand was blocked.
--
-- WHY A POLICY AND NOT A SERVICE-ROLE WRITE: CLAUDE.md's split is deliberate — service-role for
-- privileged/background writes, the cookie client for request-scoped user actions. Handing this
-- path the service-role key would "fix" it by removing the enforcement layer from the one write a
-- customer performs on their own data. RLS is load-bearing here (R-134); this restores it.
--
-- The predicate mirrors the SELECT policy, and additionally accepts `profiles.id = auth.uid()`.
-- That second key is not belt-and-braces: this project's history wrote profiles under both `id`
-- and `auth_user_id` (CLAUDE.md landmine #4, and `lib/platform/serverOrg.ts` tries both), so a
-- policy that knows only one spelling silently locks out whichever accounts used the other. Both
-- clauses resolve to the caller's OWN profile rows, so nothing is widened.
--
-- Scope: UPDATE only. INSERT and DELETE stay service-role — no user-facing path performs them, and
-- a policy for a path that does not exist is surface without a purpose.

DROP POLICY IF EXISTS agents_update_own_org ON public.agents;

CREATE POLICY agents_update_own_org
  ON public.agents
  FOR UPDATE
  USING (
    org_id IN (
      SELECT profiles.org_id FROM public.profiles
      WHERE profiles.auth_user_id = auth.uid() OR profiles.id = auth.uid()
    )
  )
  WITH CHECK (
    -- The row must still belong to the caller's org afterwards: without this, an UPDATE could
    -- move an agent into another tenant.
    org_id IN (
      SELECT profiles.org_id FROM public.profiles
      WHERE profiles.auth_user_id = auth.uid() OR profiles.id = auth.uid()
    )
  );

COMMENT ON POLICY agents_update_own_org ON public.agents IS
  'Lets a signed-in member edit their own org''s AI employees (name, language, first message, business context). Added 2026-08-27: agents had a SELECT policy only, so every save through the cookie client matched zero rows and failed with PGRST116.';

-- ROLLBACK:
--   DROP POLICY IF EXISTS agents_update_own_org ON public.agents;
-- Safe — reverts to the previous state, in which agent configuration cannot be saved.
