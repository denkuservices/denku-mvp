# Audit findings — 2026-08-31

Source: a 7-agent parallel audit of `web/` (branch `feat/landing-v3-p0`). Severity = blocker /
major / minor. Effort = S / M / L / XL. Every gap carries `file:line` evidence.

---

## 1. Voice AI end-to-end + self-serve setup

**Verdict:** the core voice path IS genuinely end-to-end and never dead-ends. Setup is self-serve
but thin, and there is **no knowledge/PDF upload of any kind**.

**What works**
- Onboarding provisions a live agent self-serve: `runActivation()` (`web/src/app/(app)/onboarding/_actions.ts:877`) creates the Vapi assistant, provisions a US number bound at create time (`:1064`), attaches tools + webhook via `ensureAssistantConfig`, flips `onboarding_step` to 6/Live. Idempotent/resumable, area-code 321 fallback.
- Post-activation editing at `/dashboard/team/[employeeId]` (`SetupForm.tsx`, `KnowledgeForm.tsx`): language, additional_languages, timezone, role, personality preset, first_message, emphasis_points, 8 business-context fields, raw system_prompt_override.
- Edits sync to the live Vapi assistant (`settings/_actions/agents.ts:264-303` → `ensureAssistantConfig` GET→merge→PATCH, keeps toolIds, sets voice/transcriber/caps/webhook).
- Prompt is built from business info (`prompt-derivation.ts:77-189`).
- Live pipeline never dead-ends: `api/webhooks/vapi/route.ts` classifies intent (`classifyCallIntent`, gpt-4o-mini+regex) then deterministically creates ticket OR appointment + lead — all idempotent by call_id.
- Marketing web-demo call works (`api/vapi/start`, Web SDK).

**Gaps**
| Sev | Eff | Gap | Evidence |
|---|---|---|---|
| major | L | **No knowledge base / PDF / document upload anywhere.** No `<input type=file>`, no Supabase storage bucket, no Vapi knowledgeBase/files API. "Knowledge" tab = 8 free-text fields folded into the prompt (faqs capped 4000, services 2000 chars). | `KnowledgeForm.tsx`; `setupFields.ts:19-55`; `settings/_actions/agents.ts:13-25`; repo-wide grep for knowledgeBase/upload/storage/pdf = no voice-path hits |
| major | M | **Onboarding never captures business info/greeting/personality.** `runActivation` uses a fixed generic English prompt; agent goes live nearly blank. | `onboarding/_actions.ts:972-989` |
| minor | M | **Dashboard "Test call" is a placeholder** — `alert("Test call coming soon")`. `?test=1` is never consumed. | `SuccessBanner.tsx:33-36`; `TestCallButton.tsx:13-20` |
| minor | S | Config edits sync to Vapi only if `vapi_assistant_id` present; on sync failure the row saves `ok:true` with `vapi_sync_status:"error:…"` → live assistant can silently stay stale. | `settings/_actions/agents.ts:264-303` |

---

## 2. Primary language → Voice agent language

**Verdict:** correctly wired **only** on the Settings→Agents edit path. The primary language does
NOT reliably determine the voice elsewhere. **Only `en`/`es` have a voice.**

**What works**
- `assistantConfig.ts` turns a language into a Vapi voice + transcriber (`resolveVoiceForLanguages`/`resolveTranscriberForLanguages`, always applied at `:190-192`).
- `lib/language/registry.ts` is the single capability list; pickers derive from it.
- Settings→Agents fully wired: `deriveEffectivePrompt` writes the prompt in the chosen language AND names it, then `ensureAssistantConfig` applies prompt+greeting+voice+transcriber.
- `additional_languages` threaded end-to-end (nova-3 "multi" code-switching).
- `resolveLanguage/toLanguageCode` normalize ISO `es` and label `Spanish` (R-135).

