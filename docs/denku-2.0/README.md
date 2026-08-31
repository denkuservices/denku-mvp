# Denku 2.0 — End-to-End Voice + Multi-language + BYON initiative

> Living home for the 2026-08-31 audit outputs and the backlog that follows from it.
> Written so a future engineer (or AI session) can pick up any workstream without re-deriving
> context. Every claim here traces to a `file:line` in the codebase as of 2026-08-31 (branch
> `feat/landing-v3-p0`). Companion memory: `denku-2026-08-31-owner-decisions`,
> `denku-voice-platform-gaps`, `denku-dashboard-perf-rootcause`.

## Why this folder exists

The owner asked (2026-08-31) for: a genuinely end-to-end Voice product, customer self-serve setup
(incl. PDF/knowledge upload), primary-language→voice wiring, Bring-Your-Own-Number over SIP, a
usage/remaining-minutes screen, a fix for dashboard/inbox slowness, and 4-language (en/es/de/tr)
support across the dashboard **and** the AI auto-replies.

A 7-agent audit mapped the current state of each. This folder records **what exists, what's
missing, and how to close each gap** — so the work can proceed incrementally as the rest of the
system is still being built.

## Owner decisions (locked 2026-08-31)

1. **Build order:** Performance (partial, done) → **Voice completion (current)** → Dashboard 4-language i18n → BYON/SIP + Usage chart.
2. **German & Turkish VOICE will be built** (add Deepgram + TTS to `lib/language/registry.ts`; today only `en`/`es` have a voice).
3. **AI auto-reply language stays MIRROR** — the AI answers in whatever language the customer writes in. Do **not** change `lib/platform/reply/prompt.ts` to pin-to-business.
4. **Usage remaining-minutes chart goes on the dashboard HOME**, not the analytics tab.
5. **Full comprehensive performance pass is deferred** until the system is ~100% feature-complete (more features = more queries to optimize together). A safe first perf pass is already shipped — see `01-performance.md`.

## Documents

| File | Contents |
|---|---|
| [`00-audit-findings.md`](00-audit-findings.md) | The full 7-area audit: current state, what works, gaps (severity/effort/evidence) per area. The source of truth. |
| [`01-performance.md`](01-performance.md) | Perf root cause, the safe fixes already applied, and the deferred Tier-B backlog. |
| [`02-voice-completion.md`](02-voice-completion.md) | **Current workstream.** Onboarding capture, Hire-path Vapi wiring, PDF/knowledge upload, real Test-call. |
| [`03-dashboard-i18n.md`](03-dashboard-i18n.md) | Dashboard 4-language i18n approach (without moving under `[locale]`) + reply-engine language notes + de/tr voice. |
| [`04-byon-sip.md`](04-byon-sip.md) | Bring-Your-Own-Number over SIP: data model, Vapi credential/byo-phone-number API, route, billing, security, UI. |
| [`05-usage-minutes.md`](05-usage-minutes.md) | Remaining-minutes chart on home: the data already exists, only a read + widget are missing. |

## Status at a glance (2026-08-31)

| Area | Verdict | Biggest gap |
|---|---|---|
| Voice pipeline | ✅ End-to-end, never dead-ends | No PDF/knowledge upload; onboarding captures no business info |
| Self-serve setup | 🟡 Partial | No file upload; must type everything into 8 text fields |
| Language → voice | 🟡 Only on Settings→Agents path | Onboarding always English; Hire path applies nothing; de/tr have no voice |
| BYON/SIP | ❌ Not built | Entire feature (data model, Vapi calls, route, UI) is greenfield |
| Usage/remaining minutes | 🟡 Data exists, no chart | No per-day read + no home widget |
| Dashboard i18n | ❌ 100% English | Zero next-intl under `(app)`; ~170 files to localize |
| Performance | 🟡 Safe pass shipped | Deeper server-side round-trip fixes deferred |
