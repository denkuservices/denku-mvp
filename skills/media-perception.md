# Media Perception — how Denku sees and hears on the chat channels

> Built 2026-09-01 (Sprint 8). The shared stage that turns a photo into a sentence and a voice
> note into the customer's own words, for **every** chat channel at once. Read this before adding
> media handling to a channel, before changing what a model is asked, and before assuming the
> Inbox shows an original file.

## The one-sentence version

A customer sends a photo or a voice note; the channel's webhook hands the bytes to a shared
stage inside `ingestInboundMessage`; that stage stores a copy, asks a model what it is, and folds
the answer **into `messages.content`** — so the Inbox, the reply engine, the intent classifier and
recall all gain sight and hearing without one line of change between them.

## Why the answer goes in `content`

This is the load-bearing decision, and it is worth defending because the obvious alternative looks
tidier.

Everything downstream already reads `messages.content`: the Inbox bubble, `loadHistory` for the
reply engine, `classifyIntent`, the ticket a human eventually reads. Putting the description
anywhere else — a `media` table, a side field, a prompt-time join — means teaching each of those
readers separately, and **the one we forgot would answer a customer as if they had sent nothing.**

So the stored body of a message with a photo is:

```
bu parça kırıldı

[image] a cracked black phone screen, glass spidered from the top-right corner
```

and of a voice note:

```
[voice message] yarın saat üçte gelebilir miyim
```

The bracket prefix is not decoration. It is what stops the model confusing **what the customer
said** with **what we observed** — the same reason a transcript names its speakers — and it is what
lets the owner see which words are their customer's and which are the AI's description.

`meta.media[]` carries the structured record beside it (kind, mime, size, status, storage path), and
that is what the Inbox uses to show the original. The text is the truth every reader gets; the meta
is the extra a renderer may use.

## The shape

```
Inbound event
  → adapter.normalizeInbound()      pure; DESCRIBES attachments, fetches nothing
  → ingestInboundMessage(..., { resolveMedia })
       Contact → Conversation
       → PERCEPTION  processInboundMedia()
            budget → per-attachment: size gate → resolve → store → model → record
            rendition = composeMessageContent(caption, records.map(renderAttachment))
       → Message (content = rendition, meta.media = records)
       → [Intent]  ← reads the ENRICHED body
       → [Automation]
  → respondToInbound({ incoming: ingested.content })
```

| File | What it owns |
|---|---|
| `lib/platform/media/types.ts` | The vocabulary + every limit (byte ceilings, per-message cap, hourly org cap, mime allow-lists) |
| `lib/platform/media/understand.ts` | The stage: budget, ordering, rendition, honest statuses |
| `lib/platform/media/store.ts` | The private `channel-media` bucket, signed reads, capped fetch, the generic URL resolver |
| `lib/llm/multimodal.ts` | The provider split — vision, transcription, video |
| `lib/platform/adapters/*.ts` | Per-channel: which native fields are attachments |
| the webhooks | Per-channel: the `MediaResolver` that knows the credential |

### Why adapters do not fetch

An adapter is pure, deterministic and never throws — that contract is what makes channels cheap to
add and cheap to test. Fetching a Telegram file needs the customer's decrypted bot token. So the
adapter emits a `ref` (a `file_id`, a CDN url, a Resend attachment id, a storage key) and the
webhook supplies a `resolveMedia` closure that already knows how to authenticate. Same injection
shape as `classifyIntent` / `runAutomation`. **Secrets stay in the webhook; the pipeline stays
channel-free.**

## Per-channel: what "attachment" means

| Channel | Attachments come from | Resolver | Notes |
|---|---|---|---|
| **Telegram** | `photo` (largest size only), `voice`, `audio`, `video`, `video_note`, `document` | `lib/telegram/media.ts` — `getFile` then a download URL **containing the bot token** | Stickers are NOT attachments: the emoji Telegram already sends says the same thing for free. The token URL must never be logged or shown. |
| **Instagram** | `message.attachments[]` of type image/audio/video/file | generic `urlMediaResolver()` — Meta's CDN link is public and short-lived | Still **receive-only**: perception does not make IG reply. `share` / `story_mention` are dropped (they need Graph access we do not have). |
| **Email** | attachments with an `id` and **not** `inline` | Resend `receiving.attachments.get()` → `download_url` → fetch | Inline parts are skipped on purpose: every corporate signature carries a logo, and reading them would cost three vision calls to learn a company has a footer. |
| **Web Chat** | storage keys the visitor uploaded first | `webChatMediaResolver()` — reads back from our own bucket | The only channel with an upload endpoint. See below. |
| **Voice** | — | — | A call **is** audio and is already understood inside the call by Vapi. Nothing in `lib/platform/media` runs for voice, and the registry says so. |
| **SMS** | — | — | A text message is text; MMS is a different product with carrier rules of its own. |

## Web Chat is the one that needed a decision

Every other channel's media arrives through a provider that knows who sent it. The widget has an
anonymous stranger on a public endpoint, and the site key is an address, not a password. The
registry used to say `attachments: false` with a comment that this was "a storage and abuse
decision of its own" — which was right.

The decision was taken, because a shop's customer photographing the item they are asking about is
the most valuable thing this channel could carry. What makes it defensible is `lib/webchat/uploads.ts`:

