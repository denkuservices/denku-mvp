-- The database was the SEVENTH place that hardcoded the three voice plans.
--
-- APPLIED TO PRODUCTION 2026-08-31 as version 20260831130338.
--
-- Found by a real purchase, not by reading: a customer completed Stripe checkout for the $299
-- chat tier (session complete, payment paid, subscription active) and the wizard sent them back
-- to the plan step as if nothing had happened.
--
-- `org_plan_overrides.plan_code` carried CHECK (plan_code IN ('starter','growth','scale')). Every
-- CODE path that activates a completed checkout had been taught about `chat_only` — the webhook,
-- the onboarding success page, the sync fallback and checkout/complete — but the TABLE they all
-- write to still refused it. The insert failed with:
--
--   new row for relation "org_plan_overrides" violates check constraint
--   "org_plan_overrides_plan_code_check"
--
-- The handler caught and logged that error rather than throwing, which is the correct behaviour
-- for a page rendering after a successful payment — and is exactly why the failure presented to
-- the customer as "nothing happened" instead of as an error.
--
-- Widening an allowed-value list, never narrowing it: the three voice plans stay exactly as valid.
--
-- This does NOT make `chat_only` reachable as a plan SWITCH. It is filtered out of the plan grid
-- (`isOfferablePlanCode`) and refused by /api/billing/plan/change (`isVoicePlanCode`), because
-- moving an existing workspace onto it would strand the phone number they are paying for. It is
-- only ever the landing plan of a chat-only checkout, which is the one thing it exists for.

ALTER TABLE public.org_plan_overrides
  DROP CONSTRAINT IF EXISTS org_plan_overrides_plan_code_check;

ALTER TABLE public.org_plan_overrides
  ADD CONSTRAINT org_plan_overrides_plan_code_check
  CHECK (plan_code = ANY (ARRAY['starter'::text, 'growth'::text, 'scale'::text, 'chat_only'::text]));
