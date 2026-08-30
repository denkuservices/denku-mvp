-- Chat as a purchasable capacity, and which channels a workspace has switched on.
--
-- WHY: voice and chat are becoming separately purchasable. The axis is CAPACITY, not
-- consumption — how many chat channels you may run, not how many messages you send. That
-- matters because capacity is a COUNT this schema can already answer, while consumption
-- would need a metering pipeline that does not exist (there is no message counter anywhere
-- in `lib/billing`, and `usageMath` computes exactly one number: billable voice minutes).
-- Selling a message quota today would promise something nobody could count, enforce or cap.
--
-- TWO PIECES, both additive:
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
-- NO CHANGE NEEDED for the add-on itself: `billing_org_addons.addon_key` is plain `text` with
-- no CHECK constraint, so `chat_basic` and `chat_standard` are just new values. Entitlement is
-- derived from those rows rather than stored, so there is nothing to keep in sync.
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
