# Denku — Launch Runbook (first paying customers)

> **The single ordered source of truth for going live.** Consolidates every pending operator
> activation step across Sprints 1–6. Supersedes the scattered `SPRINT_*_ACTIVATION` /
> `SPRINT_*_MIGRATION` docs (kept for detail; this is the running order). The go/no-go signal is the
> **Production Readiness Preflight** — `/admin/readiness` (or `GET /api/admin/readiness`), Sprint 6 L1.
>
> **Golden rule:** the preflight must be **green** (no required check failing) before a paying
> customer is onboarded. Every phase below flips one or more preflight checks from fail/warn → pass.

## Phase 0 — Prerequisite: a staging / preview environment (the standing blocker)

Nothing prod-writing (migrations, `enforce` flips, platform flags) may be verified without a place to
test. **Stand up a staging/preview env** (Supabase branch/project + a Vercel preview) with its own
env, and run **every phase below on staging first**, then repeat on prod. This is the #1 gate; all
engineering (preflight, this runbook, the code) is done and waiting on it.

## Phase 1 — Run the preflight (baseline)

Open `/admin/readiness` (Basic-Auth as a platform operator). Note every `fail` (blocks launch) and
`warn` (recommended). The phases below resolve them. Re-run after each phase.

## Phase 2 — Secrets & environment (resolves Core/Security/Voice/Email/Billing checks)

Set in Vercel (staging, then prod). See `web/.env.example` for the full list. Required for launch:

- **Core:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SITE_URL` (https, prod domain).
- **Security:** `VAPI_WEBHOOK_SECRET` (new), `ADMIN_USER`/`ADMIN_PASS` (**rotate** from any shared
  dev values — Sprint 1 handoff), `CRON_SECRET`.
- **Voice:** `VAPI_API_KEY`, **`VAPI_WEBHOOK_BASE_URL`** = the canonical HTTPS prod URL (never
  localhost/`VERCEL_URL` — R-077), `OPENAI_API_KEY` (R-019 AI intent; regex-only without it).
- **Email:** `RESEND_API_KEY`; ensure no `RESEND_FROM_*` uses `resend.dev` (R-080 — the preflight
  flags it); `denku.io` domain verified in Resend.
- **Billing:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- **Support:** `NEXT_PUBLIC_SUPPORT_EMAIL` = a **monitored** inbox (R-047).
- Leave the staged flips for later phases: `VAPI_WEBHOOK_AUTH_MODE`, `CSP_MODE`,
  `BILLING_NOTIFICATIONS_ENABLED`, `ARTIFACT_NOTIFICATIONS_ENABLED`, `PLATFORM_MODEL_ENABLED`,
  `PLATFORM_UX_ENABLED`.

## Phase 3 — Database migrations (apply in filename order)

Apply via the normal migration path; verify each. All are additive and each file documents its own
rollback. Pending set (verify against `supabase/migrations/` and the live DB):

1. **Sprint 3** — RLS backstop + billing/usage views (`20260723110000_rls_backstop…`,
   `20260723100000_baseline_billing_usage_views`, `…_billing_usage_alerts`). *(Preflight `billing_views`.)*
2. **Sprint 4** — `20260723130000_agent_business_context`.
3. **Sprint 4.5 (platform model)** — `20260724000000…000300` (employee_channels, contacts/identities,
   conversations/messages adoption, artifacts). See `docs/SPRINT_4.5_MIGRATION.md`. *(Preflight
   `platform_migrations`.)*
4. **Sprint 6** — `20260724200000_org_invites` (member invites, R-010).

**Verify:** re-run the Supabase `rls_disabled` advisor; confirm the new tables/views exist; the
preflight `platform_migrations` + `billing_views` go green.

## Phase 4 — Reconcile Vapi assistants (so enforce won't drop calls)

`POST /api/internal/reconcile-vapi-assistants` (operator). This re-applies `ensureAssistantConfig` so
every live assistant has `server.url` = your prod `VAPI_WEBHOOK_BASE_URL` and sends the
`x-vapi-secret` header (assistantConfig.ts). Confirm no assistant still points at localhost (R-077).

## Phase 5 — Security enforce (resolves the Critical R-001 + CSP)

1. **Webhook — verify in observe mode first:** with `VAPI_WEBHOOK_SECRET` set and assistants
   reconciled, place a real call and confirm the logs show `[VAPI][WEBHOOK][AUTH][…][OK]` (the header
   matches) — mode is still `log`.
2. **Flip enforce:** set `VAPI_WEBHOOK_AUTH_MODE=enforce`. Forged/unsigned webhooks now 401; real
   calls (which carry the header) are unaffected. *(Preflight `webhook_enforce` → pass.)*
3. **CSP:** review `/api/csp-report` for real violations; when clean, set `CSP_MODE=enforce` (one env
   var + redeploy — Sprint 6 L3). *(Preflight `csp_mode` → pass.)*

## Phase 6 — Notifications & billing enablement

- Register the billing crons (usage-alerts, reconcile, close-month) with `CRON_SECRET`.
- `BILLING_NOTIFICATIONS_ENABLED=true` (R-009 usage alerts + pause emails). *(Preflight
  `billing_notifications` → pass.)*
- `ARTIFACT_NOTIFICATIONS_ENABLED=true` only after the webhook is enforcing (R-008).
- Add the password-reset redirect URL to the Supabase allowlist (R-011, Sprint 2).

## Phase 7 — Live acceptance (the product actually works)

On a **live test call** (Sprint 4 acceptance checklist), confirm: the AI answers in the configured
voice + language; references the business context; a booking call produces an **appointment** (not a
generic ticket) with `[INTENT_DETECTED] source: llm`; the call detail plays the recording; the 15-min
cap / 30-s silence timeout behave. Then verify a ticket/appointment emails the owner (R-008), and a
usage threshold fires an alert (R-009).

## Phase 8 — Platform experience (optional; after voice is verified)

Only once voice is proven live:
1. `PLATFORM_MODEL_ENABLED=true` → place a call + a signed IG Test event; confirm rows in
   `conversations`/`messages` and the back-links (see `docs/SPRINT_4.5_MIGRATION.md`).
2. `PLATFORM_UX_ENABLED=true` → walk the AI Employees IA (Overview, Conversations, Employees,
   Contacts, Channels) and the legacy redirects. *(Backfill R-081 is a separate, later reviewed step.)*

## Go-live checklist

- [ ] Staging walkthrough of Phases 2–7 passed.
- [ ] Preflight `/admin/readiness` is **green** on prod (no required `fail`).
- [ ] Live acceptance (Phase 7) passed on prod.
- [ ] Support inbox (`NEXT_PUBLIC_SUPPORT_EMAIL`) monitored; a test invite (R-010) delivered + accepted.
- [ ] Marketing copy reviewed for honesty (R-004 — see `docs/MARKETING_HONESTY_DRAFT.md`).

## Rollback (per phase)

- **Flags** (webhook `enforce`, `CSP_MODE`, notifications, platform flags): unset/`false` + redeploy —
  instant, no code revert; prior behavior returns.
- **Migrations:** each file has a `ROLLBACK:` block; all are additive over empty/new objects, so
  dropping loses no customer data.
- **Reconcile / secrets:** re-run reconcile after correcting env; rotating a secret + reconcile
  re-establishes the header.

*Companion to the per-sprint activation docs. The preflight is the gate; this is the order.*
