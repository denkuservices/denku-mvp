# Skill: Deployment & environments

> Where Denku runs, every environment variable that matters, scheduled jobs, and the external
> service configuration that lives OUTSIDE this repo (the part you can't grep).

## Runtime & deploy

- **Vercel**, project URL `https://denku-mvp.vercel.app` (production; target domain `denku.ai`
  per `web/src/config/site.ts` — not yet the deploy URL).
- App root is `web/` (Next.js 16, Turbopack dev). Build: `cd web && npm run build`
  (baseline ~72 pages). `ANALYZE=true npm run build` enables bundle analyzer.
- Middleware uses the service-role client → **Node runtime middleware** (not Edge). Keep it that way
  or remove the service-role usage first.
- **CI:** `.github/workflows/ci.yml` (R-037) runs on every push/PR to `main` → `npm ci` +
  `npm run test` (vitest, **blocking**) + `npm run lint` (**non-blocking** — ~216 pre-existing
  errors are tracked debt). **The build gate is Vercel**, which builds/deploys every push — CI
  intentionally does not duplicate `next build` (it would need injected env to satisfy the
  fail-fast service-role client). Tests mock all Supabase access, so CI needs no secrets.

## Scheduled jobs

| Trigger | Schedule | Target | Auth |
|---|---|---|---|
| `vercel.json` cron | `10 0 1 * *` | `/api/billing/cron/close-month` | Vercel injects `Authorization: Bearer ${CRON_SECRET}` |
| `.github/workflows/close_month.yml` | `10 0 1 * *` + manual dispatch | same URL (hardcoded `denku-mvp.vercel.app`) | `secrets.CRON_SECRET` |

Both fire monthly at 00:10 UTC on the 1st — redundant by accident, safe via
`billing_invoice_runs.lock_token`. If the deploy URL changes, update the GitHub workflow.

## Environment variables (complete inventory from code)

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — session clients + middleware.
- `SUPABASE_SERVICE_ROLE_KEY` — service-role client (`lib/supabase/admin.ts` throws without it).

### Vapi
- `VAPI_API_KEY` — server REST calls (never exposed).
- `NEXT_PUBLIC_VAPI_PUBLIC_KEY` — browser Web SDK (marketing demo).
- `VAPI_AGENT_ID` — marketing demo assistant (falls back to hardcoded
  `155b21ad-2f8b-4593-b33c-c5021e644328` in `api/vapi/start`).
- ⚠ Not env but env-coupled: tool IDs `6c9b0279…`/`5373add8…` hardcoded in onboarding actions —
  tied to the specific Vapi account.

### Stripe
- `STRIPE_SECRET_KEY` — API version pinned `2025-02-24.acacia`.
- `STRIPE_WEBHOOK_SECRET` — signature verification on `/api/webhooks/stripe`.

### Internal secrets
- `DENKU_TOOL_SECRET` — canonical shared secret for `/api/tools/*` (`x-denku-secret` header).
  (`TOOL_SECRET`/`DENKU_SECRET`/`X_DENKU_SECRET` appear only in a debug presence-dump — ignore.)
- `CRON_SECRET` — close-month auth (Bearer or `x-cron-secret`).
- `ADMIN_USER`, `ADMIN_PASS` — HTTP Basic Auth for `/admin`, `/api/admin`, `/api/internal/*`.
- `VAPI_WEBHOOK_SECRET` — present in `.env.local` but ⚠ **never read by any code** (the Vapi
  webhook is unauthenticated — R-001). Provisioned-but-unwired; Task 5 should consume it.

### Email (Resend)
- `RESEND_API_KEY` — optional; without it all email helpers no-op with `{ ok, skipped }`
  ("domainless beta" mode).
- `RESEND_FROM` — dev test route override. Hardcoded senders:
  `Denku <onboarding@resend.dev>` (verification/OTP/reset, `lib/email/resend.ts#SENDER`) and
  `Denku <hello@denku.io>` (welcome, `lib/email/send.ts#WELCOME_FROM`) — note the domain
  inconsistency with denku.ai.

### URLs
- `NEXT_PUBLIC_SITE_URL` — canonical base URL. Resolution everywhere is
  `NEXT_PUBLIC_SITE_URL → https://${VERCEL_URL} → http://localhost:3000`
  (`lib/utils/url.ts#getBaseUrl`; checkout uses `NEXT_PUBLIC_APP_URL → origin/host headers →
  localhost` — two similar-but-different resolvers, beware).
- `NEXT_PUBLIC_APP_URL` — checkout return URLs specifically.
- `NEXT_PUBLIC_SPLINE_SCENE_URL` — hero robot scene
  (`https://prod.spline.design/UAZ0yJcBnzG0I0Yb/scene.splinecode`).

### Misc
- `BILLING_DEBUG` — extra logging in billing paths. `NODE_ENV` gates cookie `secure`, debug logs,
  and the dev-only `/api/dev/test-welcome` route (404s in production).

## External configuration NOT in this repo (checklist when reproducing an environment)

1. **Supabase project** — base schema + RPCs (`reconcile_call_cost`, TABLE-returning
   `acquire_org_concurrency_lease`) exist only in the live DB; Auth settings need Site URL +
   redirect URLs (`{base}/auth/callback`, plus localhost) per the docstring in `lib/utils/url.ts`.
   ⚠ The workspace's Supabase MCP points at the WRONG project ("BondAI"); the project referenced by
   the local `.env.local` is `kebqwsdguxxjsijahrox`, which **no longer resolves via DNS as of
   2026-07-07** (ENOTFOUND — dead/paused/deleted). The local env therefore cannot reach any DB;
   prod runs on separate live Vercel env not present in this repo. Do not assume `.env.local`
   Supabase creds work.
2. **Vapi dashboard** — the two tools (create_ticket, create_appointment) whose IDs are hardcoded;
   the marketing demo assistant; webhook/serverUrl configuration. Vapi must be able to reach
   `{base}/api/webhooks/vapi` and `{base}/api/tools/*`.
3. **Stripe** — webhook endpoint → `{base}/api/webhooks/stripe` with the events the handler uses:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `customer.subscription.created|updated`, `invoice.*`. Products/prices are ad-hoc (`price_data`)
   so no catalog setup needed yet.
4. **Resend** — domain verification for `denku.io` (welcome sender); `onboarding@resend.dev`
   works without a domain.
5. **Vercel** — env vars above + cron; GitHub repo secret `CRON_SECRET` for the Action.

## Local development

- `cd web && npm run dev` (Turbopack). Cookies work on http://localhost because `secure` follows
  `NODE_ENV`.
- Stripe/Vapi webhooks need tunneling (e.g. `stripe listen --forward-to
  localhost:3000/api/webhooks/stripe`); Vapi webhook has no signature yet so any POST works
  locally (and, unfortunately, in prod — R-001, see `docs/IMPLEMENTATION_ROADMAP.md`).
- Email: leave `RESEND_API_KEY` unset to no-op sends; Supabase still sends its own auth emails.
- Test welcome email: `POST /api/dev/test-welcome {"email": "..."}` (dev only).
