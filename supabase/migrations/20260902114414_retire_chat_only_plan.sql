-- Retire the `chat_only` plan (voice and chat become two products)
--
-- WHAT: the one org sitting on `chat_only` loses its voice plan and keeps its chat add-on.
--
-- WHY: `org_plan_limits` holds exactly one plan per org, so a customer who bought chat and no
-- phone line was parked on `chat_only` — a $0 voice plan carrying zero minutes, zero concurrency
-- and zero numbers. It existed only because `plan_code IS NULL` *meant* preview mode, so a chat
-- customer with no voice plan would have read as unpaid and been gated out of what they paid for.
-- That question now has its own answer (`lib/billing/planState.ts` asks "bought anything?"), so
-- the fiction has no job left: a chat customer is a workspace with no voice plan and a chat tier.
--
-- SAFETY: the application already reads `chat_only` as "no voice plan", so a row that has not been
-- migrated answers exactly as it will afterwards. Nothing depends on this having run — it removes
-- a lie from the data rather than changing behaviour. `billing_org_addons` is untouched, so the
-- workspace keeps the chat capacity it is paying for, and its Stripe subscription is not involved.
--
-- Scoped to the exact value: an org that later buys voice is not affected, because by then its
-- plan_code is a real voice plan.

-- `org_plan_limits` is a VIEW (orgs LEFT JOIN org_plan_overrides), so there is exactly one place
-- to write: the override table the checkout paths already write. Its `plan_code` is NOT NULL, so
-- "no voice plan" is expressed by having no row — which the LEFT JOIN renders as NULL, exactly the
-- target state. The view's `concurrency_limit` CASE has no branch for `chat_only` and already
-- resolved it to NULL, so no capacity changes hands here.
delete from public.org_plan_overrides
 where plan_code = 'chat_only';

-- ROLLBACK:
--   insert into public.org_plan_overrides (org_id, plan_code, updated_at)
--   values ('<org_id>', 'chat_only', now());
-- There is nothing of value to restore: `chat_only` carried zero minutes, zero concurrency and
-- zero numbers, so reinstating it only reinstates the placeholder. If a workspace needs to be
-- identified as chat-only after this, the answer is its chat add-on in `billing_org_addons`,
-- which this migration does not touch.
