# Bring-Your-Own-Number (BYON) over SIP

Goal: let a customer bring a phone number they already own via SIP and have it answered by their
Vapi assistant, alongside the managed (Twilio-backed) numbers. Build as an **additive, flag-gated
adapter** — never modify the existing managed purchase happy-path (CLAUDE.md: new capability =
adapter + table + registry line, additive/flagged).

## Current phone system (what BYON sits beside)
- Two provisioning paths, both hardcode `provider:"vapi"` and are US-only: onboarding
  `runActivation` (`onboarding/_actions.ts:1025`) and `POST /api/phone-lines/purchase`
  (`purchase/route.ts:374-381`, rejects non-US at `:62`, area-code 321 fallback).
- Routing truth: the phone number's `assistantId` is the ONLY thing that routes calls; pause/resume
  PATCH it to null/back (`lib/vapi/phoneNumberBinding.ts:97-100,347-350`).
- `phone_lines` (`baseline_schema.sql:1352-1365`): `vapi_phone_number_id text NOT NULL`,
  `phone_number_e164 text NOT NULL`, `line_type CHECK IN (support|sales|after_hours)`,
  `assigned_agent_id`, `vapi_assistant_id`, pause-backup — **no** `provider`/`sip`/`credential_id`.
- Every add-a-number increments the `extra_phone` Stripe add-on (`purchase/route.ts:149-171`);
  delete decrements if over `included_phones`. Compensation chain Stripe→Vapi→DB on every failure.
- `vapiFetch` (`lib/vapi/server.ts`) already POSTs arbitrary bodies — no client change needed.
- Grep `sip-trunk|byo-phone-number|credentialId|twilio` = 0 hits (only display-only `phone_number_sip_uri`).

## Build plan (priority order)

1. **Data model (M).** One additive migration:
   - `phone_lines`: add `provider text DEFAULT 'vapi' CHECK IN ('vapi','byo_sip')` + nullable
     `vapi_credential_id text`; relax `phone_number_e164`/`vapi_phone_number_id` NOT-NULLs only as needed
     (Vapi still issues a `phoneNumberId` for a BYO number, so `vapi_phone_number_id` can usually stay).
   - New **`byo_sip_connections`** table (org_id, vapi_credential_id, sip_gateway, sip_username,
     `sip_password_encrypted`, e164, status, connected_by, timestamps). **RLS enabled, NO policies =
     service-role only**, mirroring `instagram_connections`/`telegram_connections`. **Never** put SIP
     secrets in RLS-readable `phone_lines`. Prefer storing ONLY `vapi_credential_id` and letting Vapi
     hold the SIP password (safer — confirm against Vapi's credential API).
2. **Vapi helper (L).** New `lib/vapi/byoSip.ts`: `createSipCredential` (`POST /credential`, a SIP/BYO
   trunk credential → `credentialId`), `createByoPhoneNumber`
   (`POST /phone-number { provider:'byo-phone-number', number:<E.164>, credentialId, assistantId }`),
   and delete counterparts. **Verify the exact provider strings + credential shape against current
   Vapi BYO/SIP-trunk docs before coding.** Route the backing assistant through the existing
   `ensureAssistantConfig` so BYON numbers get tools + webhook events identically to managed.
3. **Route (L).** New `POST /api/phone-lines/byo-sip` (or a credentials-style channel-connect route
   mirroring telegram/email): zod-validate customer E.164 + trunk creds, call the Vapi helpers, attach
   assistant via `ensureAssistantConfig`, insert `phone_lines` row with `provider='byo_sip'`. Same
   Stripe→Vapi→DB compensation discipline as purchase. **Gate behind `BYON_SIP_ENABLED`.** Keep the
   managed `/purchase` path byte-for-byte.
4. **Billing decision (owner, M).** Is a BYON number charged a per-number platform fee, metered
   minutes-only, or free? Note minutes/overage already meter channel-agnostically off `calls`, so only
   the per-number fee is open. Either (a) reuse `extra_phone` (simplest, keeps rebind-limit +
   `included_phones` working) or (b) add a distinct `byo_phone` addon_key (touch `limits.ts:53-60`,
   `addons/update` zod enum, summary route). Decide if BYON counts toward the rebind cap
   (`phoneNumberBinding.ts:290`).
5. **Security (M).** SIP trunk auth is a secret like an OAuth token: encrypt at rest via
   `lib/crypto/secretBox.ts`, handle only in service-role code. Prefer credential-id-only storage.
6. **UI (M).** A "Bring your own number" branch/card (only when the flag is on), collecting E.164 +
   SIP gateway/host + optional username/password + instructions (customer points their carrier's SIP
   trunk at Vapi inbound). Ideally via the channel `connection:'credentials'` pattern
   (`lib/platform/channels.ts:145-172`) rather than bolting onto the managed modal.
7. **Lifecycle.** Extend pause/resume (`phoneNumberBinding.ts`) and delete (`[lineId]/route.ts`) to
   also release the Vapi credential for BYON lines. Add a channel-contract-style test asserting BYON
   numbers ingest + route like managed ones.

**Key files:** `api/phone-lines/{purchase,[lineId],available-numbers}/route.ts`,
`AddPhoneNumberModal.tsx`, `lib/vapi/{server,assistantConfig,phoneNumberBinding}.ts`,
`lib/billing/limits.ts`, `api/billing/addons/update/route.ts`, `onboarding/_actions.ts`,
`lib/platform/channels.ts`, `supabase/migrations/`, `skills/vapi-integration.md`, `skills/database-schema.md`.
