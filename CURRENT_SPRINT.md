# CURRENT SPRINT — "Real Customers, Real Money" (opened 2026-09-02)

> The BYON line is live and answering in Turkish on a customer's own Netgsm number
> (see [[byon-netgsm-live]] and the D0 history below). Using it exposed a set of faults that
> reading the code had not, and this sprint is that list. Two of them are money.

**Status: 🟡 IN PROGRESS.** Shipped items are marked; the rest are open with the finding that
motivates them, so nobody has to re-derive it.

---

## Billing findings — ✅ FIXED 2026-09-02 (PR #12)

Found while answering "what happens when I upgrade my plan?". Recorded in full because the
reasoning is worth more than the diff.

### B-1 · A plan upgrade charged nothing (exploitable) — fixed

`POST /api/billing/plan/change` writes `org_plan_overrides` and **never touches Stripe**.
`org_plan_limits` is a VIEW straight over that table:

```sql
SELECT o.id AS org_id, ov.plan_code,
  CASE lower(ov.plan_code) WHEN 'starter' THEN 1 WHEN 'growth' THEN 4 WHEN 'scale' THEN 10 END
FROM orgs o LEFT JOIN org_plan_overrides ov ON ov.org_id = o.id;
```

So an owner or admin on starter ($149) can move themselves to scale ($899) and immediately hold
scale's limits — 3600 minutes, 10 concurrent calls — while the Stripe subscription keeps billing
$149. The answer to "will my starter minutes transfer, or will I pay for both?" is neither:
**today the upgrade is free.**

Fix: the route must move the Stripe subscription item to the new plan's price with proration
*before* writing the override, and refuse the change if Stripe fails. Same compensation
discipline as the phone-line purchase. Note plans are created with inline `price_data` at
checkout rather than catalogue price ids, so there is no `stripe_price_id` on
`billing_plan_catalog` to move to yet.

### B-2 · The plan fee was billed twice — fixed

Checkout creates a recurring monthly **subscription** for the plan. The monthly close-month cron
(`.github/workflows/close_month.yml`, 00:10 UTC on the 1st) *also* adds a `monthly_fee_usd`
invoice item for the same month. Both bill the same fee.

It has not hit a customer yet only because that invoice is created as a **draft**
(`auto_advance: false`) and a person must finalise it. That is luck, not design.

Fix: decide which path owns the recurring fee — the subscription — and reduce close-month to
usage-only (overage and anything else not on the subscription).

### B-3 · Overage behaviour — answered, no bug

When the included minutes run out the line keeps working. Overage accrues at the plan's per-minute
rate, is added to the monthly invoice as its own line item, and is *not* charged as it happens —
so it is metered, not pay-as-you-go. A $100 threshold notifies and a $250 hard cap pauses the
workspace. Working as intended; documented here because the question was asked.

---

## Open work

| # | Item | Note |
|---|---|---|
| 1 | **Voice samples** | The picker ships without audio until `ELEVENLABS_API_KEY` / `AZURE_SPEECH_KEY` are set and `scripts/render-voice-samples.mts` is run once. Until then it shows descriptions and a silent player rather than promising audio it does not have. |
| 2 | **Netgsm concurrent channel count** | Still unknown, and the likely cause of a busy signal on 2026-09-01. A caller who hears busy never reaches Vapi, so Denku cannot even count the loss. Ask Netgsm. |
| 3 | **`MODEL_TIERS_ENABLED`** | Stays off until the Advanced tier has been heard on a real call. |
| 4 | **Mobile, on a real session** | The audit that shipped is static plus four rules now enforced by `mobile-layout.test.ts`; the dashboard itself was never walked through at 375px, because that needs a login. Worth one pass by someone who can sign in. |
| 5 | **Knowledge extraction, on a real document** | The path is built and tested; no customer PDF has been through it yet. |
| 6 | **Email: finish the `minosandco.com` round trip** | Receiving, drafting and approval are proven on production. Sending as the customer's own domain is not — it is blocked on DNS records the owner has to publish. See below. |
| 7 | **Web Chat: write the tests the live proof stood in for** | The owner embedded the snippet on `minosandco.com` on 2026-09-03, opened it as a visitor, and the AI answered — so `productionReady` is now `true` and it is sold as a chat channel. But that was **one manual pass by the person who built it**, and it is now the only thing standing behind a channel we charge for. Three things it proved and nothing re-checks: (a) the origin allowlist admits a genuine third-party domain and refuses one it was not given — the refusal half was never exercised; (b) the frame-token → session-token exchange survives a real cross-origin iframe, which no unit test can simulate; (c) **the entitlement gate from both sides** — with a chat plan the AI replies, without one the widget still opens and displays the thread but produces no reply. (c) is the one to write first: it is the half nobody tests deliberately, and the failure mode is silent and customer-visible. Owner-run repeat on a second domain would also be worth an hour. |

---

## Email channel — what is proven, and the four things left

