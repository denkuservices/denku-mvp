-- Every voice plan includes exactly one phone number.
--
-- APPLIED TO PRODUCTION 2026-08-31.
--
-- The catalogue granted starter 1, growth 2 and scale 5. The marketing site has said
-- "1 phone included" on all three, in all four languages, the whole time — so the number a
-- customer was SOLD and the number the product ENFORCED disagreed, and the enforced one was the
-- catalogue.
--
-- Owner decision 2026-08-31: one included number per plan is the intent. The catalogue is the
-- outlier, so the catalogue moves.
--
-- Direction matters here. This REDUCES an entitlement, which is normally the change you must not
-- make quietly — so it was checked against live data first: exactly one workspace is on Growth
-- and it holds exactly one number. Nobody loses a line they are already using, and nobody's
-- provisioned number is orphaned by this.
--
-- Extra numbers remain available and are unaffected: `extra_phone` in `billing_addon_catalog`
-- sells them at $10/month, and `getEffectiveLimits` adds those on top of the plan's base. What
-- changes is only the base each plan starts from.

UPDATE public.billing_plan_catalog
   SET included_phone_numbers = 1,
       updated_at = now()
 WHERE plan_code IN ('starter', 'growth', 'scale')
   AND included_phone_numbers <> 1;
