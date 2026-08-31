# Dashboard 4-language i18n + reply-engine language

Goal: the dashboard and all sub-pages available in en/es/de/tr, shown in the customer's language;
AI auto-replies already handled (mirror — kept). This is the largest workstream (XL).

## Current state
- Marketing is fully localized via next-intl `[locale]` routing (`i18n/routing.ts`, `messages/{en,es,de,tr}.json`, ~520 keys each).
- The dashboard/onboarding/auth trees are **deliberately unlocalized** — `middleware.ts:24-28` keeps them out of `[locale]`, and there is **zero** next-intl usage under `web/src/app/(app)` (grep for `useTranslations|getTranslations|NextIntlClientProvider` = 0 files).
- ~153 `(app)` tsx + 12 horizon-shell + 5 inbox components carry hardcoded English → **~800–1500 strings** to extract.

## Approach — localize WITHOUT moving under `[locale]`

Moving the dashboard under `[locale]` would break auth (which lives outside `[locale]` by design) and
the middleware `UNLOCALISED` model. next-intl v4 / Next 16 supports a provider with an explicit locale
outside a `[locale]` segment, so:

1. **Locale source of truth.** Add a per-user `profiles.ui_locale` column (the person reading the
   dashboard is not necessarily whose AI speaks Spanish to callers). v1 fallback: reuse
   `organization_settings.default_language`; final fallback: the `NEXT_LOCALE` cookie.
2. **Provider.** In `web/src/app/(app)/dashboard/layout.tsx` (server component) resolve that locale,
   call `getMessages()`, and wrap children in `<NextIntlClientProvider locale={locale} messages={messages}>`.
   Auth stays outside `[locale]`; middleware `UNLOCALISED` untouched.
3. **Messages.** Add a `dashboard` namespace to `messages/{en,es,de,tr}.json` (keep marketing keys separate).
4. **Extract + translate.** Mechanically replace inline English with `t()` calls across ~170 files;
   translate to es/de/tr. Start with highest-traffic surfaces: dashboard home, inbox, calls, settings.
   Inbox strings are conditional/interpolated (channel label injected) → use ICU messages with variables
   (`ThreadHeader.tsx:87-97,138`, `Composer.tsx:60-63,179-187`).
5. **Language switcher** in Settings that writes `ui_locale`.

**Sequence:** ship the provider + source-of-truth first, then localize page-by-page incrementally
(this is weeks of work; it can land surface-by-surface without a big bang).

## Reply-engine language (mostly done — owner keeps MIRROR)

- `reply/prompt.ts:78-83` already passes the business language and instructs "reply in the language
  the customer writes in." **Owner chose to keep this (mirror).** Do NOT change to pin-to-business.
- **de/tr for the AI:** today a business can only pick `en`/`es` (`registry.ts:18`, pickers derive from
  it). To let a business choose German/Turkish for text channels + voice, extend the registry (see below).
- **Deterministic fallback** `reply/fallback.ts:42-45` only has `en`/`es` — add `de`/`tr` strings when
  those become supported business languages (customer-facing failure path).

## de/tr VOICE (owner: build it)

`lib/language/registry.ts` `LanguageCode = "en" | "es"`. To add German/Turkish voice, add registry
entries with a **verified Deepgram transcriber model** + a **Vapi/TTS voice** per language
(`registry.ts:41-63` shows each needs `transcriberModel` + `voice` + `voiceFollowsCaller` + `codeSwitch`).
The registry's R-135 comment is the honest gate: prove ear (transcribe) + mouth (TTS) end-to-end before
offering it, or a picked language silently delivers an English employee. This unblocks:
(a) the pickers offering de/tr, (b) de/tr fallback strings, (c) 4-language voice.

**Files:** `middleware.ts`, `i18n/{routing,request}.ts`, `(app)/layout.tsx`, `(app)/dashboard/layout.tsx`,
`lib/platform/reply/{prompt,fallback,engine}.ts`, `lib/language/registry.ts`,
`settings/_actions/workspace.ts`, `settings/_lib/options.ts`, `messages/*.json`.
