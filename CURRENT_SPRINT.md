# CURRENT SPRINT — D0 "Turn It On" (Denku 2.0, Sprint 0)

> Plan: [docs/SPRINT_D0_TURN_IT_ON.md](docs/SPRINT_D0_TURN_IT_ON.md) · execution vehicle:
> [docs/LAUNCH_RUNBOOK.md](docs/LAUNCH_RUNBOOK.md) · program: [docs/denku-2.0/20-denku-roadmap.md](docs/denku-2.0/20-denku-roadmap.md)

**D0 · opened 2026-08-25 · Status: 🟢 CORE PROVEN ON PRODUCTION 2026-08-27** — a real call now
produces a real appointment, at the right local time, with an owner email. Remaining work is
listed under "Next" and is no longer about whether the product works.

---

## What was proven on production (2026-08-27)

The D0 Definition of Done asks for one recorded end-to-end run. It happened, on the fourth
attempt, after each attempt exposed a different real bug. The last call:

| Step | Evidence |
|---|---|
| Webhook accepted | `[VAPI][WEBHOOK][AUTH][OK] { mode: 'enforce' }` |
| Call recorded | `calls` row, org + employee resolved, lease acquired and released |
| Intent classified | `intent: appointment`, **`source: llm`** (Gemini), confidence 0.95–1.0 |
| Business context reached the caller | AI refused 9 PM: *"demo appointments are Monday to Friday, 9 AM to 6 PM eastern"* |
| **Appointment created by the in-call tool** | `status: scheduled`, `by_guarantee: false` |
| Time correct in the business's zone | caller said "tomorrow at 1:30 PM" → `2026-08-28 13:30 America/New_York` |
| AI told the truth on the line | *"Your appointment is all set for tomorrow at 1:30 PM."* |
| **Owner notified** | `appointments.notified_at` set |
| Billing | 6 billable minutes for 4 calls — `Σ ceil(seconds/60)` per call, exact |

**Not yet proven: a real PSTN phone call.** Every test above was a Vapi **web call** (the owner is
outside the US). Everything is shared code except caller ID, so what a phone call adds is
`from_phone` → lead linking. See "The call script" below.

---

## Bugs found and fixed (all on `main`, all deployed)

Each was found by running the thing, not by reading it.

| # | Bug | Why it mattered |
|---|---|---|
| 1 | **`agents` had an RLS SELECT policy and no UPDATE policy** | No customer could EVER save their AI's configuration — name, language, greeting, business context. Every agent in production had `business_context = null`, not because nobody tried. `20260827090000_agents_rls_update_policy.sql` |
| 2 | **The appointment guarantee wrote a column that does not exist** (`source`) and omitted `start_at` (NOT NULL) | 92 tickets and, in the product's entire history, **zero appointments**. The never-dead-end promise was broken for appointments since the day it was written. |
| 3 | **chrono silently ignores IANA timezone names** | "Tomorrow at 5 PM" resolved in the runtime's zone — UTC on Vercel — so a New York business would have been booked 4 hours early, with nothing logged. `lib/time/spokenTime.ts` |
| 4 | **The booking tool required a phone number** in three separate places | A web call has no caller ID; neither will Web Chat, Telegram or Email. Three bookings lost. |
| 5 | **`RESEND_FROM` saved with its quote characters** | Every owner notification failed with a Resend 422 and nothing surfaced it — the send is best-effort and releases its claim. Readiness reported the sender as fine. |
| 6 | **`/api/tools/create-ticket` answered 401-worthy auth failures with HTTP 200** | Vapi reads 200 as success, so the AI could tell a caller "I've created your ticket" when nothing was created. |
| 7 | **`VAPI_WEBHOOK_BASE_URL` pointed at the apex domain**, which 307-redirects to `www` | A production webhook must not depend on a redirect being followed. |
| 8 | **The appointment rendered as `2026-08-28T17:00:00+00:…`** in the UI | The machine's spelling, in UTC, on the one surface a shop owner opens to see what the AI booked. |

Also cleaned: the Vapi account went from **18 assistants / 8 numbers → 2 / 2**, all correctly
wired; 6 unused numbers released (monthly cost); dangling DB rows removed via
`docs/cleanup/20260827_vapi_debris.sql`.

---

## Performance work done (and what it did not fix)

Measured against production data, never guessed:

- **Opening a conversation: 1794ms → 501ms (3.6×).** Seven sequential stages became one. Details
  in the commit `perf(inbox): opening a conversation is one round-trip stage, not a ladder`.
- **Inbox first load: 949ms → 677ms (1.4×).** Three stages became two.
- Two theories were **measured and disproven**: the list panel does not re-render on navigation,
  and the mark-as-read server action does not trigger a second page render.
