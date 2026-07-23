# Sprint 3 — Operator Activation Runbook

> The manual steps to finish Sprint 3 safely. Sprint 3 shipped **code-complete and staged OFF** —
> nothing here changes production behavior until an operator performs these steps **in order**. Live
> DB access during Sprint 3 was read-only; all schema changes are migration files you apply here.
>
> **Code baseline:** `origin/main` @ `b2ce62e` (Vercel must be building this commit). 118 tests green.
> **Golden rule:** do the steps in order; each has a verification and a rollback. Enabling flags is
> reversible; the one behavioral change is R-009 pausing lines at 100% of included minutes (Step 5).

---

## What "staged OFF" means here

| Shipped (staged) | Flag / gate | Behavior until activated |
|---|---|---|
| R-060 RLS backstop (7 tables) | migration not applied | tables stay exposed (unchanged risk) |
| R-009 usage warnings + pause-at-cap | `BILLING_NOTIFICATIONS_ENABLED` unset + crons + table | no warnings, no auto-pause |
| R-076 COGS/revenue reconciliation | cron deploy | no reconciliation logs |
| R-008 artifact notifications (Sprint 2) | `ARTIFACT_NOTIFICATIONS_ENABLED` unset + migration | no per-artifact emails |
| R-011 password reset (Sprint 2) | Supabase redirect allowlist | reset link may not reach the form |

---

## Prerequisites (confirm before starting)

- [ ] **`origin/main` @ `b2ce62e` is deployed** (or will be in Step 3). Vercel → Deployments shows READY on this commit.
- [ ] **`CRON_SECRET`** is set in Vercel (already used by `close-month`; the two new crons reuse it).
- [ ] **`RESEND_API_KEY`** set and the **`denku.io` sending domain is verified** (owner-confirmed). Sender defaults are `denku.io` (R-080); no `RESEND_FROM*` needed unless overriding.
- [ ] A **backup/PITR** point exists in Supabase (Database → Backups) before applying migrations.

---

## Step 1 — Apply the R-060 RLS backstop (highest-risk; do first, verify hard)

Applies RLS to **7 service-role-only tables**. The app uses the service-role client (which bypasses RLS), so this should be invisible to the app — verify that it is.

1. Apply `supabase/migrations/20260723110000_rls_backstop_service_role_tables.sql`
   (Supabase → SQL Editor, paste the file, run; or `supabase db push` if using the CLI).
2. **Verify (must all pass):**
   - [ ] App still works with the service-role client: load **billing summary** (`/dashboard/settings/workspace/billing`) and **settings → audit** — no errors.
   - [ ] The Vapi webhook path is unaffected: a **test/demo call still creates a ticket** (webhook uses service-role; `webhook_debug`/`personas` are now RLS-locked but service-role bypasses).
   - [ ] Re-run the Supabase advisor (`rls_disabled`): it should now list **only 3** tables — `orgs`, `audit_log_changes`, `org_plan_overrides` (the deferred, anon-read ones).
   - [ ] With the **anon key only**, `select * from webhook_debug` returns **0 rows**.
3. **Rollback if anything breaks:**
   ```sql
   ALTER TABLE public.webhook_debug DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.personas DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.persona_tools DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.onboarding_activation_lock DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.billing_stripe_customers DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.billing_stripe_prices DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.billing_invoice_runs DISABLE ROW LEVEL SECURITY;
   ```
   (Reversible instantly; no data touched.) **Do NOT lock `orgs`/`audit_log_changes`/`org_plan_overrides` — they need tested policies (R-060 remainder, needs staging).**

## Step 2 — Apply the remaining migrations

1. `supabase/migrations/20260723120000_billing_usage_alerts.sql` — creates the `billing_usage_alerts`
   idempotency table (R-009). Additive; safe.
2. `supabase/migrations/20260723000000_artifact_notifications.sql` — adds `tickets.notified_at`,
   `appointments.notified_at`, `organization_settings.notify_on_artifacts` (R-008). Additive; safe.
3. `supabase/migrations/20260723100000_baseline_billing_usage_views.sql` (R-075) — **OPTIONAL / no-op:**
   the 8 billing views already exist in prod; this file documents them and uses `CREATE OR REPLACE`
   with the *exact live definitions*, so applying it changes nothing. Apply it only if you want the
   repo migration recorded in prod's migration history.
- **Verify:** [ ] `billing_usage_alerts` exists (empty); [ ] `organization_settings.notify_on_artifacts` exists (default true).
- **Rollback:** `DROP TABLE public.billing_usage_alerts;` and, if needed, drop the added columns. All additive → low risk.

## Step 3 — Deploy the code (registers the two new crons)

The crons are declared in `vercel.json`; Vercel registers them **on deploy**.

1. Ensure Vercel is deploying `origin/main` @ `b2ce62e` (push already done; trigger a redeploy if needed).
2. **Verify:** [ ] Vercel → Settings → **Cron Jobs** now lists **three**: `close-month` (`10 0 1 * *`),
   `usage-alerts` (`0 8 * * *`), `reconcile` (`30 1 1 * *`).