1. a **signed session token**, the same door `send` uses;
2. an **allow-list** of image and audio types (no SVG — SVG is script; no PDF from a stranger);
3. an **8 MB ceiling**, checked on the declared size *and* on the bytes that arrive;
4. a **per-session count** (10), counted in the bucket itself because that is the only number a
   client cannot lie about;
5. a path of `org/webchat/session/uuid`, so `send` can **prove** the key it was handed was issued
   to that same session — without this, a visitor could attach another workspace's file and have
   our AI read it back to them.

None of that makes the endpoint abuse-free. It makes the damage bounded and attributable, which for
a public endpoint is the honest goal.

## Honesty rules (the ones that will bite if broken)

- **A file we could not read must never read as one we could.** `renderAttachment` writes
  `"received, but the AI could not open it. Do not guess what it shows."`, and the system prompt
  repeats the instruction. An AI inventing what is in an unreadable photo is exactly as harmful as
  one inventing a price.
- **The prompt only claims a sense the channel has.** `buildChatSystemPrompt({ canPerceiveMedia })`
  is fed from the registry's `imageUnderstanding || audioUnderstanding`. Telling the AI on SMS that
  it can see photos makes it offer something the customer cannot do.
- **`attachments` and `imageUnderstanding` are different claims.** A channel can carry a file we
  merely store without anyone being able to read it. Surfaces asking "can I tell this business to
  send us a photo?" must check the second.
- **Never dead-end.** A message that is *only* an attachment is still a message: with no resolver
  at all, ingest stores `[image] received.` rather than dropping the row, because a customer
  seeing "sent" while the owner sees nothing is the worst outcome available.

## Money and time

- **Idempotency is enforced BEFORE the spend.** `appendMessage` already made a replayed webhook a
  no-op, but by then we would have paid for the vision call and stored a second copy. Ingest
  short-circuits on an existing `(conversation_id, external_message_id)` when there are attachments,
  and returns the content stored the first time.
- **Caps live in `types.ts`**: 8 MB image / 20 MB audio / 15 MB video, 4 attachments per message,
  200 media messages per org per hour. The hourly cap is counted in the database, because
  `lib/rateLimit.ts` is an in-memory Map and a no-op on Vercel (landmine #8). It fails **open** —
  a broken count must not make a paying customer's photo invisible. The per-session upload count
  is the one guard that fails **closed**.
- **Latency**: perception happens before the reply, so a photo adds a model call to the wait.
  Attachments are processed in parallel for exactly this reason. Expect roughly +1–2s for an image
  and +1–3s for a voice note on top of the existing reply timings.

## The provider split (`lib/llm/multimodal.ts`)

`lib/llm/provider.ts` reaches Gemini through its OpenAI-compatible endpoint so there is one client
and one code path. That trick survives images and **does not survive audio**:

- **Images** — OpenAI Chat Completions shape with a `data:` URI, on both providers.
- **Audio** — OpenAI transcribes on `/audio/transcriptions` (`whisper-1`), which accepts OGG/Opus
  as it arrives. Gemini's compatibility layer only takes `input_audio` as wav or mp3, which a
  Telegram voice note is not — so Gemini audio goes to the **native** `generateContent` endpoint
  with `inline_data`. Pretending there is one path would mean silently failing on the single most
  common voice-note format in the world.
- **Video** — Gemini only (inline). On OpenAI it returns `unsupported_by_provider` and the video is
  recorded without pretending we watched it. There is no ffmpeg in a serverless function.

Model overrides: `LLM_VISION_MODEL`, `LLM_AUDIO_MODEL`. Both default to the text model, except
OpenAI audio which defaults to `whisper-1`.

## Storage

Private bucket `channel-media`, created by
`supabase/migrations/20260901110952_channel_media_bucket.sql`. **No RLS policies on purpose**: a
bucket with no policies is reachable by the service-role client and nobody else, which is exactly
the access model (webhooks write; reads are signed server-side). Keys start with the org id so
`signedMediaUrl` can refuse to sign another tenant's object, and so a future "delete this
workspace's data" is a prefix delete.

A copy is kept because every URL a chat channel hands us dies: Telegram's expires in an hour and
carries the bot token, Instagram's expires, Resend's needs an API key. Without our own copy the
owner reads "a photo of a cracked screen" tomorrow and can never see the crack.

## Adding perception to a new channel

1. In the adapter, map the native payload's files to `InboundAttachment[]` (kind, mime, size, `ref`).
2. In the webhook, pass `{ resolveMedia }` to `ingestInboundMessage` — a closure that turns a `ref`
   into bytes using that channel's credential, never throwing, returning `null` on failure.
3. Answer `ingested.content`, not the raw normalized content.
4. In `lib/platform/channels.ts`, leave the `chat()` defaults alone (perception is on) or turn
   `attachments` / `imageUnderstanding` / `audioUnderstanding` off together if the channel truly
   cannot carry media.
5. Add cases to `test/channel-media.test.ts`.

## Not built (deliberately)

- **Sending media.** Every channel is receive-and-understand; nothing outbound carries a file.
- **Product routing from an image** ("this is the SKU they photographed"). Deferred to after the
  e-commerce integrations, by the owner's own call on 2026-09-01 — the perception layer is the part
  that has to exist first, and the description it produces is what a catalogue lookup will read.
- **In-widget voice recording.** A visitor may upload an audio file; there is no MediaRecorder UI.
- **OCR as a separate step.** The vision prompt asks for readable text to be quoted exactly, which
  covers receipts and screenshots without a second dependency.
