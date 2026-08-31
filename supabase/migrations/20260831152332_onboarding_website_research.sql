-- The business's own website, and what we read from it.
--
-- APPLIED TO PRODUCTION 2026-08-31 as version 20260831152332.
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
-- SECURITY: reading this column means the server fetches a URL a user supplied, which is a
-- server-side request forgery hole unless it is guarded. The guard lives in
-- `lib/platform/websiteResearch.ts` (`safeWebsiteUrl`): HTTP/HTTPS only, no credentials, private
-- and link-local ranges refused — including 169.254.169.254, the cloud metadata endpoint that
-- answers with credentials — redirects followed by hand and re-checked at every hop, with a
-- timeout and a size cap. `test/website-research.test.ts` pins those addresses.
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
