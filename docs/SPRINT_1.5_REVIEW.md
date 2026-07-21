# Sprint 1.5 Review — Instagram Foundation

- **Sprint:** 1.5 (inserted between Sprint 1 and Sprint 2) · **Executed:** 2026-07-08
- **Type:** infrastructure sprint (not a feature/product sprint; not an "Instagram agent")
- **Verdict:** **Code-complete and shipped** — all in-scope items built, CI-green, deployed. Like
  Sprint 1, final activation is **operator-gated** (Meta app + env + migration); documented in
  `docs/INSTAGRAM_SETUP.md`.

## Decision context

Follows the architecture review that **rejected building a generic multi-channel framework now**.
Sprint 1.5 honors that: everything here is **Instagram-specific and additive**, mirroring the
existing Vapi pattern (a webhook + a raw-event table), with **no** generic Channel/Conversation
abstraction, **no** conversation-model redesign, and **no** billing/voice changes. If/when a second
channel is funded, the generic model gets revisited then — from two real examples, not one.

## Planned vs delivered (scope was explicit)

| In-scope item | Delivered |
|---|---|
| 1. Dashboard foundation (first-class, status only) | ✅ `Instagram` sidebar item + `/dashboard/instagram` (status, connect/disconnect) |
| 2. Instagram OAuth (Meta Business Login) | ✅ `/api/instagram/oauth/start` + `/callback` (Instagram Business Login; code→short→long-lived) |
| 3. Credential management (per-company, secure, refresh) | ✅ `instagram_connections` (per-org, RLS-locked); AES-256-GCM token encryption; `/api/instagram/refresh` |
| 4. Webhook infra (verify, receive, signature, logging) | ✅ `/api/webhooks/instagram` — GET challenge, POST signature-enforced, structured `[INSTAGRAM][WEBHOOK][…]` logs |
| 5. Event persistence (debug/future, no logic) | ✅ `instagram_webhook_events` (RLS-locked); `processed=false` reserved for a future processor |

**Out of scope — confirmed NOT built:** AI/comment replies, sales agent, rule engine, IdeaSoft,
inventory/product search, knowledge base, multi-channel abstraction, conversation redesign, billing.

## Architecture fit (no speculative abstraction)

- New webhook parallels the Vapi one; new tables parallel `webhook_debug` (RLS service-role only).
- Reused existing seams: service-role admin client, org resolution, Basic-Auth internal-endpoint
  pattern (`/api/instagram/refresh` like `/api/internal/*`), the `next.config` security headers,
  the R-037 test harness.
- Net-new patterns introduced deliberately (and only because Instagram *requires* them):
  **per-tenant OAuth credentials** (voice uses one global Vapi account) and **app-layer token
  encryption**.

## Metrics

| Metric | Value |
|---|---|
| New source modules | 11 (3 security libs, config/client/connections, 4 routes, page/card/action) |
| New tables (migration) | 2 (both RLS-locked, service-role only) |
| Tests | +9 (signature verify, OAuth state, token crypto) → **51 total**, green |
| New env vars | 5 (+1 optional) |
| Build / lint | compiles; new files lint clean (0 `any`) |
| Regressions | 0 — voice/billing untouched; additive only |

## Remaining (operator-gated — see `docs/INSTAGRAM_SETUP.md`)

1. Create the Meta app; set the 5 `INSTAGRAM_*` env vars in Vercel.
2. Apply `supabase/migrations/20260708120000_instagram_foundation.sql` to the live DB.
3. Configure + subscribe the Meta webhook (callback URL + verify token).
4. (Optional) wire a daily Vercel cron → `POST /api/instagram/refresh` for token refresh.
5. Verify end-to-end (connect a real account; send a test event; confirm forged POST → 401).

## Risks / notes

- **App Review gate:** Meta requires app review before non-tester businesses can grant the scopes —
  an external timeline, not a code item.
- **Encryption key custody:** rotating `INSTAGRAM_TOKEN_ENCRYPTION_KEY` invalidates stored tokens
  (documented) — treat as a real secret.
- **Apex vs www:** OAuth redirect + webhook must use `www.denku.io` (apex 307-redirects, dropping
  OAuth params) — captured in the setup guide.

## Recommendation

Ship the operator setup when ready, then **return to Sprint 2 ("Trust & Value Made Visible")** as
planned — it remains the proposed next sprint and is unaffected by this insertion.
