# Business hours

> What the AI knows about when a business is open, and — the part that matters most — why that
> knowledge never decides whether it answers. Built 2026-09-01.

## The rule

**Opening hours describe when STAFF are in. They never gate the AI.** Every Denku product answers
24/7, on every channel, at every hour. That is the owner's decision (2026-09-01) and it is the
product: a business paying for an AI employee is buying the eleven-at-night call its competitors
miss, and a schedule that made the assistant hang up would sell that straight back to them.

So what are hours *for*? Two things, both of them honesty:

- **Correct answers.** "When are you open?" has a right answer, and free text in a prompt was not
  reliably it.
- **Expectation-setting.** At 11pm the AI still books, still takes every detail, still creates the
  ticket — it just does not imply that a person is standing there, and it says when one will be.

If you are ever tempted to add a behaviour that stops, refuses, shortens or declines: don't. That
option existed for a few hours on 2026-09-01 (`say_closed`) and was removed before anyone could set
it, because it contradicted the product it belonged to.

## Why it exists at all

Before this, "opening hours" was one free-text line inside the AI Employee prompt
(`business_context.openingHours`, *"e.g. Mon–Fri 8–6, closed weekends"*). Three consequences:

- The AI could **say** "we close at six" with nothing behind it — it could not tell a caller at
  11pm that nobody was in, because it had no idea.
- `isOutsideBusinessHours` in `/api/webhooks/vapi` was a stub returning `false` for every call the
  product has ever taken, next to a TODO saying the config shape was undefined.
- The phone-line screen's "Business hours" control was a permanently-checked, permanently-**disabled**
  checkbox under the words *Coming soon*, and Settings told the customer their timezone was set so
  "the AI talks about your hours" — true, and useless.

## The model

One jsonb document on `organization_settings`, plus one enum column:

```jsonc
business_hours = {
  days: [                       // exactly 7, indexed 0=Sunday … 6=Saturday (Date.getDay())
    { day: 1, closed: false, intervals: [{ open: "09:00", close: "13:00" },
                                          { open: "14:00", close: "18:00" }] },
    …
  ],
  exceptions: [                 // dated, never recurring
    { date: "2026-12-25", closed: true, label: "Christmas Day" }
  ]
}
after_hours_behavior = 'note_hours' | 'answer_normally'
```

- `note_hours` (default) — the AI says the business is closed right now, **then carries on and
  helps fully**, and is honest that a person follows up when it reopens.
- `answer_normally` — the AI never raises the hours unless asked.

Both answer. There is no third option and there must not be.

Interpreted in `organization_settings.default_timezone`; the employee's own `agents.timezone` wins
where one is set — it is the zone the AI already uses for "tomorrow", and two zones in one prompt
is a contradiction.

**Why a document and not seven columns or a rows table.** A week is edited as one thing, saved as
one thing, and read on every inbound message. Splitting it across rows buys joins and nothing else.
The database constraint checks only that it *is* the document shape; the real rules live in
`lib/business-hours/schema.ts` (zod) and in `saveBusinessHours`, so they are testable without a
database standing behind them.

**Why exceptions are dated, not recurring.** A public holiday moves. "Closed on the 25th" is a fact
about one day; a recurrence rule would be a promise to get Easter right.

## The rules the evaluator holds

`evaluateBusinessHours(hours, timeZone, at)` — pure, no I/O, 30 tests in
`test/business-hours.test.ts`.

1. **No config means OPEN.** So does an unparseable document, an unknown timezone, and a failed
   read. Nothing about a settings column should ever change how a customer is treated for the
   worse.
2. **A dated exception beats the weekly pattern.** That is the entire point of exceptions.
3. **Intervals are half-open.** Open at exactly `09:00`, closed at exactly `17:00`.
4. **`close <= open` means the shift runs past midnight.** `22:00–02:00` is a bar, not a typo, and
   it spills into the small hours of the following day — including onto a day that is itself
   closed. A day that was closed spills nothing.
5. **Wall-clock, via `Intl`, never a stored offset.** A business open 09:00–17:00 is open
   09:00–17:00 in January and in July; the hours between that and UTC are not the same in both. An
   offset would be an hour wrong for half the year — a bug nobody reports, because it just looks
   like the AI being confused.

## Where enforcement differs by channel (and why it barely matters)

| Channel | Knows the current time? | What the AI does |
|---|---|---|
| Telegram, Web Chat, Instagram, Email | **Yes** — evaluated per message | Answers. Says "we're closed right now" if `note_hours`. |
| Voice (Vapi) | **No** — schedule only | Answers. Given the schedule plus a standing honesty rule; each after-hours call is logged `[CALL][AFTER_HOURS]`. |

A Vapi assistant's system prompt is written once per assistant and reused, so it cannot be told
"it is 11pm now". **Because hours never gate anything, this costs the customer nothing** — the line
is answered either way, and the assistant reasons about whatever time the caller mentions. If you
ever want the voice assistant to know the wall-clock time mid-call, the routes are a Vapi
`assistant-request` hook or per-call `assistantOverrides`; neither is built, and neither is urgent.

## Where the pieces are

| Thing | File |
|---|---|
| Types, zod, evaluation, rendering, prompt block | `web/src/lib/business-hours/schema.ts` |
| Loading it for an org (never throws) | `web/src/lib/business-hours/read.ts` |
| Saving it (validation stricter than the DB) | `web/src/app/(app)/dashboard/settings/_actions/businessHours.ts` |
| The editor | `…/settings/workspace/general/_components/BusinessHoursCard.tsx` |
| Chat wiring | `web/src/lib/platform/reply/respond.ts` → `prompt.ts` |
| Voice prompt + after-hours logging | `…/settings/_actions/agents.ts`, `/api/webhooks/vapi/route.ts` |
| Migrations | `20260901165142_business_hours_and_notification_prefs.sql`, `20260901190128_business_hours_never_gate_the_ai.sql` |

## Rules for changing this

- **Never add a behaviour that stops the AI answering.** Not "say closed and hang up", not "refuse
  bookings after hours", not a per-channel off switch dressed as a schedule. The test
  `the prompt block never gates the AI` asserts the absence of that language on purpose.
- **Never make "no hours" mean closed.** Not for a missing row, a parse failure, a bad timezone, or
  a database error. Every one of those paths returns "open" deliberately.
- **Keep the Settings copy saying 24/7.** "Opening hours" on a settings page reads like a shutter;
  a customer who believed that would think they were switching their phone line off at six. The
  header, the checkbox hint and the notice all carry the correction, and they earn their space.
- **Validation belongs in the action, not only in Postgres.** Overlaps, empty open days and
  duplicate exception dates are refused with a sentence naming the day. The DB check exists so a
  direct SQL write cannot leave the message path parsing garbage at 3am, not as the user-facing rule.
- **The editor must keep allowing overnight intervals.** The evaluator understands them; an editor
  that "helpfully" refuses `22:00–02:00` breaks a whole category of customer.
