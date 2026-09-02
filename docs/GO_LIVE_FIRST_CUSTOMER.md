# Go Live — First Paying Customer

> Written 2026-08-25 against a verified live-prod inspection. Companion to
> [docs/LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md) (the ordered phases) and
> [docs/SPRINT_D0_TURN_IT_ON.md](SPRINT_D0_TURN_IT_ON.md) (the sprint). This document adds the two
> things the runbook does not cover: **resetting the test data** and **switching the Vapi account.**

## 0. The one thing to internalise before tomorrow

**No call has reached production since 2026-02-20.** Intent classification (R-019) shipped
2026-07-23, so every one of the 182 calls in the database predates it — which is why there are 93
tickets and **zero appointments**. The appointment path, the platform model, the manifests, and the
whole Sprint 9–14 interface have **never handled a real call.**

So the risk tomorrow is not deployment. It is that **the product has never been observed doing the
thing it is sold for.** Everything below is ordered to surface that before a customer does.

**Do the §4 rehearsal call yourself, on a fresh account, before the customer touches anything.** If
you do one thing from this document, do that.

---

## 1. Recommendation: do NOT switch Vapi accounts before this customer

You asked whether to start from a clean Vapi profile. My answer is **not tomorrow** — do it later,
deliberately. Reasons:

1. **It is not an env-var change. It requires a code edit and two tools created by hand** (§3).
   That is a deploy, on the day you are onboarding a customer.
2. **It invalidates the tool IDs.** `create_ticket` and `create_appointment` are hardcoded Vapi tool
   UUIDs tied to the current account. In a new account they do not exist, so the assistant would
   answer calls and then be **unable to create a ticket or appointment** — the exact failure the
   "never dead-end" guarantee exists to prevent, and it would look like the product working right up
   until the artifact never appears.
3. **You would buy a new phone number** and re-run activation on an unproven path, on the day.
4. The current account works and is already reconciled. Nothing about it blocks a customer.

**Cleaner sequence:** reset the DB (§2) → launch on the existing Vapi account (§4) → get the customer
live → switch Vapi later with §3 in hand and time to test.

If you switch anyway, §3 is complete and correct — just do it **today**, not mid-onboarding.

---

## 2. Reset the test data

Script: [supabase/scripts/reset_test_data.sql](../supabase/scripts/reset_test_data.sql). Run it by
hand in the Supabase SQL editor — it is deliberately **not** a migration so it can never run itself.

**Take a Supabase backup first** (Dashboard → Database → Backups). This is irreversible.

What it does: truncates all 38 tenant tables (orgs, profiles, agents, calls, tickets, leads,
phone_lines, billing per-org rows, audit_log, 3,248 webhook_debug rows…) and **preserves the seed
catalogs** — `billing_plan_catalog` (3 plans), `billing_addon_catalog` (2), `billing_stripe_prices`
(3), `personas` (18), `persona_tools` (117). A naive "delete everything" would wipe the plan catalog
and break billing entirely; this does not.

**Three things the SQL cannot clean — do these in the vendors' dashboards:**

| Where | What | Why it matters |
|---|---|---|
| **Vapi** | 6 provisioned phone numbers, 12 assistants | Deleting DB rows does **not** release a number — it keeps billing you monthly |
| **Stripe** | 18 customers | Deleting DB rows does **not** cancel a subscription. Confirm they are test-mode |
| **Supabase Auth** | 60 users (vs 25 profiles — 35 orphans) | Step 5 of the script, or Dashboard → Authentication → Users → delete all |

Delete your own login too. You want to walk the real signup path tomorrow, not a grandfathered one.

---

## 3. Switching the Vapi account (when you do it)

### 3a. Environment variables (Vercel)

| Variable | Where to get it | Notes |
|---|---|---|
| `VAPI_API_KEY` | New account → **private** key | Server-side REST. Never exposed |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | New account → **public** key | Browser Web SDK (marketing demo call) |
| `VAPI_DENKU_ASSISTANT_ID` | Run `scripts/register-denku-agent.mts` in the new account; use the id it prints | Denku's own assistant. Overrides the hardcoded fallback, which points at the old account |
| `VAPI_WEBHOOK_SECRET` | **You invent it** | Any long random string. Reconcile pushes it into the new assistants as the `x-vapi-secret` header |
| `VAPI_WEBHOOK_BASE_URL` | unchanged | Only changes if your domain changes. Never localhost (R-077) |

### 3b. The one remaining code change — this is the part that bites

**(1) The tool IDs — `web/src/lib/vapi/assistantConfig.ts:26-27`**

```ts
export const DENKU_TOOL_IDS = [
  "6c9b0279-dd71-4511-827f-a3e75b884773", // create_ticket
  "5373add8-b7d2-49f0-a866-f60167a1e624", // create_appointment
] as const;
```

