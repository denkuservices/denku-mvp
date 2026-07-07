# Audit 03 — Voice Agent / Call Experience Audit

- **Date:** 2026-07-06 · **Findings current as of:** 2026-07-06
- **Lens:** Head of Conversation Design + the customer's most skeptical caller. The question:
  *is the three-minute phone call — the thing businesses actually pay for — excellent, truthful,
  and operationally useful?*
- **Scope:** the agent's brain (prompts), its hands (tools), its senses (voice/language/
  transcription config), its judgment (guardrails, intent, completion inference), and its output
  (tickets/appointments as the business receives them). Both assistant-creation paths and the
  settings sync were traced end-to-end.
- **Constraint stated honestly:** this session cannot place phone calls. Everything codified was
  audited from the repo; everything experiential is delegated to the **Live Test-Call Protocol**
  (end of document) for a human to execute. The marketing demo assistant (`155b21ad…`) lives only
  in the Vapi dashboard and is unauditable from the repo — protocol scenario 8 covers it.

> Living document (Rule 1). Canonical status: `docs/IMPLEMENTATION_ROADMAP.md`.

## The headline: the AI's hands are missing

The product promise is "answer every call, qualify every lead, book every appointment." The
agent's ability to *act* on that promise depends entirely on two Vapi tools (create_ticket,
create_appointment) being attached to its assistant. This audit traced tool attachment through
every path an assistant can take, and found:

- **[R-050 — NEW, Critical] The AI's tools are missing on most real-world lines, and silently
  stripped from the rest.**
  1. **Phone-line purchase path never attaches tools.** `api/phone-lines/purchase/route.ts`
     creates the backing assistant with model + firstMessage only; there is no GET+PATCH
     `toolIds` merge anywhere in the file (the comment even says "Tools will be configured
     separately if needed" — they never are). Every number added from the dashboard answers with
     an AI that cannot file anything mid-call.
  2. **Settings sync strips tools from the Main Line.** `syncAgentToVapi`
     (`settings/_actions/agents.ts:273–302`) blind-PATCHes a reconstructed `model` object —
     `{provider, model: "gpt-4o", messages}` — with **no `toolIds`**, violating the repo's own
     documented landmine ("GET + PATCH model.toolIds merge", CLAUDE.md #6). The first time a
     customer personalizes their agent (behavior preset, emphasis points, first message — the
     things we *want* them to do), the onboarding-attached tools are wiped.

  **Net effect:** for any org that customized its agent or added a line — i.e., most engaged
  customers — the AI can only *talk about* creating tickets and appointments. The prompt
  explicitly instructs it to use `create_ticket` / `create_appointment`, so it will verbally
  confirm actions it cannot perform; the caller hears "I've created a ticket," which is false in
  the moment. The deterministic post-call fallback then papers over it with a generic ticket —
  masking the failure so well that nobody has noticed. Appointments fare worse: with the intent
  stub (R-019) the deterministic appointment path never fires, so **booking is effectively
  impossible on affected lines**. This also silently skews analytics: `toolUsed` is always false,
  so completion-state inference marks healthy calls "partial" (feeds R-018).

## The agent's brain, senses, and judgment

- **[R-013 — enriched] The brain is ~5 generic lines.** The Main Line prompt: be concise, use the
  two tools, confirm name/phone/summary. The purchase-path prompt is thinner still: "You are a
  helpful customer support voice assistant." No business hours, services, prices, location,
  escalation rules, or personality. The prompt-derivation system (presets, emphasis points,
  mandatory fallback line) is a good chassis — it just has almost no fuel.

- **[R-051 — NEW, High] Voice and language settings are decorative.** No `voice` object is ever
  sent to Vapi (the `"jennifer"` value exists only as a DB column); no `transcriber` config is
  ever set, and the sync action's own comment concedes it ("Vapi language support may vary…
  we'll update what we can" — it updates nothing). Language reaches the call only as prompt text
  ("Primary language: es. Respond naturally…") — meaning a Spanish-configured agent listens
  through a default-language transcriber and speaks in whatever default voice Vapi assigns.
  Onboarding's language step and the Settings language/voice pickers are, for the caller,
  fiction — the in-product sibling of R-004's "20+ languages" claim.

- **[R-052 — NEW, Medium] No duration, silence, or end-of-call configuration on paid lines.**
  Assistants are created with no `maxDurationSeconds`, no silence timeout, no configured closing
  behavior — Vapi defaults apply, uncapped. A prank/pocket-dial/hostile caller can burn unbounded
  billable minutes toward the customer's overage ($0.13–0.22/min). Interlocking technical effect:
  the concurrency lease TTL is 15 minutes, so any call longer than that silently loses its lease
  — long calls stop counting against concurrency while still consuming minutes.

- **[R-053 — NEW, Medium] The guardrails misfire on normal calls.** GR-1 ("repeat slot") counts
  regex matches for phone/email vocabulary across the ENTIRE transcript — both speakers.
  A perfectly healthy exchange — AI: "What's your phone number?" / Caller: "My phone number is
  555-0123" — is 2+ matches → triggered → call force-marked "partial" with a forced ticket. In
  practice the guardrail penalizes exactly the calls that do contact-collection correctly,
  polluting completion-state analytics (R-018). Separately, the demo off-topic detector's keyword
  list includes `"how to make"` — so a demo caller asking *"how to make an appointment"* can be
  flagged for "Demo misuse / exceeded limits."

- **[R-054 — NEW, Medium] After-hours callers get the daytime experience.**
  `isOutsideBusinessHours` is a stub returning "inside hours" always; there is no business-hours
  config, no after-hours greeting variant, no voicemail-style capture framing. For the SMBs Denku
  targets, night/weekend calls are the marquee use case ("24/7") — today the agent doesn't even
  know it's 2 AM.

## The output the business actually receives

- **[R-055 — NEW, Medium] Call artifacts read like debug logs, not work items.** Every
  deterministic ticket description opens with an internal-jargon header —
  `[Channel] / [Caller] / [Agent] <persona_key> / [Vapi] <call-id> / [Time]` — leaking Vapi call
  IDs and persona keys (`support_en`) into the customer-facing surface, and using the word
  "Agent" in violation of the product's own naming rule. Subjects collapse to four crude keyword
  buckets ("Billing Question", "Order Issue", "Scheduling Request", "Support Request") — a call
  about a gas leak files as "Support Request". The body is a raw transcript dump (truncated at
  2,000 chars) plus `[System] created_by=deterministic`. The *reliability* of these artifacts is
  a genuine strength; their *readability* squanders it — this is the one screen the business
  reads every day.

- **[R-019 — enriched]** Intent inference is the other half of booking: even where tools exist,
  "appointment" intent is never detected post-call, so the deterministic appointment guarantee is
  dead code in practice. R-050 + R-019 together mean the booking promise currently rests entirely
  on the LLM spontaneously calling a tool it usually doesn't have.

## What is genuinely good (preserve)

1. **The deterministic artifact guarantee** — every finished call yields a ticket/lead no matter
   what the LLM does. It is currently masking R-050, but it is the right safety net and must
   survive every fix here.
2. **The prompt-derivation chassis** — presets, emphasis points, and especially the mandatory
   fallback line ("I'll notify our team and make sure someone follows up shortly") are the
   correct architecture for R-013's business-context work.
3. **Guardrail philosophy** — deterministic, no-LLM, idempotent, never-throw. The *design* is
   right; only the trigger heuristics (R-053) need fixing.
4. **Idempotent webhook artifact pipeline** — repeated events never duplicate tickets.

## Live Test-Call Protocol (for a human; ~45 minutes)

Prereqs: one activated org with a Main Line, one dashboard-purchased line, agent customized once
via Settings (to reproduce R-050's strip path). Record each call; afterwards compare against the
dashboard's call row, ticket, and transcript.

| # | Scenario | Script | Pass criteria (observe) |
|---|---|---|---|
| 1 | Happy-path support | "My order arrived damaged, I need help." Give name + number when asked. | AI collects name/phone/summary, confirms before ending; ticket subject ≠ generic; no false "I've created a ticket" if tool absent (R-050 check: does it claim success?) |
| 2 | Booking attempt | "I'd like to book an appointment Tuesday afternoon." | Does ANY appointment artifact appear (mid-call tool or post-call)? Expected today: fails on customized/added lines |
| 3 | Business question | "What are your hours? How much does a service visit cost?" | Expected today: generic deflection (R-013). Note exact wording — does it hallucinate hours/prices? |
| 4 | Repeat contact info | Give phone number promptly when asked, once. | Check the call row afterwards: was it wrongly marked "partial / repeat_slot" (R-053)? |
| 5 | Hostile/silent caller | Stay silent 30s, then ramble off-topic 3+ min. | Does the call ever end on its own (R-052)? What duration/cost accrues? |
| 6 | Interruption & latency | Interrupt the AI mid-sentence twice; note response lag after each turn. | Subjective rubric: lag <1.5s feels premium; does it recover from barge-in? |
| 7 | Language reality | Speak only Spanish for the whole call (on an agent with language set to Spanish if possible). | Transcript accuracy + response language (R-051). Expected today: degraded |
| 8 | Marketing demo | Use "Talk to Denku" on the landing page; ask "how to make an appointment." | Demo quality baseline + false abuse-flag check (R-053); observe the 5-min cutoff feel (R-029) |

Log results per scenario (pass/fail + notes + recording link) and feed them into a re-audit of 03.

## Executive Summary

The audit of the product's actual product — the phone call — found that **the AI's ability to act
is broken on most realistic configurations**: dashboard-purchased lines never receive their tools,
and the settings sync strips tools from onboarded lines the moment a customer personalizes their
agent (R-050, Critical). The deterministic fallback has been silently masking this, which is both
why it shipped unnoticed and why analytics under-report the damage. Around that headline: voice
and language settings don't reach Vapi (R-051), calls have no duration/abuse caps (R-052),
guardrails punish healthy calls (R-053), after-hours awareness doesn't exist (R-054), and the
tickets businesses read daily leak internal jargon under crude subjects (R-055). The chassis —
deterministic artifacts, prompt derivation, guardrail philosophy — is sound; what's needed is one
consolidated "assistant configuration" fix motion (tools always merged, voice/language/duration
actually set) before the R-013/014 activation work builds on this foundation. Run the test-call
protocol after the R-050 fix to verify end-to-end.

## Action Items

| # | Action | R-ID | Priority |
|---|---|---|---|
| 1 | Guarantee tool attachment on BOTH creation paths + make settings sync merge (never replace) model config | R-050 | Critical |
| 2 | Make voice + language real: send voice/transcriber config to Vapi; wire pickers to it | R-051 | High |
| 3 | Set max duration, silence timeout, and closing behavior on all assistants | R-052 | Medium |
| 4 | Fix GR-1 to count agent-lines only; remove "how to make" from off-topic list | R-053 | Medium |
| 5 | Implement business-hours config + after-hours greeting/capture variant | R-054 | Medium |
| 6 | Rewrite ticket subjects/descriptions for business readability; drop internal jargon | R-055 | Medium |
| 7 | Execute the Live Test-Call Protocol post-R-050 and re-audit | — (protocol) | High |
| 8 | Business-context fuel for the prompt chassis (already filed) | R-013 | High |
| 9 | Real intent detection to un-dead-code the appointment guarantee (already filed) | R-019 | High |