Built 2026-08-28, migration applied and verified on production the same day. `adopted: true`,
**`productionReady: false`** — and it stays false until a reply leaves from a customer's own
domain, on Telegram's standard: observed, not assumed.

### Proven on production

A real Gmail → Hotmail → forwarding → Denku round trip, verified in the database afterwards:
the sender was read from the `From:` header (Outlook preserves it), a customer's reply landed in
the **same conversation** rather than opening a second one, the AI drafted in the customer's own
language, a person approved it, the mail left, and — the part that was least certain — approving
a draft did **not** flip the conversation to human handling, so the AI kept it. The appointment
existed before the sentence promising it was sent.

### What is left

| # | Item | Why it is not done |
|---|---|---|
| E-1 | **Publish the DNS records for `minosandco.com`** | Owner step. The records now render in the connection card with per-value copy buttons; add them at the registrar, then press **Check again**. Until the provider says `verified`, nothing sends — deliberately. |
| E-2 | **Set the reply address** | Once verified, set `info@minosandco.com`. `minosandco@gmail.com` cannot be DKIM-signed by anyone, which is the whole reason the reply-address setting exists. |
| E-3 | **Confirm Gmail forwarding** | The auto-confirmation has **never actually run** — the parser it depends on never matched until it was fixed, so `completeGmailForwarding` is written and unproven. The card now shows the link as a manual fallback; if it is still there, click it. |
| E-4 | **Then flip `productionReady`** | Only after E-1..E-3 and one real customer mail answered from `info@minosandco.com`. |

### Bugs this channel's first real use exposed

Each was found by running it, not by reading it, and each is fixed and on `main`:

- **A customer told Monday was booked for Saturday.** `chrono` is English-only: given "Pazartesi
  saat 13:00" it read the `13:00`, ignored the weekday it could not spell, and fell back to today.
  Never an email bug — **every channel that answers in the customer's own language**, Telegram
  included, was booking non-English requests on the wrong day, silently, with the reply text and
  the calendar row disagreeing. The model now hands over a resolved `YYYY-MM-DD HH:mm`; the
  regression test pins the broken behaviour as well as the fixed one.
- **A tenant could have claimed Denku's own sending domain.** Denku runs one Resend account for
  every workspace, so "already verified in the account" was being read as "this business owns it".
  Reserved-domain and cross-tenant guards now run before the provider is called at all.
- **Gmail's forwarding handshake reached a business owner's Inbox as a customer enquiry.** Gmail
  sends that mail in the recipient's language; the parser matched English subjects. Detection now
  keys on the verification link, which is identical in every language — and on the `vf-` prefix
  specifically, because the same mail also carries a `uf-` link that *cancels* the request.
- **The DNS step told customers to open a dashboard they have no login for.** The records were
  already being fetched and thrown away by the action.

### Known gaps, accepted for now

- **One connection per workspace in the UI.** The table allows several; `page.tsx` renders
  `connections[0]`. A second address would exist and be invisible.
- **The auto-confirmation is unproven**, as above.
- **Attachments are recorded, not carried** — metadata only, same deliberate gap as Telegram's
  photos.
- **Voice's `create-appointment` route** takes `start_at` already but reads it with `new Date()`,
  which resolves a bare local string in the server's zone. Same class of bug as the Monday one,
  different path, not fixed here.

Full reasoning in [skills/email-integration.md](skills/email-integration.md).

---

## Shipped in this sprint

| Item | What it fixed |
|---|---|
| BYO SIP over Netgsm | First customer-owned number answered by the AI. Vapi needs a numeric IPv4 gateway; Netgsm's "Arayan Prefix" must be `+90` or every caller is filed un-dialably. |
| Turkish voice | `openai/nova` → Azure `tr-TR-EmelNeural` → ElevenLabs `sarah` on `eleven_turbo_v2_5`. Two real calls to get there. |
| Ticket = a task, not a receipt | Every call used to become an identically-titled ticket. A call is now always a record; only an actionable call is a ticket. |
| Ticket data | `requester_*`, `lead_id`, `contact_id`, `conversation_id` were null on all 104 production tickets; the webhook sent the phone under a key the route does not read. |
| Phone line quota | Purchase charged an `extra_phone` add-on on every purchase, so the plan's included number was never spendable. |
| Voice picker + samples | The business chooses and hears the voice; a chosen voice now replaces the whole voice object, not just its id. |
| Model tiers | Standard/Advanced, upgrade-only, flag-gated. **No minute multiplier** — a real call costs ~$0.09/min against $0.37 of revenue. |
| Onboarding Back | Screen-only; never lowers `onboarding_step`, which gates dashboard access. |
| Add-on panel | The `#` beside the price was a `Hash` icon; prices now say `/mo`. |
| Plan change reaches Stripe | B-1 above. Stripe moves first; the entitlement follows only if it agreed. |
| Plan fee billed once | B-2 above. Both invoice paths bill usage only. |
| PDF → Knowledge | An owner uploads a document and the fields fill from what it says, leaving blank what it does not. Nothing saves until a person has read it. |
| Recall has data | 19 tickets reconnected to the customer they already belonged to; `recall.ts` was correct and had nothing to read. |
| Mobile does not clip | The dashboard shell destroyed anything wider than a phone. Four rules now enforced by a test. |

