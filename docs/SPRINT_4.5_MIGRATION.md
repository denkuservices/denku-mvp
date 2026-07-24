# Sprint 4.5 — Migration & Rollback Runbook (Platform Foundation)

> Operator guide for applying the platform-model foundation. **Every change is additive,
> non-breaking, and RLS-locked; the shared-model dual-writes are gated OFF by default.** So
> applying the migrations changes nothing customer-facing until `PLATFORM_MODEL_ENABLED` is
> flipped. Read `skills/platform-architecture.md` for the model; this is the how-to-ship.

## What ships

**4 additive migrations** (apply in filename order — they FK-reference each other):

| # | File | Adds |
|---|---|---|
| 1 | `20260724000000_platform_employee_channels.sql` | `employee_channels` (Employee↔Channel map) |
| 2 | `20260724000100_platform_contacts.sql` | `contacts`, `contact_identities`, `leads.contact_id` |
| 3 | `20260724000200_platform_conversations_messages.sql` | conversations/messages adoption columns + idempotency indexes + `calls.conversation_id` + IG back-links; **enables RLS on conversations/messages** |
| 4 | `20260724000300_platform_artifacts.sql` | `tickets/appointments` conversation_id/contact_id + `artifacts` view |

**Code** (already merged, inert until the flag): `web/src/lib/platform/*`, the flagged
dual-writes in the Vapi + Instagram webhooks, and the fixed `/api/conversations/*` routes.

## Pre-apply facts (verified 2026-07-24, read-only prod)

- `conversations` and `messages` are **EMPTY (0 rows)** → zero data-migration risk.
- `conversation_messages` (referenced by the old message route) **does not exist** — that
  route was dead; it now targets `messages`.
- Migration 3 **enables RLS** on `conversations`/`messages`. The two `/api/conversations/*`
  routes were converted to the service-role admin client (with explicit org checks) in the
  same change, so they keep working under RLS. Verify (step 4) after applying.

## Apply procedure

1. **Apply the 4 migrations** via the normal migration path (Supabase SQL / CI), in order.
   All statements are `IF NOT EXISTS` / `CREATE OR REPLACE` — safe to re-run.
2. **Verify schema:**
   - `employee_channels`, `contacts`, `contact_identities` exist and are RLS-enabled.
   - `conversations`/`messages` have the new columns; `select relrowsecurity from pg_class
     where relname in ('conversations','messages')` → both `true`.
   - `select * from public.artifacts limit 1` returns (view resolves).
   - Re-run the Supabase `rls_disabled` advisor → conversations/messages no longer listed.
3. **Leave `PLATFORM_MODEL_ENABLED` unset (OFF).** Confirm a live/demo call still creates a
   ticket/appointment exactly as before and the IG Test webhook still 200s — i.e. **nothing
   changed** with the flag off. This is the non-breaking checkpoint.
4. **Verify the conversations routes under RLS** (optional, they are experimental): an
   authenticated `POST /api/conversations/start` returns an id; `POST /api/conversations/message`
   appends to `messages` (not the old phantom table).

## Enable the dual-writes (when ready)

5. Set **`PLATFORM_MODEL_ENABLED=true`** in Vercel (all envs you want mirrored) and redeploy.
6. **Voice check:** place a test call → confirm a `conversations` row (`channel='voice'`,
   `external_thread_id = vapi_call_id`), per-turn `messages`, `calls.conversation_id` set,
   and the created ticket/appointment has `conversation_id` set. The legacy `calls` row and
   artifact are unchanged.
7. **Instagram check:** on a signed IG **Test** message event (Dev Mode), confirm a
   `conversations` row (`channel='instagram'`) + a `messages` row; raw `instagram_webhook_events`
   still persisted as before. (Real IG delivery still needs Meta Live Mode — unrelated.)
8. **Backfill (separate, reviewed step — NOT automatic):** populate `employee_channels` from
   existing `phone_lines`/`instagram_connections`, and `leads.contact_id`. Tracked as **R-081**.
   Do this as its own migration/script after the dual-writes are verified — never blindly.

## Rollback

Rollback is safe at every stage because everything is additive and gated.

- **Disable behavior instantly (no deploy of code):** unset/`false` `PLATFORM_MODEL_ENABLED`
  → dual-writes stop; legacy paths were never altered. This is the first-line rollback.
- **Revert schema (if ever needed):** each migration file ends with an explicit `ROLLBACK:`
  block (drop the columns/tables/view; optionally `DISABLE ROW LEVEL SECURITY` on
  conversations/messages to restore their prior state). Because the tables were empty and
  unread at apply time, dropping the additive columns/objects loses no customer data.
- **Code:** the platform lib + wiring are inert with the flag off; no need to revert code to
  stop the behavior. If desired, revert the Sprint-4.5 `feat(platform)` commits — the only
  non-additive code change is the two `/api/conversations/*` routes (which were dead/broken
  before and are strictly improved).

## Non-goals (do not do in this activation)

- Do **not** point any dashboard/read path at `conversations` yet (read cutover = later sprint).
- Do **not** enable in prod before a staging/preview verification of steps 5–7 — a staging
  env is the standing prerequisite (carried from the Sprint-3 activation gap).
