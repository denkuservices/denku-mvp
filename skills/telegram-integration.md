# Skill — Telegram Channel

> The first chat channel Denku actually **answers on**. Read this before touching
> `lib/telegram/*`, `lib/platform/reply/*`, `lib/platform/transports/*`, or the Telegram webhook.
> Built 2026-08-27 following the channel contract in
> [platform-architecture.md](platform-architecture.md) — read that first if you have not.

## What is different about this channel

Voice and Instagram are both half-channels. Voice replies, but the replying is Vapi's, inside the
call. Instagram receives and cannot speak. Telegram is the first channel where **Denku itself
generates and sends the answer** — which is why building it meant building a thing that did not
exist in any form: a channel-agnostic **reply engine**.

That engine is the reusable part. Telegram is ~500 lines of channel specifics on top of it.
WhatsApp, Web Chat and Email should each be an adapter + a transport + a connection table, and
nothing else.

## The bot model — each customer brings their own bot

Decided 2026-08-27. The business creates its own bot in **@BotFather** and pastes the token into
Settings → Channels → Telegram. Consequences to preserve:

- The bot carries the **customer's brand** (`@bright_dental_bot`), not Denku's.
- Telegram's per-bot rate limits are theirs alone; one busy tenant cannot throttle another.
- We hold a credential that can post as their business ⇒ it is **encrypted at the application
  layer** (`lib/crypto/secretBox.ts`) on top of a service-role-only table, and the connect path
  **refuses to store it at all** when no encryption key is configured. Never add a plaintext
  fallback.
- `telegram_connections.bot_id` is **globally unique**: a token pasted into a second workspace is
  rejected with a sentence, not with a database error.

The alternative (one Denku bot, `/start denku_<org>` deep links) was rejected: the bot's name is
the business's storefront on Telegram, and one token's rate limit would be a shared fate.

## The pieces