- A third was disproven before building it: cutting transcripts out of the list scan is worth
  **35ms**, and database paging **20ms** — at this size the load is round trips, not bytes.

**⚠️ The owner still experiences 6–7 seconds moving between conversations.** The data layer is
501ms, so ~5.5 seconds is somewhere else and has not been measured yet. See Next → P1.

---

## Next

### P1 — Why is switching conversations still 6–7 seconds? (owner-reported, not reproduced)

Target: **1–2 seconds, WhatsApp-like.** What has been measured is only the Supabase round trips
(501ms). Do not repeat that measurement; measure the parts that have not been:

1. **Where is the Supabase project, and where do the Vercel functions run?** If Postgres is not
   in `iad1`, every one of those queries is a transatlantic hop and the in-region assumption used
   throughout this work is wrong. Check first — it is the cheapest and most likely explanation.
2. **Cold starts.** Every dashboard route is `force-dynamic` with no caching, on Hobby. Measure a
   warm click versus a first click.
3. **The browser's own timeline**, not the server's: open DevTools → Network on
   `denku.io/dashboard/inbox`, click a conversation, and read TTFB vs content download vs render
   for the RSC request. That single number splits "server slow" from "network slow" from
   "React slow".
4. **RSC payload size** for a conversation — the full transcript plus the rail travels on every
   click.
5. Only then consider: streaming the thread with Suspense so the header paints immediately, and
   prefetching the neighbouring conversation on hover.

### P2 — Prove a real phone call

A US number, using the script below. Verify afterwards: `calls.from_phone` populated,
`appointments.lead_id` **not null**, the contact visible in Customers, and that the AI did **not**
ask for a phone number.

### P3 — Contacts have no names

Every Inbox row says "Unknown contact" even though the caller says their name and the classifier
extracts it ("Daniel", "Max", "Tom"). It is stored in the appointment notes and nowhere else.
Open question, deliberately not decided alone: on a channel with no phone number, what does a
contact record key on? Answering it is the first real step of the Contacts model.

### P4 — Then Telegram

Unchanged from the plan agreed on 2026-08-27: the shared model must be turned on and proven
(`PLATFORM_MODEL_ENABLED` is still OFF — `conversations`/`messages`/`contacts` have **0 rows**
against 190 calls), then the channel-agnostic **reply engine** (which does not exist in any
form), then Telegram as the first channel to ride on it. Web Chat needs R-030 rate limiting
first; SMS is last because A2P 10DLC registration takes weeks — start that paperwork early if
SMS matters.

---

## The call script (for the US phone test)

Not word-for-word — the point is to exercise the same path a real customer would. Ring
**+1 321 336 9681** and have this conversation:

> **AI:** Hi. This is Denku. How can I help you today?
> **You:** Hi, my name is *(give a name)*. I'd like to book an appointment for tomorrow afternoon at 3 PM.

Then, whatever it says:

> **You:** What are your plans?
> **You:** When are you open?
> **You:** No, that's all. Thank you.

Three things to watch for, because each one is a fix from today being verified:

1. **It must NOT ask for your phone number.** It has your caller ID; asking would mean the
   `{{customer.number}}` header did not arrive.
2. **It should confirm the booking on the line** — "your appointment is all set for…" — not
   "someone will follow up".
3. **It should push back on an out-of-hours time.** Ask for **9 PM** instead if you want to test
   that: it should decline and offer the 9–6 Eastern window, which proves the business context
   reached the caller.

Afterwards, say so and the next session can verify the whole chain from the database.

---

## Operator state (as of 2026-08-27)

- Vapi: credit loaded; 2 assistants, 2 numbers, both fully wired to `https://www.denku.io`.
- Env in Vercel production: `PLATFORM_UX_ENABLED`, `GEMINI_API_KEY` (`gemini-3.5-flash-lite`),
  `ARTIFACT_NOTIFICATIONS_ENABLED`, `VAPI_WEBHOOK_BASE_URL=https://www.denku.io`, `RESEND_FROM`
  (quotes removed), `VAPI_WEBHOOK_AUTH_MODE=enforce`.
- Migrations: repo and prod synchronized; the newest are `20260826120000_conversation_stars_and_reads`,
  `20260827090000_agents_rls_update_policy`, `20260827100000_appointments_start_at_nullable`.
- Still OFF: `PLATFORM_MODEL_ENABLED`. Rate limiting (R-030) still needs an Upstash/KV instance.
- The Vapi **tool definitions live in the Vapi account, not this repo.** The contract they must
  satisfy is documented at the top of `app/api/tools/create-appointment/route.ts`; three bookings
  were lost to those two drifting apart.