These UUIDs belong to the **old** account. In the new one you must create both tools by hand, then
paste the new ids here. Each tool is an HTTP request tool:

| Tool | URL | Header |
|---|---|---|
| `create_ticket` | `{VAPI_WEBHOOK_BASE_URL}/api/tools/create-ticket` | `x-denku-secret: <DENKU_TOOL_SECRET>` |
| `create_appointment` | `{VAPI_WEBHOOK_BASE_URL}/api/tools/create-appointment` | `x-denku-secret: <DENKU_TOOL_SECRET>` |

Get the parameter schemas from the two route handlers (they validate with zod at the edge).

**(2) The demo assistant id — ✅ FIXED 2026-08-25, no longer a code change**

`DemoCallButton.tsx` used to carry `'155b21ad-…'` as a literal in a **client component** — with no
environment override, and duplicating the constant in `api/vapi/start/route.ts` whose own comment
says it must not reach the client bundle. Switching accounts would have left the button rendering
normally and failing silently on every click.

It now fetches the id from `POST /api/vapi/start`, which honours `VAPI_DENKU_ASSISTANT_ID`.
**Setting that env var is all the demo needs.** (`VAPI_AGENT_ID` is dead and no longer read —
see `skills/deployment-and-environments.md` for why it was renamed rather than reused.)

### 3c. After switching

1. Redeploy (the code changes require it).
2. `POST /api/internal/reconcile-vapi-assistants` (Basic Auth) — re-applies `server.url` + the
   `x-vapi-secret` header + tool ids to every assistant.
3. Buy a number in the new account and connect it through the product, not the Vapi dashboard.
4. Re-verify webhook auth in **observe** mode before re-enforcing (§4 step 5).

---

## 4. The launch sequence for tomorrow

Ordered so that every step is verifiable and the risky ones come before the customer.

| # | Step | Done when |
|---|---|---|
| 1 | **Backup**, then run the reset script (§2) + clean Vapi/Stripe/Auth | Step 4 of the script shows tenant rows 0, seed rows unchanged |
| 2 | **Merge Sprint 9–14 to `main`** (PR from `feat/sprint-9-one-product`) and deploy | Vercel build green |
| 3 | **Set env** per Launch Runbook Phase 2 — especially `OPENAI_API_KEY` (without it intent falls back to regex and the preflight only *warns*), `NEXT_PUBLIC_SUPPORT_EMAIL` to a monitored inbox, and **rotate `ADMIN_USER`/`ADMIN_PASS`** | `/admin/readiness` baseline recorded |
| 4 | **Reconcile assistants** — `POST /api/internal/reconcile-vapi-assistants` | No assistant points at localhost |
| 5 | **Sign up fresh → onboarding → activate → connect a number → place a real call.** This is the DoD run | Call becomes a **ticket or appointment**; recording plays; owner gets the email |
| 6 | **Ask for an appointment on a second call** — the path that has never run in production | An `appointments` row exists with `[INTENT_DETECTED] source: llm` |
| 7 | Webhook: confirm `[VAPI][WEBHOOK][AUTH][…][OK]` in the logs, **then** `VAPI_WEBHOOK_AUTH_MODE=enforce` | Forged requests 401; real calls unaffected |
| 8 | `BILLING_NOTIFICATIONS_ENABLED=true`, register the crons with `CRON_SECRET`, then `ARTIFACT_NOTIFICATIONS_ENABLED=true` | A threshold alert fires |
| 9 | `PLATFORM_UX_ENABLED=true` → walk Home / Inbox / CRM / AI Team | Rollback = unset the variable |
| 10 | `PLATFORM_MODEL_ENABLED=true` → place one more call | A `conversations` row appears and `calls.conversation_id` is set |
| 11 | **Then** onboard the customer | — |

**Steps 5 and 6 are the ones that matter.** Everything else is reversible in a minute; those two are
the first evidence in six months that the product does what the site says.

## 5. Known gaps to be aware of on day one

- ✅ **R-135 — fixed 2026-08-25.** A Spanish employee now actually gets a Spanish voice and a
  Spanish transcriber. The language picker also dropped French, German and Turkish: voice and
  transcriber defaults exist only for English and Spanish, so those three delivered an
  English-speaking employee while the UI claimed otherwise. **Denku speaks English and Spanish —
  say exactly that, and nothing more.**
- **R-030 — rate limiting is an in-memory Map**, a no-op on Vercel. Fine for one customer; fix before
  any public demo endpoint.
- **Instagram is receive-only** and gated on Meta review — do not sell it.
- **Appointments are requests, not calendar bookings** (R-020). Say so plainly; do not imply Google
  Calendar sync exists.
- **Counsel review is still owed** on the replacement marketing copy (the false SOC 2 / HIPAA claims
  are removed; what replaced them has not been reviewed).
