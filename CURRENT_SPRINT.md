# CURRENT SPRINT — Voice Intelligence

> The active implementation sprint. Finding detail: `docs/IMPLEMENTATION_ROADMAP.md`; safe-sequencing:
> `docs/EXECUTION_PLAN.md` + `docs/RETROSPECTIVE.md`. Update task status here as you ship; mark the
> roadmap entry `Completed` (date + how) in the same change.

**Sprint 4 · Started 2026-07-23 · Status: ✅ `CODE-COMPLETE 2026-07-23` (operator verification pending)**

> All 5 items shipped in code: **R-051 + R-052** (voice/language EN-ES + call caps), **R-013**
> (business context, usable via Settings), **R-019** (AI-primary intent detection), **R-016**
> (recording verify + retention/consent copy). 139 tests green. Operator go-live: `OPENAI_API_KEY`
> for R-019 (regex-only without it), the R-013 migration, and the **live operator acceptance
> checklist** in the DoD below. Sprint 4.5 (multi-channel platform) is the next planned sprint —
> **not started**.

> Sprint 3 is **code-complete, awaiting operator activation** (`docs/SPRINT_3_ACTIVATION.md`); review in
> `docs/SPRINT_3_REVIEW.md`. Sprint 4 was proposed, then the owner **intentionally prioritized product
> value over acquisition metrics** — R-066 (analytics) moves to Sprint 5. Approved 2026-07-23 with
> adjustments (below).

## Sprint Goal

Make the AI genuinely valuable on a real call: it **knows the business**, **books appointments for
real**, **speaks the configured voice + language (EN/ES)**, **can't run away on cost**, and **every
call is reviewable with audio**. Targets the #1 churn driver (a generic bot on the first test call)
and the core "books every appointment" promise.

## Hard constraint (shapes the DoD)

Read-only Supabase access; **no Vapi API/dashboard access**. Assistant-config (R-051/R-052), booking
(R-019), and real recording payloads (R-016) are **buildable + unit-testable but operator-verified**
via a live test-call. Every task is split **engineering-done vs operationally-verified**.

## Prioritized Tasks (do in order)

### Task 1 — R-051 (voice/language) + R-052 (duration/silence caps)  ·  ✅ DONE (code) 2026-07-23
- Extend the **pure** `buildAssistantConfigPatch` in `lib/vapi/assistantConfig.ts` (shared GET→merge→
  PATCH helper, R-050) to set `voice`, `transcriber` (language), `maxDurationSeconds`,
  `silenceTimeoutSeconds` from agent settings. All three creation paths (`runActivation`, phone-line
  purchase, `syncAgentToVapi`) inherit it.
- **Decided values:** launch **English + Spanish**; **`maxDurationSeconds: 900` (15-min hard cap)**;
  **`silenceTimeoutSeconds: 30`**. Curated voice list (EN + ES). Align the 15-min cap with the
  concurrency lease TTL.
- Tests: extend `vapi-assistant-config.test.ts` (voice/transcriber/caps present; `toolIds` never
  dropped; safe defaults). Non-fatal on bad values.

### Task 2 — R-013 (business context)  ·  ✅ DONE 2026-07-23 (Settings UI + prompt + live sync; onboarding capture → Sprint 4.5)
- Migration (additive) for business-context fields + collect in onboarding + editable in Settings →
  Agents + inject into `settings/_lib/prompt-derivation.ts` and Main Line creation in `runActivation`.
- **Fields (owner-expanded):** business name · services · opening hours · service area · FAQs ·
  booking policy · cancellation policy · preferred tone/personality. **Prompt must stay concise +
  deterministic** — template the fields into the existing derivation chassis; keep the mandatory
  fallback line.
- Tests: prompt-derivation injection (fields → prompt sections present); migration additive.