---

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

### P0 — Four owner steps that unblock the new website (added 2026-08-29)

The marketing site rebuild (D4, `feat/landing-v3-p0` — see
[docs/LANDING_V3_DESIGN_PLAN.md](docs/LANDING_V3_DESIGN_PLAN.md) §9.4) is code-complete. Four
things it cannot finish on its own, because each needs an account, a credential, or a business
decision that is not the engineer's to make.

**1. Create the OAuth apps so social sign-in can be switched on.**
The Google and Facebook buttons are built and rendered on `/login` and `/signup`, deliberately
`disabled` rather than fake. To enable:
- Create an OAuth client in Google Cloud (and a Meta app if Facebook is kept — note that
  Facebook Login needs Meta App Review, the same process Instagram went through).
- Add them as providers in Supabase Auth with the callback URL.
- Set `NEXT_PUBLIC_SOCIAL_AUTH_ENABLED=true` in Vercel.
- Implement `onProvider` in `web/src/components/auth/SocialAuthButtons.tsx` with
  `supabase.auth.signInWithOAuth({ provider })`.
Nothing else in the UI changes. Until then the buttons say "coming soon" and email sign-in works.

**2. Decide the Email channel's `productionReady` flag.**
The owner states Email is fully working; the runtime registry
(`web/src/lib/platform/channels.ts`) still has it at `productionReady: false`. The **marketing
site presents Email as Live**, per the owner. The flag was deliberately left alone — flipping it
changes product gating (`productionReadyChannels()`), and that should be a deliberate engineering
change with a verification behind it, not a side effect of a copy decision. **Either flip it and
record the verification, or correct the website.** The two must not stay in disagreement.

**3. ~~Provide AI Studio price points~~ — ANSWERED 2026-08-31, and built.**
The owner chose the benchmark's numbers. `/services/ai-studio` now prints six packages —
visuals $349/$499/$649, video $399/$599/$899 — from `web/src/lib/marketing/content/studio.ts`,
with copy in all four languages, a "what we make" grid and a four-step production section.

**Nothing on that page is purchasable, on purpose, and no Stripe products are needed for it.**
A studio package buys production time: a brief, a concept round, a fixed number of revisions, a
delivery date. None of it can be scoped before the conversation, so every tier says "ask for a
quote" — which is also what the benchmark does on all six of its own tiers. The printed price is
the starting point of a quote, not a charge.

Still missing, and it is an asset rather than a decision: **real sample work**. The benchmark
carries this page on photographs of finished client projects. Generating sample images and
presenting them as a portfolio would be a fabricated body of work, so the page carries itself on
the landing system's own visual language instead. The gallery goes in when there is real work to
show.

**4. Verify geo language detection on a deployed environment.**
First-visit language is picked from the visitor's country in `web/src/middleware.ts`, reading
`x-vercel-ip-country`. That header does not exist locally, so **everyone gets English in dev and
this cannot be tested until deploy**. After deploying, check from (or with a VPN in) Turkey,
Spain and Germany that the first visit lands on `/tr`, `/es`, `/de`, that an unlisted country
(e.g. France) lands on English, and that a manual switch sticks afterwards.

**5. Turn on the chat plans (added 2026-08-31).** The code, the gate and the pricing pages
are built; three operator steps stand between them and a sale:

- ~~**Apply the migration.**~~ **DONE 2026-08-31** (owner granted a one-off write to prod).
  Applied as `20260831081251_chat_plans_and_channel_activation`; the repo file was renamed to
  match so history stays synchronised. Verified in prod: `chat_only` plan present,
  `org_active_channels` created with RLS enabled and zero policies (service-role only), and both
  add-on catalogue rows present with `stripe_price_id` **NULL**, which is what keeps the purchase
  fail-closed until Stripe is configured.

  One thing the migration had to do that was not in the original plan: widen
  `billing_addon_catalog_unit_check`. The column was constrained to `'seat' | 'number'` because
  both existing add-ons are bought by the piece. A chat tier is not — $499 buys *two* channels,
  so the billing page's "{price} per {unit}" pill would have read "$499 per channel" and
  misstated the price. The constraint now also accepts `'month'`, which is true for both tiers.
- ~~**Create the two Stripe products**~~ **DONE 2026-08-31.** The owner created "AI Chat Starter"
  (`prod_VAmVfZ0C5jXfOW`) and "AI Chat Growth" (`prod_VAmZQUABSOj1bY`); their prices were resolved
  from Stripe and written into `billing_addon_catalog`, matched on **amount** rather than name so a
  mispairing would have updated zero rows instead of quietly attaching the $499 price to the $299
  tier. Both verified as monthly / `licensed` / `per_unit`, which is what the route needs — it adds
  them as subscription items with a `quantity`, so a metered or tiered price would have failed.

  ⚠️ **All Stripe pricing on this project is TEST MODE**, the two new chat prices and the two
  pre-existing add-ons alike (`livemode: false` on all four). Nothing charges real money yet.
  Going live is a separate switch: live-mode products, live keys in Vercel, and a re-check that
  `billing_addon_catalog.stripe_price_id` points at the live prices — test price ids do not
  resolve under a live key, so a half-flipped configuration fails closed rather than mischarging.

  Minor, cosmetic: the Stripe product names ("AI Chat **Starter**" / "**Growth**") reuse two
  words that already name VOICE plans, and appear on the customer's invoice, where the site only
  ever says "1 channel" and "2 channels". Renaming them in Stripe is free and changes no id.