3. **Verify auth:** unauthenticated `GET /api/billing/cron/usage-alerts` returns **401** (CRON_SECRET-gated).
- **Rollback:** revert `vercel.json` (remove the two cron entries) and redeploy; the routes stay but won't be scheduled.

## Step 4 — (Optional) confirm senders (R-080)

Defaults already target `denku.io` (`no-reply@`, `notifications@`, `hello@`). Only if you want different
addresses, set in Vercel: `RESEND_FROM`, `RESEND_FROM_AUTH`, `RESEND_FROM_NOTIFY`, `RESEND_FROM_WELCOME`.
- **Verify:** hit `POST /api/dev/test-welcome {"email":"you@denku.io"}` (dev only) or send a real welcome; confirm it arrives from `denku.io`.

## Step 5 — Activate R-009 (usage warnings + pause-at-cap) ⚠️ behavioral change

Setting this flag makes the daily `usage-alerts` cron **live**: it emails 50/75/90% warnings and
**pauses any active org at 100% of included minutes** (unbinds telephony + emails the owner). On the
current test/staging Vapi account (≈0 call history) nothing pauses immediately, but this is real
enforcement going forward.

1. In Vercel, set **`BILLING_NOTIFICATIONS_ENABLED=true`** (Production). Redeploy if needed.
2. **Verify safely** (don't wait a day): run the cron manually —
   ```
   curl -H "x-cron-secret: $CRON_SECRET" https://www.denku.io/api/billing/cron/usage-alerts
   ```
   Expect `{ ok:true, enabled:true, orgsChecked:N, emailsSent:0, paused:0 }` on a low-usage prod.
   [ ] Response shows `enabled:true`. [ ] No org unexpectedly paused (check `PausedBanner` doesn't appear for a healthy org).
3. **Rollback:** unset `BILLING_NOTIFICATIONS_ENABLED` (or set to anything ≠ `true`) → the cron no-ops
   again. To un-pause an org paused in error, use the existing resume path (Settings → workspace
   controls / `resumeOrgBilling`).

## Step 6 — (Optional) verify R-076 reconciliation

Monthly cron; runs `30 1 1 * *`. To check now:
```
curl -H "x-cron-secret: $CRON_SECRET" https://www.denku.io/api/billing/cron/reconcile
```
- **Verify:** [ ] `{ ok:true, month, orgsChecked, negative, thin }`; [ ] Vercel logs show `[BILLING][RECONCILE][SUMMARY]`.
- No rollback needed (read-only + logs).

## Step 7 — R-011 password reset (Sprint 2 carry-over, needed for the reset link)

1. Supabase → Authentication → **URL Configuration → Redirect URLs**: add
   `https://www.denku.io/auth/reset-callback` (and `http://localhost:3000/auth/reset-callback` for dev).
2. **Verify:** [ ] `/forgot-password` → request a reset for a real test account → the emailed link lands on `/reset-password` and a new password works end-to-end.
- **Rollback:** remove the redirect URL (reset flow reverts to broken, but nothing else breaks).

## Step 8 — R-008 artifact notifications (needs the webhook secured first)

**Do NOT enable before the Vapi webhook is enforcing** (Sprint-1 carry-over below) — otherwise a forged
webhook could spam a customer's inbox.

1. Confirm `VAPI_WEBHOOK_AUTH_MODE=enforce` is live and a real call logs `[VAPI][WEBHOOK][AUTH][OK]`.
2. Set **`ARTIFACT_NOTIFICATIONS_ENABLED=true`**.
3. **Verify:** place a real/demo call → confirm the owner receives **exactly one** ticket/appointment email.
- **Rollback:** unset the flag → sweep no-ops.

---

## Carried-over prerequisites from Sprints 1–2 (not new to Sprint 3, but gate some steps)

These remain from earlier handoffs; Step 8 depends on the webhook one:
- [ ] Rotate `ADMIN_USER` / `ADMIN_PASS` in Vercel (R-002 follow-up).
- [ ] Set `VAPI_WEBHOOK_BASE_URL`; run `POST /api/internal/reconcile-vapi-assistants`; place a live test call (R-050/R-077).
- [ ] Flip `VAPI_WEBHOOK_AUTH_MODE=enforce` after `[…][OK]` (R-001) — **gates Step 8**.
- [ ] Watch CSP reports, then enforce CSP (R-056 follow-up).

---

## Sprint 3 "fully complete" definition of done

- [ ] Step 1 (RLS backstop) applied + advisor shows only the 3 deferred tables.
- [ ] Steps 2–3 (migrations + deploy) done; 3 crons registered.
- [ ] Step 5 (`BILLING_NOTIFICATIONS_ENABLED=true`) live; usage cron verified (`enabled:true`).
- [ ] Step 7 (reset redirect URL) done; reset verified end-to-end.
- [ ] (If webhook enforcing) Step 8 done; one artifact email observed.

**Still NOT part of Sprint 3 activation (need a staging env / owner input — see the roadmap):**
R-060's 3 anon-read tables (`orgs`/`audit_log_changes`/`org_plan_overrides`) + `orgScoped` helper;
R-057 (per-operator admin identity).

---

*Companion to `docs/SPRINT_3_REVIEW.md`. When every box above is checked, Sprint 3 is fully complete
(engineering + operationally verified).*
