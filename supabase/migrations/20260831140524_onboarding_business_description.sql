-- One sentence about the business, asked during onboarding.
--
-- APPLIED TO PRODUCTION 2026-08-31 as version 20260831140524.
--
-- WHY A COLUMN AND NOT THE AGENT: onboarding asks this at the goal step, which happens BEFORE
-- the plan is bought and long before `runActivation` creates the `agents` row. There is nowhere
-- on the employee to put it yet, so it is parked on the workspace and folded into
-- `agents.business_context` when the employee is created — for voice and chat alike.
--
-- WHY ASK AT ALL: the chat and voice system prompts both refuse to state a fact that is not in
-- the business-context block ("Never invent a price, a policy, an availability or a fact that is
-- not stated above"). That rule is right, and it means an employee created with an empty context
-- is honest but generic — it answers every question with "I'll pass that to the team". This is
-- the single field that moves the prompt from "generic assistant" to "this business's
-- assistant", which is why it is the ONE thing onboarding asks rather than the full eight-field
-- Knowledge form: eight fields at the moment of payment is a wall, and answers typed before the
-- owner has seen their AI reply to anyone are guesses.
--
-- Nullable, no default: skipping it must stay free. An empty description means the employee is
-- created exactly as it is today, which is a working product, not a broken one.

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS business_description text;

COMMENT ON COLUMN public.organization_settings.business_description IS
  'One or two sentences describing what the business does, collected at onboarding step 1 and '
  'seeded into agents.business_context.services when the AI employee is created. Nullable — '
  'skipping it is supported and yields today''s behaviour.';
