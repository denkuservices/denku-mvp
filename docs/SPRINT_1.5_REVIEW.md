# Sprint 1.5 Review — Instagram Foundation

- **Sprint:** 1.5 (inserted between Sprint 1 and Sprint 2) · **Executed:** 2026-07-08 ·
  **Closed:** 2026-07-22 (see the [Closure addendum](#addendum--2026-07-22-closure-verification--post-review-work) at the bottom)
- **Type:** infrastructure sprint (not a feature/product sprint; not an "Instagram agent")
- **Verdict:** **Code-complete and shipped** — all in-scope items built, CI-green, deployed. Like
  Sprint 1, final activation is **operator-gated** (Meta app + env + migration); documented in
  `docs/INSTAGRAM_SETUP.md`.
- ⚠️ **Metrics below (§Metrics) predate 2026-07-08 follow-on work** (compliance callbacks,
  `/subscribed_apps` subscription + backfill, a third table). The Closure addendum has corrected
  figures and the End-to-end verification status.

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

---

## Addendum — 2026-07-22: closure verification & post-review work

Written to officially close Sprint 1.5. Covers (a) work that landed *after* the 2026-07-08 review,
(b) corrected metrics, (c) the Development-Mode webhook finding that unblocks verification, and
(d) the objective closure verdict.

### (a) Post-review work (commits after this review was written)

| Commit | What | Note |
|---|---|---|
| `42da97a` | Meta **deauthorize + data-deletion** callbacks (`signed_request`) + public deletion status page | Compliance; a **third** table `instagram_data_deletion_requests` (migration `20260708130000`) |
| `4fee772` | Applied Instagram migrations to **prod**; corrected a bad `update_updated_at_column` assumption | The migration defines its own `instagram_set_updated_at()` (no shared helper exists in this DB) |
| `0d5e7af` | Auto-subscribe on OAuth via `POST /{ig-user-id}/subscribed_apps` + Basic-Auth **backfill** endpoint | Without this, Meta delivers nothing even after OAuth — see `skills/instagram-integration.md` |
| `5e15d60` | **TEMP** admin-only dashboard button to run the subscribe backfill (operator has no terminal) | Self-marked temporary; **tech debt → R-078**, remove after §(c) verification |

### (b) Corrected metrics (supersede the §Metrics table)

| Metric | Review said | Actual (2026-07-22) |
|---|---|---|
| New tables | 2 | **3** (`instagram_connections`, `instagram_webhook_events`, `instagram_data_deletion_requests`) |
| Tests | 51 total | **58** total, green |
| Routes | 4 | **7** (OAuth start/callback, refresh, subscribe, deauthorize, data-deletion, webhook) |
| Regressions | 0 | **0** (voice/billing still untouched) |

### (c) Production verification + the authoritative Meta delivery rule (CORRECTED 2026-07-22)

The open DoD item was: has a real webhook event been observed landing in `instagram_webhook_events`?
This was verified **directly against production** (Denku Supabase project `kebqwsdguxxjsijahrox` +
Vercel deployment `dpl_9ND5…`, live evidence, not inference). Two things were established:

**1. The receive infrastructure is operationally verified.** Meta's **signed Test webhook** (fired
from the App Dashboard → Instagram → Webhooks) was observed completing the **entire** production
pipeline on 2026-07-22:
- Meta delivery → `POST /api/webhooks/instagram` **200** (14:04:18Z, 14:04:23Z),
- `X-Hub-Signature-256` verified (`signature_valid = true`),
- persisted (2 rows in `instagram_webhook_events`),
- logged `[INSTAGRAM][WEBHOOK][RECEIVED]` in Vercel.
Endpoint health independently confirmed by benign probe (GET wrong-token → 403; unsigned POST → 401,
not 503 → env present + signature enforced). **The pipeline works end-to-end in production.**

**2. Real Instagram DM delivery is gated by Meta, not by our code.** A **real** DM from a Tester
account (@adkirikci → @minosandco) was **never delivered** — no row, no log — while the synthetic
Test event delivered fine. This is exactly Meta's documented, authoritative platform behavior, stated
verbatim in the App Dashboard and confirmed in Meta's Instagram Platform → Webhooks docs
(*"Apps must be set to Live in the App Dashboard to receive webhook notifications"*):

> *"No production data, including from app admins, developers or testers, will be delivered unless
> the app has been published."*

**⚠️ Corrects an earlier draft of this addendum**, which claimed Development Mode delivers real
webhooks for Tester interactions (sourced from community forums describing the older Instagram-via-
Facebook-Login flow). That is **wrong** for the Instagram-API-with-Instagram-Login flow Denku uses.
The authoritative rule: **Development Mode delivers ONLY dashboard Test events; real production data
— including from Testers/Admins — is withheld until the app is published (Live).** Receiving real
Instagram DM webhooks requires **Business Verification + App Review (Advanced Access for
`instagram_business_manage_messages`) + a published/Live app** — an **external Meta platform
dependency, not a Denku implementation defect.** Path + dossier: `docs/META_APP_REVIEW_PACKAGE.md`.

### (d) Objective closure verdict

**Sprint 1.5 is CLOSED — code-complete, architecturally sound, shipped, and the receive
infrastructure is operationally verified in production via Meta's signed Test webhook.** The
engineering scope (connect · encrypted per-tenant creds · signed receive-only webhook · dashboard ·
compliance callbacks · subscription plumbing) is fully delivered and CI-green (58 tests), and the
end-to-end receive path (delivery → signature verify → persist → log → 200) is proven with real
production evidence.

- **Operationally verified (✅):** the full receive pipeline, using Meta's signed Test event
  (§(c).1). Endpoint reachability, signature enforcement, persistence, and logging all confirmed.
- **External platform dependency (not a Sprint 1.5 defect):** real end-user Instagram DM delivery
  requires **Business Verification + App Review + Live App / Advanced Access** (§(c).2). This is a
  Meta gate, outside Sprint 1.5's infrastructure scope, and matches the boundary documented in
  `docs/META_APP_REVIEW_PACKAGE.md`. It does **not** hold the sprint open.
- **Not a Sprint 1.5 item:** the demonstrable messaging UI / opt-out needed to *pass* App Review for
  `instagram_business_manage_messages` — future Instagram messaging epic.

### Follow-ups filed

- **R-078** — remove the TEMP dashboard subscribe button after §(c) verification (clean revert).
- **R-079** — OAuth callback persists the *requested* scopes, not the *granted* ones (`short.permissions`
  is available but unused); a partial grant would store wrong scopes and mis-drive `subscribed_fields`.

**Sprint 2 ("Trust & Value Made Visible") remains PROPOSED and unchanged** — see `CURRENT_SPRINT.md`.