**Gaps**
| Sev | Eff | Gap | Evidence |
|---|---|---|---|
| major | M | Onboarding activation sets voice from language but leaves system prompt + greeting English (passes only `{language}`, no systemPrompt/firstMessage). And onboarding no longer captures a language → always `en`. | `onboarding/_actions.ts:974,981-985,1017-1020`; `assistantConfig.ts:180-182` |
| major | S | **Hire path `createAgentAction` never calls `ensureAssistantConfig`** — new assistant has no voice/transcriber/model.messages/firstMessage/tools/webhook until a manual Settings save. | `agents/new/actions.ts:30-31,100-113` |
| major | M | Workspace "Default language" change never updates `agents.language` nor re-syncs Vapi — silent no-op for existing employees. | `settings/_actions/workspace.ts:273-291`; `getWorkspaceDefaultLanguage.ts:9-16` |
| minor | L | **Only `en`/`es` have a voice** (`LanguageCode = "en" \| "es"`); `de`/`tr` are marketing locales only. (Owner: build de/tr voice.) | `lib/language/registry.ts:18,41-63` |
| minor | S | Reconcile endpoint re-applies config with no language → resets non-English voices to English. | `api/internal/reconcile-vapi-assistants/route.ts:50-52` |

Note: three columns hold "language" and can drift — `organization_settings.onboarding_language`,
`agents.language`, `organization_settings.default_language`.

---

## 3. Bring-Your-Own-Number (BYON) via SIP

**Verdict:** entirely unbuilt. Numbers today come only from Vapi's managed (Twilio-backed) pool,
US-only, `provider:"vapi"` hardcoded. See `04-byon-sip.md` for the full build plan.

Key facts: `phone_lines` has `vapi_phone_number_id NOT NULL`, `phone_number_e164 NOT NULL`, no
`provider`/`sip`/`credential_id` columns. Every add-a-number flow increments the `extra_phone`
Stripe add-on. `vapiFetch` (`lib/vapi/server.ts`) can already POST arbitrary bodies. Grep for
`sip-trunk|byo-phone-number|credentialId|twilio` = 0 hits (only a display-only `phone_number_sip_uri`).

---

## 4. Usage / remaining-minutes screen

**Verdict:** all data + math exist; only a flat bar on the billing page renders it. No chart, no
home/analytics widget. Recommended placement: **dashboard home**. See `05-usage-minutes.md`.

Key facts: `lib/billing/usageMath.ts` (includedMinutes per plan; `billableMinutes = Σ ceil(sec/60)`
per call); `org_daily_usage` view already holds per-day billable_minutes (used only by the
draft-invoice route). `/api/billing/summary` returns monthly totals only. `TrendChart.tsx` (ApexCharts)
is the idiomatic chart to reuse.

---

## 5. Dashboard i18n + reply-engine language

**Verdict:** the dashboard is **100% unlocalized** — zero next-intl usage under
`web/src/app/(app)`. The 4-language i18n is confined to marketing (`[locale]/(marketing)`).
See `03-dashboard-i18n.md` for the approach.

Key facts: `middleware.ts:24-28` keeps `/dashboard`,`/onboarding`,`/login`,`/auth` out of locale
routing. ~153 `(app)` tsx + 12 horizon-shell + 5 inbox components carry hardcoded English (~800–1500
strings to extract). Reply engine already passes business language and instructs mirror-the-customer
(`reply/prompt.ts:78-83`) — owner keeps this. Business can only pick `en`/`es` today (registry cap).
Deterministic reply fallback only has `en`/`es` (`reply/fallback.ts:42-45`).

---

## 6 & 7. Performance (server + client)

**Verdict:** slowness is **round-trip amplification + no caching**, not missing indexes (hot columns
are all indexed). Full detail + applied fixes + deferred backlog in `01-performance.md`.

Headline causes: `auth.getUser()` (a network call) runs 3–6× per navigation uncached; 31 pages
`force-dynamic` with no `experimental.staleTimes` (client Router Cache off); inbox conversation
switch = uncached full server round-trip; channel-chip click blanks list to skeleton + refetches
from offset 0; `listConversationPage` scans 500 rows incl. `calls.transcript`; middleware runs 3
sequential queries per request + had 7 debug logs.
