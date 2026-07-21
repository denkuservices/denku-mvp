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

## Data model (both RLS-locked, service-role only)

- **`instagram_connections`** — one per org (`unique(org_id)`): `ig_user_id`, `username`,
  `account_type`, `access_token_encrypted` (never plaintext), `token_expires_at`, `scopes`,
  `status` (`connected|revoked|error`), `connected_by`, timestamps.
- **`instagram_webhook_events`** — raw persisted events: `org_id`(nullable), `object`, `entry_id`,
  `ig_user_id`, `event_type`, `payload jsonb`, `headers`, `signature_valid`, `processed`(default
  false), `received_at`.

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