- ~~**Set `NEXT_PUBLIC_CHAT_PLANS_PURCHASABLE=true`**~~ **DONE by the owner 2026-08-31**, and
  verified on production: `/chat` renders "Get chat" → `/signup`, and the "not self-serve" notice
  is gone. It briefly ran ahead of the Stripe step; with the price ids now written, the chain is
  complete for a voice customer adding chat.

**A regression the migration itself introduced, and closed:** `billing_plan_catalog` gained a
`chat_only` row, and `/api/billing/summary` returns every row in that table with no filter — so
the billing page's plan grid would have shown a fourth card, **"Chat only — $0, 0 minutes, 0
concurrency, 0 numbers"**, with a switch-to-this-plan button. A paying voice customer could have
clicked it and downgraded themselves out of their phone service. The grid now filters on
`isOfferablePlanCode`; the plan stays in the payload so a chat-only workspace's header still
resolves the name rather than printing a raw code. Both server routes (`/api/billing/plan/change`
and `/api/billing/stripe/checkout`) already hardcode `starter | growth | scale`, so the API was
never exposed — the hole was the UI card alone.

~~**Still not reachable: buying chat WITHOUT voice.**~~ **BUILT 2026-08-31.** The plan step now
offers the two chat tiers under the voice plans, the phone step offers "I don't need a phone
line", and activation skips Vapi entirely for `chat_only` — otherwise it would have bought a US
phone line every month for a customer who bought chat. Reasoning in
[docs/LANDING_V3_DESIGN_PLAN.md](docs/LANDING_V3_DESIGN_PLAN.md) §9.10.

⚠️ **Not yet exercised end to end.** It is verified by types, build and unit tests, not by a real
signup: that needs an account going through Stripe checkout on a deployed environment. Worth
walking once before it is advertised — the specific things to watch are that the webhook writes
`billing_org_addons` (log `[BILLING][WEBHOOK][CHAT_ADDON_RECORDED]`), that activation logs
`[ONBOARDING][ACTIVATION][CHAT_ONLY_SKIPPED]` and provisions **no** phone number, and that the
first Telegram or email message gets an answer — the paid slot claims itself on that first
message (`[CHAT][SLOT][CLAIMED]`).

**A gap found while wiring this up, and closed:** the billing settings page filters its add-on
grid down to `extra_concurrency` and `extra_phone`, so the chat tiers would never have appeared —
there was no way to buy chat anywhere in the product. Chat now has its **own section** on
`/dashboard/settings/workspace/billing`, drawn as two alternatives rather than a quantity
stepper, because a stepper would let someone buy five copies of a plan whose entire meaning is
"how many channels may answer". Switching tiers is deliberately remove-then-add: one click would
need two Stripe writes with no transaction around them, and a failure between them would leave a
customer either paying twice or answering nowhere. The same two rules are enforced server-side in
`refuseChatPurchase` (`web/src/lib/billing/chatPlanKeys.ts`), since the API is callable directly.

Note the deliberate MVP shape: chat is sold by **channel capacity**, never by message volume.
There is no message metering anywhere in the codebase and none was added — a quota nobody can
count, enforce or cap must not be sold. Reasoning in
[docs/LANDING_V3_DESIGN_PLAN.md](docs/LANDING_V3_DESIGN_PLAN.md) §9.8.

**Also outstanding on the website, lower priority:** placeholder metrics are live on the homepage
behind `web/src/lib/marketing/placeholderMetrics.ts` (owner-approved), and clearing them is a
blocking item in [docs/LAUNCH_RUNBOOK.md](docs/LAUNCH_RUNBOOK.md). Legal and utility pages
(`/privacy`, `/terms`, `/docs`, `/support`, `/about`, `/contact`, `/use-cases`) are English only —
legal text should not ship as a machine translation.

### P1 — Why is switching conversations still 6–7 seconds? (owner-reported, not reproduced)

Target: **1–2 seconds, WhatsApp-like.** What has been measured is only the Supabase round trips
(501ms). Do not repeat that measurement; measure the parts that have not been:

1. ~~**Where is the Supabase project, and where do the Vercel functions run?**~~ **ANSWERED
   2026-08-27, and the assumption was wrong.** Supabase prod (`kebqwsdguxxjsijahrox`) is in
   **`us-west-2` (Oregon)**. `vercel.json` sets no `regions`, so the functions run in Vercel's
   default **`iad1` (Washington DC)**. Every single Supabase round trip is a coast-to-coast hop —
   roughly 60–70ms of pure latency each, before Postgres does any work. The measured 501ms of
   "data layer" is therefore mostly distance, and the in-region assumption behind all of the perf
   work was false. **The fix is one line** (`"regions": ["pdx1"]` in `vercel.json`, Portland being
   the closest Vercel region to us-west-2), but it is a deploy-config change with a plan caveat —
   region selection is limited on Hobby — so it is the owner's call, not a silent commit. Do this
   before measuring anything else on this list; it likely moves every number.
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

### P2 — ~~Prove a real phone call~~ **DONE 2026-08-27**

Verified against production data: `calls.from_phone = +13216634776`, `direction = inbound`,
`appointments.lead_id` not null, the lead created in the same second with `source = inbound_call`,
appointment `scheduled` at the caller's stated time in `America/New_York`, owner notified, and the
transcript shows the AI never asked for a phone number. The booking came from the in-call tool, not
the guarantee path.

### P2.1 — ⚠️ **A hired employee gets an assistant with no tools and no webhook** (found 2026-08-28)

`createAgentAction` (`dashboard/agents/new/actions.ts`, the action behind "Hire an AI employee")
creates the Vapi assistant with nothing but a name and metadata, binds the phone number, and
inserts the row. **It never calls `ensureAssistantConfig`.** So the assistant has no
`create_ticket` / `create_appointment` tool ids and no `server.url` — meaning a call to that
number produces no webhook, no `calls` row, no artifact. The employee answers and nothing is ever
recorded.

CLAUDE.md landmine #6 says "all three paths go through it" and names onboarding activation,
phone-line purchase and Settings sync. This is a **fourth** path, added later, that does not. It
also never sets a system prompt or opening line, so the employee has no business context either.

Not fixed yet because it is provisioning code that spends money (it buys a phone number) and
deserves its own change with its own verification, not a drive-by. The fix is to call
`ensureAssistantConfig` after the assistant is created, with a prompt derived the same way Setup
derives it. **Until then, "Hire an AI employee" should be considered broken** — every workspace
today has exactly one employee, created by onboarding, which is why nobody has hit it.

### P3 — Contacts have no names — **partly addressed, NOT verified**

Every Inbox row said "Unknown contact" even though the caller says their name. A fix landed
2026-08-27 that writes the spoken name onto the lead. **It has not been proven.** The one contact
now showing a name ("Ali") turned out to be a lead from 2026-01-04 matched by phone number, not the
new path — the fix never fired, correctly, because that lead already had a name.

Proving it needs a caller who is genuinely new: a number with no existing lead, who says their
name. Until such a call exists, treat this as unverified.

The open question underneath it is still open, and still deliberately not decided alone: on a
channel with no phone number, what does a contact record key on? Answering it is the first real
step of the Contacts model.

**Email answers its own half of that question (2026-08-28): the lower-cased address**, stored as
a `contact_identities` row on `(org_id, 'email', address)`. Two things worth carrying to the next
channel. First, Gmail's dot-and-`+tag` canonicalisation is deliberately NOT applied — those are
one mailbox on Gmail and different mailboxes nearly everywhere else, and merging two customers
into one contact is a worse error than splitting one into two. Second, an email address is only a
**medium-strength** identity (`docs/CONTACT_RECALL_SPEC.md` §3): `info@` is shared and forwarded,
so whoever is typing may not be the person the last appointment belongs to. That is why email must
not inherit `respond.ts`'s unconditional `resolveRecall`, which is justified there by chat
identity being strong.

### P3.1 — The name the AI hears is not always the name that was said

A real caller said **"Gaye"** and the transcript recorded **"Joya"**. Proper nouns are the hardest
thing an STT model does. English moved nova-2 → nova-3 on 2026-08-27, which helps and does not
solve it.

Decided, not built: **do not make callers spell their name.** The identifier on a phone call is
the number, not the name; spelling taxes every caller to fix a minority of cases, and the person
who can correct a spelling cheaply is the owner, who can hear the recording. The intended shape is
that the name is editable in the dashboard, and because the phone number is the key, one correction
holds for every future call from that person. Needs the Contacts model (P3) first.

### P3.2 — Recording playback: proven at the HTTP layer, unproven in the player

`/api/calls/[callId]/recording` is verified on production: the old stored URL answers **HTTP 400**
to anyone (so the original bug was real), and the route answers 200 with `content-length`, 206 with
`content-range` for a range request, and the bytes are a valid 16 kHz mono PCM WAV.

