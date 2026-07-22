# Skill: Instagram integration (channel foundation)

> Denku's first non-voice channel (Sprint 1.5). **Foundation only:** connect an Instagram
> Business account, receive + persist webhook events. **No reply logic, no AI, no rules** — that is
> future epics. Deliberately Instagram-specific (no generic multi-channel abstraction) so it slots
> into the existing architecture without speculative rework. Operator setup: `docs/INSTAGRAM_SETUP.md`.

## What exists (and what doesn't)

- **Does:** Meta Business Login (OAuth), per-org encrypted credential storage, token refresh, a
  signed+verified webhook that persists raw events, a first-class `Instagram` dashboard page.
- **Does NOT:** send/reply, comment automation, AI processing, conversation model, billing. The
  `instagram_webhook_events.processed` flag is reserved for a future processor that does not exist.

## Flow: connecting an account (OAuth)

Uses **Instagram API with Instagram Login** (Business Login — connects an IG Business account
directly, no Facebook Page step). Endpoints/config in `lib/instagram/config.ts`.

1. `GET /api/instagram/oauth/start` — session-authed, owner/admin. Resolves org → signs a CSRF
   `state` (`lib/instagram/state.ts`, HMAC of `{orgId,nonce,exp}` with the app secret) → redirects
   to Meta's authorize dialog.
2. Meta → `GET /api/instagram/oauth/callback?code&state`. Verifies state, **re-resolves org from the
   session and requires it to equal the state's org** (defense in depth), then via
   `lib/instagram/client.ts`: `code → short-lived → long-lived token (~60d) → GET /me`.
3. Persists via `lib/instagram/connections.ts#upsertConnection` — the access token is **encrypted
   (AES-256-GCM, `lib/crypto/secretBox.ts`) before insert**. Redirects to `/dashboard/instagram?connected=1`.

Errors always redirect back to `/dashboard/instagram?error=<code>` (friendly copy in the card) —
never a stack trace.

## Webhook subscription (REQUIRED for delivery)

After OAuth, Meta delivers **no** events until the account is subscribed to the app's webhooks via
`POST /{ig-user-id}/subscribed_apps` — this is separate from granting permissions. The OAuth
callback now does this automatically (`lib/instagram/subscribe.ts#subscribeInstagramAccount`),
subscribing only the fields the granted scopes back (`subscribedFieldsForScopes`: `messages` ←
`…manage_messages`, `comments` ← `…manage_comments`). Result is recorded in the connection's `meta`
jsonb (`webhook_subscribed`, `subscribed_fields`, or `subscribe_error`).

- **Backfill (no reconnect):** `POST /api/instagram/subscribe` (Basic Auth) subscribes every
  already-connected account. Idempotent; returns per-org `{ ok, fields, error }`. Use it for
  accounts connected before this shipped.
- **Two-sided requirement:** the app must ALSO have the field subscribed at the **app level** in the
  Meta dashboard (Instagram → Webhooks). Account-level `subscribed_apps` + app-level field
  subscription must both be present. Comments need the `instagram_business_manage_comments` scope
  (reconnect to add it).

### Development Mode vs Live: real webhook delivery is gated (authoritative)

