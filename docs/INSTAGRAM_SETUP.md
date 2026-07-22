# Instagram Foundation — Operator Setup (Sprint 1.5)

The code shipped in Sprint 1.5 is dormant until an operator completes these external steps. Nothing
here is code; it's Meta-dashboard + Vercel + Supabase configuration. How it all works:
`skills/instagram-integration.md`.

## 1. Create the Meta app

1. In [developers.facebook.com](https://developers.facebook.com) → **Create App** → use case that
   provides **Instagram API with Instagram Login** (Business). Add the **Instagram** product.
2. Under Instagram → **API setup with Instagram login**, note the **Instagram App ID** and
   **Instagram App Secret**.
3. **Valid OAuth Redirect URIs:** add exactly `https://<your-domain>/api/instagram/oauth/callback`
   (must match `INSTAGRAM_OAUTH_REDIRECT_URI` byte-for-byte). Use the canonical prod host — for this
   deploy that's `https://www.denku.io/...` (the apex `denku.io` 307-redirects to `www`, which drops
   OAuth params, so use `www`).
4. Request the scopes the app uses: `instagram_business_basic`, `instagram_business_manage_messages`
   (App Review required before non-testers can grant them).

## 2. Configure the webhook (in the Meta app)

- **Callback URL:** `https://www.denku.io/api/webhooks/instagram`
- **Verify token:** any strong random string — must equal `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` in Vercel.
- Subscribe to the Instagram fields you want to receive (e.g. `messages`, `comments`). Meta will call
  `GET` to verify (expects the challenge echoed) — our endpoint handles it.

## 2b. Deauthorize + Data Deletion callbacks (required by Meta)

In **Business Login settings** (and/or App → Settings → Basic → User Data Deletion), set:

- **Deauthorize callback URL:** `https://www.denku.io/api/instagram/deauthorize`
- **Data Deletion Request URL:** `https://www.denku.io/api/instagram/data-deletion`

Both receive a Meta `signed_request` (HMAC-SHA256 with the **app secret** — the same
`INSTAGRAM_APP_SECRET`). Deauthorize revokes the connection; Data Deletion hard-deletes the
account's connection + persisted events and returns a status URL + confirmation code (viewable at
`https://www.denku.io/instagram-data-deletion?code=…`). No extra env vars needed beyond
`INSTAGRAM_APP_SECRET`.

## 3. Set env vars in Vercel (Production)

| Var | Value |
|---|---|
| `INSTAGRAM_APP_ID` | Instagram App ID |
| `INSTAGRAM_APP_SECRET` | Instagram App Secret (also signs webhooks) |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | the verify token you set in step 2 |
| `INSTAGRAM_OAUTH_REDIRECT_URI` | `https://www.denku.io/api/instagram/oauth/callback` (exact) |
| `INSTAGRAM_TOKEN_ENCRYPTION_KEY` | 32-byte key, base64 — generate: `openssl rand -base64 32` |
| `INSTAGRAM_SCOPES` | *(optional)* override the default scope list |

⚠ `INSTAGRAM_TOKEN_ENCRYPTION_KEY` encrypts stored tokens. **If you rotate it, existing stored tokens
become undecryptable** (connections must reconnect). Store it as carefully as any secret.

## 4. Apply the database migration

`supabase/migrations/20260708120000_instagram_foundation.sql` creates `instagram_connections` and
`instagram_webhook_events` (both RLS-locked, service-role only). Apply it to the **live Supabase
project** (the repo can't reach it, and the workspace MCP points at the wrong project — apply via the
Supabase SQL editor or CLI against the correct project).

## 4b. Webhook subscription (required — or Meta sends nothing)

Two things must both be true for events to arrive:
1. **App-level field subscription** (Meta dashboard → Instagram → Webhooks): subscribe `messages`
   (and `comments` if you use it). Confirm they show **Subscribed**.
2. **Account-level subscription** (`/subscribed_apps`): done automatically on OAuth. For accounts
   connected *before* this shipped, run the backfill (no reconnect needed):
   ```
   curl -X POST https://www.denku.io/api/instagram/subscribe -u "$ADMIN_USER:$ADMIN_PASS"
   ```
   Returns `{ ok, total, subscribed, results: [{ orgId, ok, fields, error }] }`.
   Comments also require the `instagram_business_manage_comments` scope — add it to
   `INSTAGRAM_SCOPES` and **reconnect** the account.

## 5. (Optional) Wire the token-refresh cron

Long-lived tokens expire in ~60 days. Add a daily Vercel cron (or GitHub Action) that
`POST`s `https://www.denku.io/api/instagram/refresh` with Basic Auth (`ADMIN_USER`/`ADMIN_PASS`).
Without it, connections must be manually reconnected before expiry.

## 6. Verify end-to-end

1. Dashboard → **Instagram** → **Connect Instagram** → complete Meta login → expect
   `?connected=1` and a "Connected" card with the account handle.
2. From Meta's webhook UI, send a test event → confirm a row in `instagram_webhook_events` and a
   `[INSTAGRAM][WEBHOOK][RECEIVED]` log line.
3. Confirm forged POSTs (bad/no `X-Hub-Signature-256`) get **401** and persist nothing.

Until steps 1–4 are done, the dashboard shows an "Instagram is not configured" notice and the
Connect button is inert — by design (fail-safe, never fake).

## 6b. Verify the receive pipeline in Development Mode — and the real-delivery gate

**Authoritative Meta rule:** while the app is **unpublished (Development Mode)**, Meta delivers
**only the dashboard "Test" webhook events**. *No real production data — including from app Admins,
Developers, or Testers — is delivered until the app is published (Live).* (Meta Instagram Platform →
Webhooks: *"Apps must be set to Live in the App Dashboard to receive webhook notifications."*) So a
**real Tester DM will NOT arrive** in Development Mode — this is expected, not a bug.

**What you CAN verify now (and what was verified 2026-07-22):** the full receive pipeline, using
Meta's **Test webhook**:

1. Meta App Dashboard → **Instagram → Webhooks**: callback = `https://www.denku.io/api/webhooks/instagram`
   (status **Verified**), and the `messages` field shows **Subscribed** at the app level. Confirm the
   account is also subscribed at the account level (auto at OAuth / `POST /api/instagram/subscribe`).
2. Click **Test** on the `messages` webhook field.
3. Confirm a row in `instagram_webhook_events` (`signature_valid = true`) and a
   `[INSTAGRAM][WEBHOOK][RECEIVED]` log line. *(The Test payload is synthetic — `entry.id: "0"`, so
   `org_id` is null and it classifies as `changes`; that is correct. A real DM would arrive in the
   `messaging` array with the real `ig_user_id` and resolve the org — but only once the app is Live.)*
4. Benign hardening check: GET with a wrong `hub.verify_token` → **403**; unsigned POST → **401**.

**To receive REAL Instagram DM webhooks you must publish the app**, which for the messaging permission
requires **Business Verification + App Review (Advanced Access for `instagram_business_manage_messages`)
+ Live Mode**. This is an external Meta platform dependency, not a Denku code issue. Full dossier +
readiness verdict: `docs/META_APP_REVIEW_PACKAGE.md`.
