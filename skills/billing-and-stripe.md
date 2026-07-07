# Skill: Billing & Stripe

> Plans, checkout, add-ons, overage, pause enforcement, and month close. Billing is the most
> operationally mature subsystem — its idempotency patterns are the house style.

## Data model (all in Supabase)

| Table | Role |
|---|---|
| `billing_plan_catalog` | Canonical plan definitions. Seeded: starter/growth/scale with `monthly_fee_usd`, `included_minutes`, `overage_rate_usd_per_min`, `concurrency_limit`, `included_phone_numbers`. RLS: readable by all authenticated users. |
| `org_plan_overrides` | **Write target** when a plan is activated (`org_id` PK, `plan_code`). |
| `org_plan_limits` | **Read target** for "what plan does this org have" (`plan_code IS NULL` ⇒ preview mode). Treat as derived from overrides+catalog; always read via this, never via overrides. |
| `billing_org_addons` | Add-on quantities: `addon_key ∈ {extra_phone, extra_concurrency}`, `qty`, `status='active'`. |
| `billing_invoice_runs` | Month-close state machine: `locked_at`/`lock_token` (concurrency), `finalized_at`, `sent_at`, `error_message`, `stripe_invoice_id`, `status`. |
| `billing_overage_state` | Per `(org_id, month 'YYYY-MM-01')`: `threshold_usd` (default 100), `hard_cap_usd` (default 250), `last_collected_overage_usd`, `next_collect_at_overage_usd`, collect attempt tracking. |
| `organization_settings` | `billing_status ∈ {active, past_due, paused}`, `workspace_status ∈ {active, paused}`, `paused_reason ∈ {manual, hard_cap, past_due}`, `paused_at`. |

**Effective limits** = catalog base + active add-ons, computed live (never cached) by
`web/src/lib/billing/limits.ts#getEffectiveLimits(orgId)` → `{ max_concurrent_calls,
included_phones, plan_key, addons }`. All enforcement (leases, rebind, purchase) goes through this.

## Plan purchase (onboarding + upgrades)

1. `POST /api/billing/stripe/checkout` — session auth → org → blocks if paused for
   `hard_cap`/`past_due` → reads plan from catalog → `ensureStripeCustomer` (helpers in
   `api/billing/stripe/create-draft-invoice-helpers.ts`, Stripe API version `2025-02-24.acacia`)
   → creates Checkout Session, **subscription mode with inline `price_data`** (known debt: no
   catalog Prices), metadata `{ org_id, plan_code, kind: "onboarding_plan_purchase" }`,
   success URL `{return_to}?checkout=success&session_id={CHECKOUT_SESSION_ID}`.
2. **Activation is dual-path — keep both in sync:**
   - Webhook: `checkout.session.completed` in `api/webhooks/stripe/route.ts` (signature verified
     with `STRIPE_WEBHOOK_SECRET`) upserts `org_plan_overrides` and bumps `onboarding_step` to 5.
   - Redirect fallback: `onboarding/page.tsx#handleCheckoutSuccess` retrieves the session
     server-side and does the same upsert (idempotent), then redirects to clean `/onboarding`.
   Rationale: deterministic UX even when the webhook is delayed. Both paths only RAISE the
   onboarding step (`if currentStep < 5`), never lower it.
3. Plan change: `POST /api/billing/plan/change`; add-ons: `POST /api/billing/addons/update`
   (updates the Stripe subscription item quantity directly — **no checkout redirect** for add-ons,
   this is a product rule from Sprint 8).

## Phone-line purchase orchestration (`api/phone-lines/purchase/route.ts`)

Order matters — Stripe first, then Vapi, then DB, with explicit compensation:

```
+1 extra_phone via internal fetch → /api/billing/addons/update  (forwards request cookies!)
→ create Vapi assistant                  (fail ⇒ Stripe decrement, return)
→ insert agents row                      (fail ⇒ delete Vapi assistant, Stripe decrement)
→ provision Vapi number (area code, fallback 321)  (fail ⇒ Stripe decrement)
→ poll number E164 → insert phone_lines row
```

If you edit any step, update every downstream rollback block (they're copy-pasted, 4 instances).
The internal addon fetch authenticates by forwarding the caller's Cookie header — changing
middleware or auth on `/api/billing/addons/update` will silently break purchases.

## Overage & hard cap

- Usage accrues on `calls.cost_usd` (source of truth, written by RPC `reconcile_call_cost` from
  the Vapi webhook; idempotent, rounds to 6 decimals).
- Thresholded collection: when uncollected overage crosses `next_collect_at_overage_usd`
  (default $100), `POST /api/billing/overage/collect-now` invoices immediately; state advances in
  `billing_overage_state`.
- **Hard cap ($250 default): pause the workspace** with `paused_reason='hard_cap'` — which
  triggers telephony enforcement (below).

## Pause / resume enforcement (billing has teeth)

- Pause = set `organization_settings.workspace_status='paused'` + reason, then
  `enforceTelephonyPause(orgId)` (`lib/workspace/enforcePause.ts`) →
  `unbindOrgPhoneNumbers(orgId, reason)` → Vapi numbers PATCHed to `assistantId: null`.
- While paused: Vapi webhooks return early (`ignored: workspace_paused`), lease acquisition denies
  (`org_inactive`), rebind refuses, checkout blocks for `hard_cap`/`past_due` reasons.
- Resume = `rebindOrgPhoneNumbers` (checks effective phone limits first).
- Repair endpoints for ops (Basic Auth): `POST /api/internal/enforce-billing-pause` and
  `/api/internal/enforce-billing-resume` — reconcile Vapi state with DB state for a given org.
- Stripe `invoice.payment_failed` → `past_due` handling lives in the Stripe webhook; payment
  success events clear/advance invoice-run status.

## Month close (invoice generation)

- Route: `GET|POST /api/billing/cron/close-month` — auth: `Authorization: Bearer ${CRON_SECRET}`
  (Vercel cron format) or `x-cron-secret` header for manual runs.
- Triggered **twice** by design-accident: `vercel.json` cron AND
  `.github/workflows/close_month.yml` (both `10 0 1 * *`, the Action curls the prod URL).
  Safe because runs lock via `billing_invoice_runs.lock_token`, but pick one eventually.
- Flow: compute usage for the closed month → create/finalize Stripe draft invoice
  (`api/billing/stripe/create-draft-invoice`) → track `finalized_at`/`sent_at` → webhook
  reconciles `invoice.finalized|paid|payment_failed|voided|marked_uncollectible` back onto the run.
- `BILLING_DEBUG` env enables extra logging in these paths.

## Preview mode (no plan yet)

`lib/billing/isPreviewMode.ts`: `org_plan_limits.plan_code IS NULL`. UI contract (Sprint 8):
- Phone-lines "Add phone number" renders a **link to billing** ("Choose a plan"), not the modal.
- Destructive/paid actions (pause/resume, test call, delete) disabled with tooltip
  "Upgrade to activate this feature".
- Middleware allowlists `/dashboard/settings/workspace/billing` so preview users can buy.

## Billing UI

Customer billing page = `dashboard/settings/workspace/billing/page.tsx` (1,432-line client
component, self-contained Button/Card/Badge primitives, fetches `/api/billing/summary`).
`dashboard/billing` (sidebar-level) is a placeholder — don't confuse them.
