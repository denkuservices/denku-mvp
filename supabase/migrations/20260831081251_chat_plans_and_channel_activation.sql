-- Chat as a purchasable capacity, and which channels a workspace has switched on.
--
-- APPLIED TO PRODUCTION 2026-08-31 as version 20260831081251.
--
-- WHY: voice and chat are separately purchasable. The axis is CAPACITY, not consumption —
-- how many chat channels you may run, not how many messages you send. That matters because
-- capacity is a COUNT this schema can already answer, while consumption would need a metering
-- pipeline that does not exist (there is no message counter anywhere in `lib/billing`, and
-- `usageMath` computes exactly one number: billable voice minutes). Selling a message quota
-- today would promise something nobody could count, enforce or cap.
--
-- FOUR PIECES, all additive:
--
-- 1. A `chat_only` row in `billing_plan_catalog`, so a customer can buy chat WITHOUT voice.
--    `org_plan_limits` holds a single `plan_code` per org, so chat-only needs a base plan to
--    point at. It is priced at $0 with zero minutes, zero concurrency and zero phones — the
--    money comes from the chat add-on. Zero concurrency also means the existing lease check
--    denies voice calls for these orgs with no new code: `getEffectiveLimits` already returns
--    the catalogue's `concurrency_limit`, and a limit of 0 rejects every call.
--
-- 2. `org_active_channels` — which channels the workspace has actually switched on. A customer
--    may CONNECT more channels than their plan entitles (so they can set everything up and see
--    it working); only the activated ones are answered by the AI. Same shape as Instagram's
--    existing receive-only behaviour, which is why this needed no new concept.
--
-- 3. `billing_addon_catalog_unit_check` widened to accept 'month'. The existing units are
--    'seat' and 'number' because both existing add-ons are bought by the piece. A chat tier is
--    not: $499 buys TWO channels, so the billing page's "{price} per {unit}" pill would read
--    "$499 per channel" and misstate the price. 'month' is the only unit that is true for both
--    tiers. Widening an allowed-value list, never narrowing it — existing rows stay valid.
--
-- 4. Two `billing_addon_catalog` rows with a DELIBERATELY NULL `stripe_price_id`. The add-on
--    route reads that column and refuses the purchase when it is null
--    ([BILLING][ADDON_UPDATE][CONFIG_ERROR], 500) — so chat cannot be sold until an operator
--    creates the Stripe prices and writes the ids in. Fail-closed on money, per CLAUDE.md.
--    `billing_org_addons.addon_key` itself is plain `text` with no CHECK, so the org-side rows
--    need no migration at all; entitlement is DERIVED from them rather than stored.
--
-- ADDITIVE + INERT UNTIL APPLIED: every reader fails soft. Before this is applied,
-- `getChatEntitlement` returns zero slots and no active channels, which reads as "chat not
-- purchased" — the honest default, and the same state a brand-new workspace is in.
--
-- RLS-LOCKED, SERVICE-ROLE ONLY — consistent with every other platform table: RLS enabled with
-- NO policies, so all access goes through the service-role client with an explicit
-- `.eq("org_id", orgId)` filter.

-- ---------------------------------------------------------------------------
-- 1. The $0 base plan that lets chat be bought on its own.
-- ---------------------------------------------------------------------------
INSERT INTO public.billing_plan_catalog (
  plan_code, display_name, monthly_fee_usd, included_minutes,
  overage_rate_usd_per_min, concurrency_limit, included_phone_numbers
)
VALUES ('chat_only', 'Chat only', 0, 0, 0, 0, 0)
ON CONFLICT (plan_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Which channels this workspace has switched on.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_active_channels (
  org_id       uuid        NOT NULL,
  -- Free text, matching the channel registry in `lib/platform/channels.ts`
  -- (no DB enum — a new channel must not need a migration).
  channel      text        NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  activated_by uuid,
  PRIMARY KEY (org_id, channel)
);

-- The only query this table serves: "which channels are on for this org?"
CREATE INDEX IF NOT EXISTS org_active_channels_org_idx
  ON public.org_active_channels (org_id);

ALTER TABLE public.org_active_channels ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.org_active_channels IS
  'Channels a workspace has switched on. A workspace may connect more than it is entitled to; '
  'only rows here are answered by the AI. Entitled slot count is derived from billing_org_addons '
  '(chat_basic = 1, chat_standard = 2). Enforced in lib/billing/chatEntitlement.ts.';

-- ---------------------------------------------------------------------------
-- 3. Allow a per-month add-on unit alongside the existing per-piece ones.
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_addon_catalog
  DROP CONSTRAINT IF EXISTS billing_addon_catalog_unit_check;

ALTER TABLE public.billing_addon_catalog
  ADD CONSTRAINT billing_addon_catalog_unit_check
  CHECK (unit = ANY (ARRAY['seat'::text, 'number'::text, 'month'::text]));

-- ---------------------------------------------------------------------------
-- 4. The two sellable chat tiers — priced, but NOT yet purchasable.
--    `stripe_price_id` stays NULL on purpose: the add-on route refuses to charge
--    without it, so the offer cannot go live before Stripe is configured.
-- ---------------------------------------------------------------------------
INSERT INTO public.billing_addon_catalog (
  addon_key, label, unit, price_usd_month, step, is_active, stripe_price_id
)
VALUES
  ('chat_basic',    'Chat — 1 channel',  'month', 299, 1, true, NULL),
  ('chat_standard', 'Chat — 2 channels', 'month', 499, 1, true, NULL)
ON CONFLICT (addon_key) DO NOTHING;
