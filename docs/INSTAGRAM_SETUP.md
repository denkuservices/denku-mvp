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