**While the app is unpublished (Development Mode), Meta delivers ONLY the dashboard "Test" webhook
events. No real production data — including from app Admins, Developers, or Testers — is delivered
until the app is published (Live).** Meta first-party sources: the App Dashboard banner (*"…No
production data, including from app admins, developers or testers, will be delivered unless the app
has been published."*) and Instagram Platform → Webhooks (*"Apps must be set to Live in the App
Dashboard to receive webhook notifications."*).

**Verified against Denku production 2026-07-22:** Meta's signed **Test webhook** completed the full
pipeline (delivery → `X-Hub-Signature-256` verify → persist → `[INSTAGRAM][WEBHOOK][RECEIVED]` → 200,
observed in DB + Vercel logs) — the **infrastructure is operationally verified**. A **real** Tester
DM (@adkirikci → @minosandco) was **never delivered** — exactly as the rule predicts. So real
Instagram DM delivery requires **Business Verification + App Review (Advanced Access for
`instagram_business_manage_messages`) + a published/Live app** — an **external Meta platform
dependency, not a Denku defect.** Dossier: `docs/META_APP_REVIEW_PACKAGE.md`; setup + Test-webhook
procedure: `docs/INSTAGRAM_SETUP.md` §6b.

⚠️ **Do not repeat the earlier mistake:** community forums (n8n/Bubble) claim Dev Mode delivers for
Tester interactions — that describes the **older Instagram-via-Facebook-Login** flow and is **wrong**
for the Instagram-API-with-Instagram-Login flow here. Trust the Meta first-party sources above.

⚠️ App Review also judges **demonstrable, user-visible** use of a permission; the receive-only
foundation has no messaging UI, so `instagram_business_manage_messages` is **not a strong submission
yet** — that surface is future messaging-epic work.

⚠️ **Scopes caveat (R-079):** the OAuth callback stores the *requested* scope list, not the scopes
Meta actually *granted* (`exchangeCodeForToken` returns `permissions`, currently unused). A partial
grant would store wrong scopes and make `subscribedFieldsForScopes` request an unbacked field,
failing the whole `/subscribed_apps` call. Persist the granted permissions when fixing.

⚠️ **TEMP button (R-078):** `InstagramConnectionCard` currently renders an "Operator · temporary"
subscribe button (commit `5e15d60`) because the operator has no terminal. Remove it (clean revert)
after the Dev-Mode verification passes; the Basic-Auth `POST /api/instagram/subscribe` is the
permanent operator path.

## Token refresh

Long-lived IG tokens last ~60 days and are refreshable. `POST /api/instagram/refresh` (Basic Auth,
like the billing/reconcile repair endpoints) refreshes connections within 10 days of expiry. **Wire
a Vercel cron to call it daily** (operator step — not yet wired). Idempotent; never throws.

## Webhook — `POST/GET /api/webhooks/instagram`

**Receive + persist only.** Unlike the Vapi webhook (R-001), Meta **always signs**, so signature
verification is **enforced from day one** (no staged rollout).

- `GET` — Meta verification handshake: echoes `hub.challenge` when `hub.verify_token` matches
  `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`; else 403.
- `POST` — reads the **raw body** (required for signature), verifies `X-Hub-Signature-256`
  (`lib/instagram/signature.ts`, HMAC-SHA256 with the app secret, constant-time). **Invalid/unsigned
  → 401, nothing persisted** (no forgery flooding the table). Valid → persists one
  `instagram_webhook_events` row per `entry` (best-effort org resolution by matching `entry.id` to a
  connection's `ig_user_id`), returns **200** (Meta disables endpoints that error). No business logic.

⚠ **Landmine:** signature verification needs the exact raw bytes — always `await req.text()` and
verify **before** `JSON.parse`. Don't read the body as JSON first.

## Meta compliance callbacks (`signed_request`, not X-Hub-Signature)

Required by Meta for Business Login / App Review. Both parse a Meta `signed_request`
(`lib/instagram/signedRequest.ts` — base64url `sig.payload`, HMAC-SHA256 with the **app secret**,
constant-time) — a **different** mechanism from the webhook's `X-Hub-Signature-256`.

- `POST /api/instagram/deauthorize` — user removed the app → `revokeByIgUserId` (clear token, mark
  revoked; keeps the row + events). Returns 200.
- `POST /api/instagram/data-deletion` — user requested deletion → `purgeByIgUserId` (hard-delete the
  connection **and** its persisted webhook events), records a status row, and returns Meta's required
  `{ url, confirmation_code }`. The `url` → the public status page
  `/(marketing)/instagram-data-deletion?code=…` (`getDeletionStatus`, service-role read by code).

Both are unauthenticated by session (Meta calls them) and verified by the signed_request signature.
Business Login settings: deauthorize `…/api/instagram/deauthorize`, data-deletion
`…/api/instagram/data-deletion`.

## Data model (all RLS-locked, service-role only)

- **`instagram_connections`** — one per org (`unique(org_id)`): `ig_user_id`, `username`,
  `account_type`, `access_token_encrypted` (never plaintext), `token_expires_at`, `scopes`,
  `status` (`connected|revoked|error`), `connected_by`, timestamps.
- **`instagram_webhook_events`** — raw persisted events: `org_id`(nullable), `object`, `entry_id`,
  `ig_user_id`, `event_type`, `payload jsonb`, `headers`, `signature_valid`, `processed`(default
  false), `received_at`.
- **`instagram_data_deletion_requests`** — Meta data-deletion status tracking: `confirmation_code`
  (unique), `ig_user_id`, `org_id`, `status` (`received|completed|failed`), `requested_at`,
  `completed_at`. Migration `20260708130000_instagram_data_deletion.sql`.

Both have **RLS enabled with NO policies** → only the service-role client can touch them (mirrors
`webhook_debug`). The dashboard reads a **token-free** `PublicConnection` view only.

## Security posture

- Per-tenant credentials (no global IG account) — each org connects its own via OAuth.
- Tokens encrypted at rest at the app layer (`INSTAGRAM_TOKEN_ENCRYPTION_KEY`) + service-role-only
  table + Supabase disk encryption. Tokens are **never** returned to the client or logged.
- Owner/admin only for connect/disconnect. Webhook enforces signatures. OAuth uses signed CSRF state.

## When you extend this (future epics)

- A processor reads `instagram_webhook_events WHERE processed=false`, does the work, sets
  `processed=true`. Keep the webhook itself receive-only.
- Sending replies needs `instagram_business_manage_messages` (already requested) + a send client —
  add to `lib/instagram/client.ts`.
- If/when a **second** channel is funded, revisit the generic Conversation model (see the archived
  architecture review) — do NOT retrofit a generic abstraction from Instagram alone.
