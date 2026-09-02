-- Internal workspaces: Denku's own, and any demo or partner workspace we run ourselves.
--
-- WHY THIS COLUMN EXISTS
--
-- Denku runs as its own customer: the landing page's chat widget is a real Web Chat channel on a
-- real workspace, answered by the real reply engine. That workspace needs a chat entitlement, and
-- the only mechanism for one was a row in `billing_org_addons` — which would have put a $299/month
-- add-on with no Stripe subscription behind it into every billing view and revenue figure. A
-- number in a revenue report that nobody pays is a number somebody eventually acts on.
--
-- So the exemption is explicit and it lives on the workspace, not in the money tables. Billing data
-- stays a record of what was actually charged.
--
-- WHAT IT DOES AND DOES NOT DO
--
-- It grants CHAT CHANNEL CAPACITY only (see `lib/billing/chatEntitlement.ts`). It is deliberately
-- NOT a general billing bypass: it does not touch voice minutes, concurrency leases, the overage
-- hard cap, or `isWorkspacePaused`. Voice costs real money per minute to a third party, so an
-- internal workspace pays for it the same way a customer does. Chat capacity costs nothing to
-- grant, which is exactly why it is the one that can be given away.
--
-- Default false, so this is inert until a row is deliberately flipped. Nothing reads it as "skip
-- the check" — the entitlement function returns capacity for it, and every other gate is untouched.
--
-- ROLLBACK:
--   alter table public.orgs drop column if exists is_internal;
--   (Safe: no data depends on it. Any internal workspace simply loses its chat capacity and the
--    AI goes quiet there, which is the fail-closed direction.)

alter table public.orgs
  add column if not exists is_internal boolean not null default false;

comment on column public.orgs.is_internal is
  'Denku-operated workspace (our own, demo, partner). Grants chat channel capacity without a '
  'billing_org_addons row, so revenue figures stay a record of what was actually charged. '
  'Grants chat capacity ONLY — never voice minutes, concurrency, overage caps or pause status.';

-- Partial index: the internal set is tiny and every read asks "which orgs are internal", never
-- "which are not".
create index if not exists idx_orgs_is_internal
  on public.orgs (id)
  where is_internal = true;