**Whether the `<audio>` element actually plays has not been shown.** The automation browser used to
test it cannot play audio at all — a 1.6 KB sine wave generated in memory hangs identically. Needs
one human to press play. (An earlier diagnosis blaming the cross-origin redirect was wrong and has
been corrected in the file; the route proxies for a CSP reason instead — `media-src` does not
include Cloudflare's host, so a redirect would break the day CSP goes enforcing.)

### P3.3 — Multilingual employees: shipped, one live check left

`agents.additional_languages` (migration applied to production 2026-08-28), the language registry,
`multi` transcriber switching, prompt naming, and the "Also understands" control at
**AI Team → the employee → Setup**. Verified rendering on production after a bug fix (it offered
English to an English-speaking employee — the R-135 code-vs-label split, reintroduced by me).

Left: an actual call that starts in English and switches to Spanish. Also unverified is that the
Vapi assistant now carries `transcriber.language = multi` after a save — check the Vapi dashboard,
or re-run `POST /api/internal/reconcile-vapi-assistants`.

### P4 — Telegram · **LIVE AND ANSWERING 2026-08-27 · not yet production-ready**

Built, typechecked, built by Next, and covered by 24 new tests (666 total, all passing). Full
detail in **`skills/telegram-integration.md`**; the short version:

- **Each customer connects their own BotFather bot.** Token verified with `getMe`, stored
  AES-encrypted, webhook registered with a per-connection secret. Connect UI at Settings →
  Channels → Telegram (never the sidebar — that is what keeps the nav flat).
- **The channel-agnostic reply engine now exists** (`lib/platform/reply/*` +
  `lib/platform/transports/*`) — the piece the plan said did not exist in any form. Telegram is
  ~500 lines of channel specifics on top of it; WhatsApp/Web Chat/Email should each be an adapter
  + a transport + a connection table and nothing else.
- **Email tested that claim on 2026-08-28 and it held.** Receiving is built as exactly one
  adapter, one connection table, one webhook and one connect page, with **zero Inbox edits** — the
  registry carried the card, the health line and the channel chip by itself. Where email is
  genuinely unlike Telegram is not the plumbing but the medium: RFC threading (`References` root,
  never the subject), quoted history that must be cut at ingest because the renderer is
  plain-text by policy, and auto-reply loops — including a self-feeding one, since artifact
  notifications email the owner at an address that may be the very mailbox being forwarded.
  Sending is deliberately NOT built: it needs per-org DKIM verification, and nothing may go out
  from an unverified domain. See `skills/email-integration.md`.
- **The AI books and hands over.** `create_appointment` / `create_ticket` write against
  `conversation_id`, with the two rules the voice side learned the hard way: a booking without a
  contact is still a booking, and one conversation books one appointment. The prompt forbids
  claiming a booking without the matching tool call.
- **The ordering question that was left open is answered:** the model flag did NOT need to come
  first. `PLATFORM_MODEL_ENABLED` protects *voice's* dual-write; Telegram has no legacy store, so
  `conversations`/`messages` is simply where it lives. It will be the first real traffic those
  tables ever see — which also gives the shared model a live proof that does not require touching
  the voice path.
- **Spend guard:** 30 replies per conversation per hour, counted in the database, because
  `lib/rateLimit.ts` is a no-op on Vercel. R-030 is still open for a real limiter.

**Proven on production 2026-08-27** with a real bot, verified in the database afterwards:

| Step | Evidence |
|---|---|
| Bot connected | `telegram_connections` row, webhook registered, token encrypted |
| Message received | `conversations` + `messages` rows — **the first real traffic the shared model has ever seen** |
| Contact has a real name | `contacts.display_name` populated from message one — this channel answers P3 for itself |
| AI answered | `meta.generated: true` |
| Business context reached the customer | the AI quoted the real hours — **the same facts the phone AI quotes** |
| Human took over from the Inbox | `meta.generated: false` + `sent_by`; handling flipped to `human` |
| **AI held its tongue** | the customer wrote again and the AI did NOT answer |
| Handed back | handling returned to `ai`, assignment cleared, AI answered the next message |

Two things were found by running it, not by reading it:

1. **`/start` produced silence.** It is not typed — it is the button that opens the bot — and the
   model returned nothing useful for the literal string. A new customer saw an empty chat until
   they typed again. Now answered deterministically from the employee's greeting, with no model
   call (commit `3ff49ab`).
2. **Replies take 6–9 seconds.** Not measured further, but the webhook makes ~10 sequential
   Supabase round trips before the model is even called — which is R-138's coast-to-coast latency
   again, plus Hobby cold starts. Same root cause as the Inbox; fixing the region fixes both.

**Still NOT proven, and this is what `productionReady: false` is waiting on:** no chat conversation
has yet produced an **artifact**. Run the booking script above — it must create the appointment,
correct it rather than duplicate it on "make it 4pm", create a ticket for the refund question
without asking for a name it already has, and email the owner. Only then flip the flag.

**What is left, and it is all operator work:**

1. ~~Encryption key + `TELEGRAM_WEBHOOK_BASE_URL`~~ **done** (the key is
   `INSTAGRAM_TOKEN_ENCRYPTION_KEY`; readiness now names whichever one is in force and catches a
   key deployed under a name nothing reads — that mistake was made and cost a deploy).
2. ~~Apply `supabase/migrations/20260827200000_telegram_channel.sql`~~ **done.**
3. ~~Connect a bot and hold a conversation~~ **done** — see the table above.
4. **Assign an AI Employee to the connection.** It was left unassigned, so the reply fell back to
   the org's oldest agent: correct behaviour, but `conversations.agent_id` is null and the record
   does not say who answered. Channels → Telegram → "Which AI Employee answers here".
5. **Run the booking script** (below) — the artifact half is untested.
6. Only then flip `telegram.productionReady` to `true`.

**The Telegram test script** (mirrors the phone script — each line checks a rule):

> **You:** Hi — what time do you open on Saturday?
> *(must answer from business context, or say it does not know and create a ticket — never invent hours)*
> **You:** Can I book for tomorrow at 3pm?
> *(must confirm the booking on the line, and an `appointments` row must exist with `conversation_id` set)*
> **You:** Actually make it 4pm.
> *(must UPDATE the same appointment — two rows on the owner's calendar for one conversation is a bug)*
> **You:** Can someone call me about a refund?
> *(must create a ticket; must NOT ask for a name it already has from Telegram)*

Afterwards verify: `conversations`/`messages` rows exist, the contact has a real **name** (this
channel solves P3 for itself), the owner got an email, and the thread is readable in the Inbox.

Web Chat still needs R-030 first; SMS is last because A2P 10DLC registration takes weeks — start
that paperwork early if SMS matters.

### P5 — Contact recall · **code written 2026-08-28, blocked on two operator steps**

The AI knowing a returning customer. Spec: **[docs/CONTACT_RECALL_SPEC.md](docs/CONTACT_RECALL_SPEC.md)**
(R-139). Chat already works — `resolveRecall` runs beside the history load and the facts reach the
prompt, so a returning Telegram customer is greeted by name with their own next appointment, with
no verification turn (that channel's identity is strong). **Voice is written but not reachable**,
because its half is a Vapi tool and a Vapi tool's definition lives in the Vapi account, not here.

The rule the whole feature turns on: **the verification question must not contain the answer.**
"Am I speaking with Jack?" tells whoever picked up that the number belongs to Jack, before they
answer and regardless of what they answer. The tool description must instruct the open form.

**P5.1 — Create the `identify_caller` tool in the Vapi account.** *(operator, ~10 min)*

- Name it `identify_caller`; server URL is the same `/api/tools` base the other two use.
- One body parameter: `name` (string, required) — what the caller said when asked who they are.
- Headers, exactly as the other two tools send them: `x-denku-secret`, `x-vapi-call-id`
  (`{{call.id}}`), `x-vapi-customer-number` (`{{customer.number}}`).
- **The description is the security control, not decoration.** It must tell the assistant to ask
  *"Who am I speaking with?"* and never to say a name first, and to call this tool once, early,
  with whatever the caller answered.
- The handler's full contract is written at the top of
  `web/src/app/api/tools/identify-caller/route.ts` — three bookings were lost to a Vapi definition
  and its handler drifting apart, so change them together.

**P5.2 — Register the tool id and reconcile.** *(after P5.1)*

- Add the id Vapi returns to `DENKU_TOOL_IDS` in `web/src/lib/vapi/assistantConfig.ts`.
  ⚠️ Not done in the recall commit on purpose: that file was in flight in another session, and the
  id does not exist until P5.1 is done.
- Run `POST /api/internal/reconcile-vapi-assistants` so existing assistants pick the tool up —
  `ensureAssistantConfig` merges `toolIds`, it never replaces them.

**Then verify on a real call, in this order** (spec §10 — the first one is the security property):

1. Ring from a **known number** and give the **wrong** name. The AI must disclose **nothing** — no
   name, no appointment, and it must not say "I have no record of you" either.
2. Ring from the same number and give the **right** name. It should greet you and know your own
   next appointment.
3. Message the Telegram bot as a returning contact — recall should appear with **no** verification
   turn at all.

**Known limit, deliberately shipped:** a caller who gives a name that does not match is still
linked to the existing lead, because both tool routes resolve a lead with `.eq("phone").maybeSingle()`
and a second lead on one number would make that error — i.e. break booking for that number. The
read + verification half is complete and discloses nothing; the write half needs those lookups made
deterministic first. Recorded in the spec §9.

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
- **Telegram needs three things before it can be tested:** the `20260827200000_telegram_channel`
  migration applied, an encryption key (`SECRET_ENCRYPTION_KEY` or the existing Instagram one),
  and `TELEGRAM_WEBHOOK_BASE_URL=https://www.denku.io`.
- **Supabase prod is in `us-west-2`; Vercel functions default to `iad1`.** See P1 — this is
  probably most of the Inbox latency, and it is a one-line `vercel.json` change to test.
- The Vapi **tool definitions live in the Vapi account, not this repo.** The contract they must
  satisfy is documented at the top of `app/api/tools/create-appointment/route.ts`; three bookings
  were lost to those two drifting apart.

---

## ✅ DONE — Voice and Chat as two products (opened and shipped 2026-09-02)

> Asked by the owner after hitting "No active Stripe subscription found" while buying a chat
> channel: **"voice planları ve chat planları — bunların her biri farklı ürünler. Voice alan biri
> chat planı da alabilir, vice versa."**

### What is wrong today

`org_plan_limits` holds exactly **one** `plan_code` per org. So a customer who wants chat and no
phone line is parked on **`chat_only`** — a $0 voice plan carrying zero minutes, zero concurrency
and zero numbers. It works, and it is a fiction: the workspace is described by a voice plan it did
not buy, and every screen that reasons about "the plan" has to know that one of the plans is not
really a plan.

Two things fall out of that fiction:

- **`plan_code IS NULL` means preview mode.** A chat customer therefore cannot simply have no voice
  plan — they would be treated as having bought nothing and be gated out of paid features. Hence
  the fake plan.
- **Chat is only purchasable two different ways, and the billing page knows only one of them.**
  `startChatCheckout` (an onboarding server action) creates a real Stripe subscription priced at
  the chat tier; `/api/billing/addons/update` adds the tier as a line item to a subscription that
  already exists. The billing page always does the second. A workspace with a plan but **no Stripe
  subscription** — set by a support action, an abandoned checkout, or development — therefore hits
  a dead end. That is the reported bug, and it is a symptom of the model, not a separate defect.

### Target model

Two independent products. A workspace may hold either, both, or neither.

| | Where it lives | Values |
|---|---|---|
| **Voice plan** | `org_plan_limits.plan_code` | `starter` · `growth` · `scale` · NULL = no voice |
| **Chat plan** | `billing_org_addons` (already) | `chat_basic` · `chat_standard` · none |

**`chat_only` is retired.** A chat customer is simply a workspace with no voice plan and a chat
tier. Only **one org** is on it in production, so the backfill is a single row.

### What has to change, and why each one

1. **`isPreviewMode`** — from "no voice plan" to "**bought nothing at all**". This is the load-
   bearing one: it is what lets a chat customer stop needing a fake voice plan. (`lib/billing/isPreviewMode.ts`)
2. **`checkOnboarding.hasActivePlan`** — same redefinition, or a chat customer cannot reach the
   dashboard they are paying for. Also `loginAction`, `verify-email/checkConfirmed`, `onboarding/page`.
3. **Activation** — `runActivation` currently skips provisioning *when the plan is `chat_only`*.
   Becomes: skip when there is **no voice plan**. Same behaviour, honest condition.
4. **Billing page** — voice plans and chat plans as two sections that do not gate each other. The
   chat buttons lose their `hasPlan` condition.
5. **Purchase routing (this is the reported bug)** — buying chat must ask *does this workspace have
   a Stripe subscription?* With one, chat is a line item (`addons/update`). Without one, chat starts
   its own checkout (`startChatCheckout`, promoted out of onboarding so the billing page can call
   it). Neither path is new; only the choosing is.
6. **`usageMath.ts`** — drop `chat_only` from `PlanCode` once the single row is backfilled.
7. **Backfill** — the one `chat_only` org becomes `plan_code = NULL`, keeping its chat add-on.
   Reversible; nothing about its Stripe subscription changes.

### Decisions already taken (do not re-litigate)

- **One Stripe subscription, several line items.** A customer who holds both products has one
  subscription carrying a voice item and a chat item. Two subscriptions would double the invoices,
  the dunning and the proration for no gain, and the add-on machinery already works this way.
- **Chat stays capacity-priced** (how many channels), not metered by messages. Unchanged.
- **`chat_only` is retired rather than kept as a legacy value.** With one row, carrying it forever
  would cost more in explanation than in migration.

### Definition of done — met

A workspace can buy chat with no voice plan, buy voice later, and hold both — with the dashboard,
preview-mode gating, activation and the billing page all telling the truth at every step. No screen
mentions `chat_only`. Verified on production: a workspace holding `growth` + `chat_standard` shows
both, priced, in the right order.

### What it cost, and what that bought

Shipping this broke something first, and the break is worth keeping written down.

`startChatCheckout` was written for the signup wizard and **hardcoded its Stripe return to
`/onboarding`**. Moving the billing page onto that action without changing where it returns dropped
a paying customer into the signup flow, which re-ran activation on a workspace that had been live
for months, which saw a voice plan and did what activation is for: **bought a US phone line.** One
hardcoded URL, one real number, billed monthly.

Two fixes, and the second is the one that matters: the return path is now chosen from an allowlist,
**and activation refuses a workspace that is already live** (step 6 is Live; there is no work left
at 6). The routing bug was mine and is fixed. That a routing mistake could reach a payment
processor at all was the real defect, so the refusal lives where the spending does.

Three more things surfaced by using it, all now fixed: `addons.active` in the billing summary was a
literal naming two add-on keys, so a workspace that had bought chat was reported as owning none of
it; the forecast showed a single "Add-ons $608.00" with no way to tell what was in it; and the
dashboard chrome asked `profiles` for a non-existent `avatar_url`, which made PostgREST reject the
whole request and quietly gave every user the neutral fallback instead of their own name.