### Task 3 — R-019 (intent detection)  ·  ✅ DONE (code) 2026-07-23
- Replace the `detectCallIntent` stub (`api/webhooks/vapi/route.ts:262`, currently returns `"other"`
  always) with **AI-primary semantic classification** on the final transcript:
  - **Primary:** OpenAI `gpt-4o-mini` structured-JSON classify → `{ intent, confidence,
    booking_details }` (name/service/preferred_time when present). New dep `openai` + **`OPENAI_API_KEY`**
    (operator env). Timeout-guarded (~8s), never blocks/dead-ends.
  - **Fallback:** conservative regex/keywords when no transcript, no key, low confidence, or LLM
    error. → **the classifier ships safe and works (regex-only) without the key.**
  - Wire `ensureAppointmentForCall` for `appointment` intent; log `[INTENT_DETECTED]` **truthfully**
    (source llm|regex, confidence). Keep the never-dead-end deterministic fallback intact.
- Tests: pure classifier — booking→appointment, support→ticket, ambiguous→conservative; LLM mocked;
  fallback path; idempotency preserved.

### Task 4 — R-016 (recording playback)  ·  ✅ DONE (code) 2026-07-23
- Already built: `findRecordingUrl` + `<audio controls>` in `calls/[callId]/page.tsx`. This task:
  **verify** against real Vapi payload shapes (operator test call), add **recording availability +
  current retention info (display only)**, clean empty state. **No retention engine** (owner: keep
  simple).

## Sequencing
R-051+R-052 → R-013 → R-019 → R-016.

## Decisions (settled by owner 2026-07-23)
Voice/lang = **EN + ES** · caps = **900s / 30s** · R-013 = **8 fields above** · R-019 = **AI-primary
(OpenAI) + regex fallback, JSON output** · R-016 = **display retention info only, no engine**.

## Dependencies
- **New external (operator, for AI-primary R-019 + go-live):** `OPENAI_API_KEY`. Without it, R-019
  runs regex-only (safe).
- **Category C (operator):** a **live test-call protocol** on the Vapi account is the only way to turn
  engineering-done → operationally-verified; existing assistants pick up new config via
  `POST /api/internal/reconcile-vapi-assistants`.
- Builds on R-050 (assistantConfig helper) + R-053 (guardrail de-skew), both done. R-013 migration
  applied via the operator runbook pattern.

## Risks
- **No Vapi write/test access for me** → voice/booking/recording are operator-verified; maximize pure
  unit tests, keep every Vapi change non-fatal.
- **LLM in the webhook** (R-019): latency/cost/failure at end-of-call → gpt-4o-mini, timeout, regex +
  deterministic fallback, staged by key presence.
- **Intent misclassification / prompt regressions** on the live call path → conservative logic + the
  untouched deterministic fallback + tests.
- **Telephony recording law** (consent) → display copy only; recommend counsel for policy (like R-004).

## Definition of Done
Each task shipped + roadmap `Completed` (date + how); CI green; pure cores unit-tested; build green;
docs synced (roadmap, this file, `skills/vapi-integration.md`). Engineering-done separated from
operationally-verified. **No regressions** to the do-not-regress core.

**+ Live operator acceptance checklist** (append to activation notes; the operational-verification gate):
- [ ] **Voice** — the AI answers in the configured voice (not a Vapi default).
- [ ] **Language** — a Spanish-configured line converses in Spanish (voice + transcriber).
- [ ] **Business context** — the AI references the business's hours/services/policies on the call.
- [ ] **Appointment creation** — a booking call produces an **appointment** artifact (not a generic ticket).
- [ ] **Recording playback** — the call detail page plays the call audio.
- [ ] **Timeout behavior** — a call hits the 15-min cap / 30-s silence timeout and closes gracefully.

## Expected user-facing outcome
On the first test call the AI greets with the business's context, **books appointments for real**,
speaks the chosen voice/language, won't run up unbounded minutes, and every call is reviewable with
audio — the core-promise upgrade paying customers judge Denku on.
