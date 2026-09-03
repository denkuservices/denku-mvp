-- Onboarding product intent: which product the customer chose, before anything is offered to them.
--
-- The wizard used to ask about a PHONE LINE first ("what area code?"), and then show one plan
-- screen carrying voice plans, chat tiers and a "continue without plan" button all at once. The
-- three big cards on that screen are voice plans, so "the plans" meant phone service to anyone
-- reading it — and a customer who had just said they wanted chat bought one, and was rented a US
-- number every month for it. See R-153.
--
-- The fix is to ask the question in the right order: what do you want, THEN what size, THEN (for
-- voice only) which number. That first answer has to survive a page refresh and be readable by
-- activation, which is what this column is for.
--
-- Three values, one column:
--   'voice' — an AI that answers the phone. Voice plans, then a new US number or their own (BYON).
--   'chat'  — an AI that answers messages. Chat tiers only; no phone plan is ever shown.
--   'free'  — look around first. Nothing is bought, nothing is provisioned, no AI answers yet.
-- NULL means the customer has not reached the step, or reached it before this column existed.
-- Everything that reads it MUST treat NULL as "not asked" and fall back to its old behaviour —
-- never as one of the three values — so a workspace mid-flow is unaffected.
--
-- Related but NOT the same question: `orgs.phone_provisioning_mode` ('new' | 'byo' | 'none') is
-- asked only inside the voice branch and answers *which kind of line*. A 'chat' or 'free' intent
-- implies 'none' there, and the wizard writes both.
--
-- Additive and idempotent. ROLLBACK:
--   alter table public.orgs drop constraint if exists check_onboarding_product_intent;
--   alter table public.orgs drop column if exists onboarding_product_intent;

alter table public.orgs
  add column if not exists onboarding_product_intent text;

alter table public.orgs
  drop constraint if exists check_onboarding_product_intent;

-- Enforced at the database, like check_phone_provisioning_mode and check_workspace_status: a value
-- outside this set would send a customer down a branch that sells them the wrong product.
alter table public.orgs
  add constraint check_onboarding_product_intent
  check (onboarding_product_intent is null or onboarding_product_intent in ('voice', 'chat', 'free'));

comment on column public.orgs.onboarding_product_intent is
  'Which product the customer picked at the start of onboarding: voice = phone calls, chat = messages, free = no purchase yet. NULL = not asked. Activation refuses to provision a phone line when this is chat or free.';
