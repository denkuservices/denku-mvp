# Sprint 4 Review & Retrospective — Voice Intelligence

- **Sprint:** 4 · **Window:** 2026-07-23 · **Status:** **code-complete; operator verification pending**
- **Goal (verbatim):** Make the AI genuinely valuable on a real call: it knows the business, books
  appointments for real, speaks the configured voice + language (EN/ES), can't run away on cost, and
  every call is reviewable with audio.
- **One-line verdict:** **All 5 items shipped in code (R-051, R-052, R-013, R-019, R-016); 139 tests
  green; 5 commits.** The product's core promise — a competent, business-aware AI that actually books —
  is now built; the operator acceptance checklist (below) is the remaining go-live gate.

---

## 1. Completed (5)

- **R-051 (voice/language) + R-052 (caps).** Extended the shared `buildAssistantConfigPatch` so every
  assistant path sends a real **voice** (OpenAI TTS) + **transcriber** (Deepgram nova-2) by agent
  language (**EN + ES**), plus **universal caps** `maxDurationSeconds: 900` (15-min) +
  `silenceTimeoutSeconds: 30`. Pure resolvers unit-tested; wired into `syncAgentToVapi` + `runActivation`.
- **R-013 (business context).** 8 fields (name, services, hours, service area, FAQs, booking policy,
  cancellation policy, tone) → JSONB `agents.business_context` (migration) → concise, deterministic
  prompt injection → editable in **Settings → Agents**, and the save **re-derives + pushes the prompt
  to the live assistant**. Fully usable via Settings. Onboarding-step capture **folded into Sprint 4.5**
  (which reworks onboarding/IA) rather than adding-then-redoing a step.
- **R-019 (intent detection) — owner chose AI-primary.** New `lib/intent/classifyCallIntent.ts`:
  **OpenAI `gpt-4o-mini`** structured JSON `{intent, confidence, booking_details}`, temp 0, **8s hard
  timeout**, `maxRetries:0`, with a **conservative regex fallback** (no transcript / no key / low
  confidence / any error) and **never throws**. Moved classification to **end-of-call** on the final
  transcript (call-start has none — the structural reason it was stuck on "other"), updating
  `calls.intent` and driving appointment-vs-ticket routing so **booking finally works**. Installed the
  `openai` SDK.
- **R-016 (recording playback).** The player already existed; added an **Available/Not-available**
  badge, clean empty state, and a **display-only retention + consent** line (no retention engine, per
  owner scope).

## 2. The hard constraint (why "code-complete", not "verified")

Read-only Supabase; **no Vapi API/dashboard access**. Voice/transcriber, caps, booking, and real
recording payloads can't be exercised from here — they need a **live test call on the Vapi account**.
So Sprint 4 is engineering-done; the operator acceptance checklist is the operational gate.

## 3. Operator acceptance checklist (the go-live gate — DoD requirement)

Prereqs: apply migration `20260723130000` (business_context); set **`OPENAI_API_KEY`** (R-019 runs
regex-only without it); run `POST /api/internal/reconcile-vapi-assistants` so existing assistants pick
up voice/caps. Then, on a **live test call**:

- [ ] **Voice** — the AI answers in the configured voice (not a Vapi default).
- [ ] **Language** — a Spanish-configured line converses in Spanish (voice + transcriber).
- [ ] **Business context** — the AI references the business's hours/services/policies on the call
      (set them in Settings → Agents first).
- [ ] **Appointment creation** — a booking call ("I'd like to book…") produces an **appointment**
      artifact (not a generic ticket); `[INTENT_DETECTED]` logs `source: llm`.
- [ ] **Recording playback** — the call detail page plays the call audio; the badge shows "Available".
- [ ] **Timeout behavior** — a call hits the 15-min cap and/or closes after ~30s of silence.

## 4. Metrics

| Metric | Value |
|---|---|
| Commits | 5 (R-051/R-052, R-013 backend, R-013 UI, R-019, R-016) |
| Items completed | 5 · roadmap now **48 open / 31 completed** |
| Tests | 130 → **139** (+9 intent; +12 config/prompt earlier this sprint), all green |
| New deps | `openai` (R-019) |
| New migration | 1 (`agents.business_context`) |
| New env | `OPENAI_API_KEY` (R-019) |
| Regressions | 0 |

## 5. Lessons

- **The stub was mis-placed, not just weak.** R-019 looked like "improve the classifier," but the real
  bug was that `detectCallIntent` ran at call-start with **no transcript** — so no classifier could
  work there. Reading the call path (not just the finding) relocated the fix to end-of-call, where it
  actually works. Read the surrounding code before implementing a finding.
- **AI in the critical path must degrade, not fail.** R-019's LLM sits in the webhook: strict timeout,
  regex fallback, and never-throws make it safe to ship even without a key (regex-only). Same
  stage-then-enable discipline as the notification work.
- **Reuse compounded again.** R-051/R-052 rode the R-050 assistant-config helper; R-013's live sync
  rode the existing `syncAgentToVapi` path; R-016 was mostly already built. Small, composable seams.
- **Scope honesty:** R-013's onboarding-step capture was consciously folded into Sprint 4.5 (which
  reworks onboarding) instead of adding a step the 4.5 IA work would immediately redo.

## 6. Handoff → Sprint 4.5

The owner has queued **Sprint 4.5: Denku from a Voice-AI product to a multi-channel AI-Employees
platform** (Voice · Instagram · WhatsApp · Email) — dashboard IA, onboarding, navigation, and shared
architecture. The R-013 onboarding-capture and any voice-onboarding UX fold into that sprint's
onboarding rework. Instagram foundation (Sprint 1.5) is the first non-voice channel already in place.

---

*Living companion to the roadmap. Sprint 4 is done when the §3 acceptance checklist is green on a live
call.*