| File | What it owns |
|---|---|
| `supabase/migrations/20260827200000_telegram_channel.sql` | `telegram_connections`. RLS on, **no policies** (service-role only). |
| `lib/telegram/api.ts` | The whole Bot API surface: `getMe`, `setWebhook`, `deleteWebhook`, `sendMessage`, `sendChatAction`. Never throws; never logs a token (`describeToken`). |
| `lib/telegram/webhookUrl.ts` | Pure. Builds `/api/webhooks/telegram/<connectionId>`; **refuses localhost** (R-077's lesson). |
| `lib/telegram/connections.ts` | Connect / disconnect / assign / resolve. Decrypts the token in exactly one place (`getBotToken`). |
| `lib/platform/adapters/telegram.ts` | Pure `normalizeInbound`. Registered in the adapter registry. |
| `app/api/webhooks/telegram/[connectionId]/route.ts` | Auth → normalize → `ingestInboundMessage` → `respondToInbound`. |
| `lib/platform/reply/*` | **The channel-agnostic reply engine** (below). |
| `lib/platform/transports/{registry,telegram}.ts` | Outbound. The mirror of the adapter registry. |
| `app/(app)/dashboard/channels/telegram/*` | Connect UI (Settings → Channels, never the sidebar). |

## Webhook authentication — read this before changing the route

**Telegram does not sign the body.** There is no HMAC, no equivalent of Meta's
`X-Hub-Signature-256`. What Telegram does is echo back the `secret_token` we registered with
`setWebhook`, in the **`X-Telegram-Bot-Api-Secret-Token`** header. That echo is therefore the
*entire* authentication for this endpoint. Consequences:

- The secret is **32 random bytes per connection**, stored on the row, compared in constant time.
- It must **never appear in a URL** — that would put it in every access log along the way.
- The connection id in the path is **addressing, not a credential**. It is needed because a
  Telegram update says nothing about which bot received it.
- It **enforces from the first request** — no observe-only mode. Unlike the Vapi webhook
  (landmine #1) this channel has never had traffic, so there is nothing to stage.

After auth passes, the route **always answers 200**. Telegram retries non-2xx, and a retry of a
message we already answered means the customer gets the reply twice. The two exceptions — unknown
connection, bad secret — answer 401 and write nothing.

**Not gated by `PLATFORM_MODEL_ENABLED`.** That flag protects *voice's* byte-for-byte legacy
behaviour during dual-write. Telegram has no legacy store; `conversations`/`messages` is its only
home. Gating it would mean a channel that receives nothing.

## The reply engine (`lib/platform/reply/`)

The order in `respond.ts` is the design:

1. **Send before storing.** A stored-but-unsent reply would show the owner a message their
   customer never received — the one lie a shared inbox must not tell. Storing after means the
   milder failure: the customer has the reply, our record is short one row, and it is logged.
2. **The outbound message carries the provider's message id**, so a redelivery cannot duplicate
   the reply in the thread.
3. **Artifacts notify after the customer is answered.**

| File | Role |
|---|---|
| `types.ts` | Vocabulary. Names no channel. |
| `employee.ts` | Which AI Employee answers (connection assignment → org's oldest agent), history (capped at 20 turns), contact name. |
| `prompt.ts` | **Pure.** The chat system prompt. Reuses `buildBusinessContextBlock` from the voice prompt so hours/services/policies are the SAME facts on the phone and in chat. Does *not* reuse the voice framing ("caller", "voice assistant"). |
| `tools.ts` | `create_appointment` + `create_ticket`, executed directly against the DB. |
| `engine.ts` | One shallow loop: model → tools → one final sentence. Provider-agnostic via `lib/llm/provider`. |
| `respond.ts` | The orchestration above. |

### Rules the prompt enforces, and why

- **Never claim work without a tool call.** "I've booked you in" with no `create_appointment`
  behind it is a lie a customer acts on. This is the chat form of the never-dead-end promise.
- **Never invent a price/policy/availability.** Unknown ⇒ say so ⇒ `create_ticket`.
- **Never ask for a name/phone/email we already have.** Same rule that cost three voice bookings.
- Short, plain text, one question at a time.

### Why the tools do not call `/api/tools/*`

Those handlers are shaped by the voice contract — they read `x-vapi-call-id` and
`{{customer.number}}` headers to find the org and the caller, neither of which exists in a chat.
Calling them would mean faking a call id. The two domain rules that matter are re-stated in
`reply/tools.ts`: **a booking without a contact is still a booking** (`lead_id` stays null), and
**one conversation books one appointment** (a second call corrects it). Chat artifacts key on
`conversation_id`, never `call_id`.

### Spend guard

`lib/rateLimit.ts` is an in-memory Map and a **no-op on Vercel** (landmine #8), so the only honest
limiter is the database: **30 outbound messages per conversation per hour**, counted in
`messages`. Enough that no real customer notices; low enough that a script pointed at a customer's
bot cannot run up a model bill overnight. R-030 (a real distributed limiter) is still open.

### When the AI stays silent

No model configured, rate limit hit, empty completion, or an LLM error ⇒ **nothing is sent**. A
canned "we'll get back to you" from a channel the owner believes is answered by AI is worse than
an obviously unanswered message. Every silence logs `[REPLY][SILENT]` with a reason.

## Contacts — the one channel where P3 solves itself

Telegram gives a stable `from.id` plus a real name from the first message, with no phone number
involved. The adapter keys the **contact** on the user id and the **thread** on the chat id (they
are the same in a private chat and different in a group). So Telegram contacts have names from
message one, while voice contacts still say "Unknown contact" (sprint P3).

## Operator setup

| Env | Needed for | Note |
|---|---|---|
| `SECRET_ENCRYPTION_KEY` *or* `INSTAGRAM_TOKEN_ENCRYPTION_KEY` | storing bot tokens | 32 bytes, base64/hex. **Set only one** — two different values make stored ciphertext undecryptable. |
| `TELEGRAM_WEBHOOK_BASE_URL` (falls back to `VAPI_WEBHOOK_BASE_URL`, then `NEXT_PUBLIC_SITE_URL`) | registering the webhook | Must be the **www** apex that does not redirect (landmine from D0 bug #7). |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | generating replies | Without it the bot receives and says nothing — the connect page warns about this before a token is pasted. |
| `ARTIFACT_NOTIFICATIONS_ENABLED` | owner email on chat artifacts | Uses `notifyNewArtifactsForConversation`. |

No global Telegram credential exists and none should be added.

## Reply latency — measured, and one half of it is unnecessary

Measured on production 2026-08-27, from the customer's send to our reply landing, after the
Vercel function region was moved to `pdx1` (beside the Oregon database — before that a plain
reply took 6–9s):

| Reply | Time |
|---|---|
| Plain answer (1 model call) | **~3.5s** |
| Booked / updated an appointment (2 model calls) | **14–16s** |

The tool path costs four times a plain reply because the model is asked **twice**: once to decide
and call the tool, then again purely to write the sentence the customer reads. That second call is
avoidable — after `create_appointment` runs we already know the time and whether it was created or
corrected, which is the whole content of the confirmation. `/start` already proves the pattern
(`greeting.ts`): the reply that is always the same sentence should not cost a model call.

Not yet done. It is a quality problem rather than a correctness one, which is why it did not block
`productionReady`.

## `productionReady` — flipped 2026-08-27, on evidence

The gate was written before the channel worked, and it turned on observation rather than on the
code being finished. All of it was verified in the database after a real conversation on
production:

- message received → `conversations` + `messages`, the first real traffic the shared model has seen
- AI answered **from the business's own hours, in the customer's own language**
- a booking created, then **corrected rather than duplicated** when the customer changed the time
- a refund request became a ticket **without asking for a name Telegram had already given**
- the owner emailed about both artifacts
- a person took the conversation over from the Inbox, the AI went quiet, and it resumed on handback

Instagram remains `productionReady: false` — it is adopted but cannot reply. **Adopted and
production-ready are different claims**; never collapse them.

## Replying by hand, and what it costs the AI

The Inbox composer is live wherever a reply can actually be delivered — `canReplyOn(channel)` AND
a reply address recorded on the conversation. Both halves, because a channel that can send in
principle is no use if this particular thread has nowhere to go. The page resolves it server-side
and hands the component a boolean; the composer never decides from the channel name.

**A human message takes the conversation over.** `sendHumanReply` flips
`conversation_handling.handling` to `"human"`, and `respondToInbound` refuses to generate while it
stays there — otherwise the owner and their AI answer the same customer seconds apart, possibly
contradicting each other, which is the failure that makes a shared inbox worse than no shared
inbox. Handing back is deliberate, from the takeover control in the context rail: "the human went
quiet" and "the human is done" are indistinguishable from the server. The customer's own
`automation_opted_out` is honoured in the same read.

Human and AI messages are both `role: assistant, direction: outbound`; `meta.generated`
distinguishes them (`false` + `sent_by` for a person), so a teammate reading back can tell their
colleague's words from the AI's.

## `/start` is answered without a model

On Telegram `/start` is not typed, it is the button that opens the bot. In the first live test it
produced **silence** — the model was asked what to say to the literal string "/start" and returned
nothing useful, so a new customer saw an empty chat until they typed again. It is now answered
deterministically from `greeting.ts`, which also saves a billed call per new customer.

The greeting prefers the employee's configured `first_message`, **unless that line describes a
phone call** ("Thanks for calling…"), because owners write that field for the phone and printing
it into Telegram tells the customer they are on a call they are not on. In that case the
business's own name carries the greeting instead.

## Known gaps (deliberate, filed)

- **No idle-conversation guarantee.** Voice creates an artifact when a call *ends*; a chat never
  ends. Today the guarantee is the model calling `create_ticket`, which the prompt makes explicit.
  A cron sweep over idle conversations with no artifact is the backstop and is not built.
- **Receive-only for attachments.** A photo's caption becomes the message; the photo is dropped.
- **No group-chat product story.** Groups normalize correctly but nobody has decided what an AI
  Employee should do in one.
