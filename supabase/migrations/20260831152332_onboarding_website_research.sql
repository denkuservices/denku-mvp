-- The business's own website, and what we read from it.
--
-- WHY: onboarding already asks for a workspace name and a phone number. A website is one more
-- optional line for the owner and by far the richest thing they can give us — opening hours, an
-- address, services, the questions they already answer on their own FAQ page. Every one of those
-- is a field the AI otherwise has to say "I'll pass that to the team" about.
--
-- `website_facts` holds what was EXTRACTED, never what was decided. Nothing here is written into
-- `agents.business_context` automatically: it surfaces as placeholders and as input to the
-- Knowledge draft, both of which a person reviews before anything is saved. A fact scraped from
-- a page and silently spoken to a customer as the business's own word is the same failure as an
-- invented one — the source being real does not make the claim current, and an opening time from
-- a stale page is wrong in exactly the way that loses a customer.
--
-- `website_checked_at` is set whether or not the fetch succeeded, so a site that cannot be read
-- is not retried on every page load. A null value means never attempted.

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS website_facts jsonb,
  ADD COLUMN IF NOT EXISTS website_checked_at timestamptz;

COMMENT ON COLUMN public.organization_settings.website_url IS
  'The business''s own website, collected optionally at onboarding step 1.';

COMMENT ON COLUMN public.organization_settings.website_facts IS
  'Facts extracted from website_url by lib/platform/websiteResearch.ts. SUGGESTIONS ONLY — shown '
  'as placeholders and used as input to the Knowledge draft, never written into '
  'agents.business_context without a person confirming.';

COMMENT ON COLUMN public.organization_settings.website_checked_at IS
  'When the site was last fetched, successful or not, so a broken site is not retried endlessly.';
