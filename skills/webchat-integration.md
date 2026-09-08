# Web Chat — the channel that runs in a stranger's browser

> Read after [`platform-architecture.md`](platform-architecture.md) (the Employee/Channel model and
> the shared ingest pipeline) and [`telegram-integration.md`](telegram-integration.md) (the reply
> engine, which this channel reuses unchanged). This file covers only what is *different* here —
> and what is different is the security model, not the pipeline.

**Status (2026-09-01):** `adopted: true`, `productionReady: false`. Built end to end; the migration
`20260901090000_web_chat_channel.sql` has **not** been applied, and no widget has been embedded on
a real customer site. Flip `productionReady` only on live evidence, exactly as Telegram was.

---

## What it is

A business pastes two lines into their website:

```html
<script>
  window.DENKU_CHAT = { siteKey: "dkweb_…" };
</script>
<script async src="https://denku.io/widget.js"></script>
```

A chat bubble appears. Visitors talk to the AI Employee; every conversation lands in the same Inbox
as voice and Telegram; anyone on the team can take over from the composer and the AI goes quiet.

## The one fact that shapes everything

Every other channel authenticates with a secret only two parties hold — a BotFather token, an OAuth
token, Meta's HMAC over the body. **This one runs in a stranger's browser.** The site key is printed
in the customer's page source. Treating it as a credential would be a lie, and building on that lie
is how a widget becomes an open AI endpoint that anyone can put on their own site.

So the site key is an **address**, not a password — the same role the connection id plays in the
Telegram webhook URL. Access control is the customer's **origin allowlist**, and the interesting
question is where it can honestly be enforced.

### Where the browser tells the truth, and where it does not

| Moment | What the browser sends | Trustworthy? |
|---|---|---|
| Loading the iframe document (`/embed/chat`) | `Referer: https://shop.com/…` | **Yes** — a page script cannot forge it |
| The widget's own `fetch` calls | `Origin: https://denku.io` | Useless — the iframe is on *our* origin, so this says nothing about whose site the visitor is on |

That table is the whole design. If the allowlist were checked on the API requests it would refuse
every legitimate call (they all claim `denku.io`) and accept nothing useful in exchange. So:

1. **`/embed/chat`** reads the browser-set `Referer`, checks it against
   `web_chat_connections.allowed_origins`, and — if it passes — mints a short-lived, HMAC-signed
   **frame token** carrying `{connection, org, parentOrigin}`.
2. **`/api/webchat/session`** takes that frame token (never a raw site key), re-checks the recorded
   origin against the allowlist *as it stands now*, and exchanges it for a **session token**
   carrying `{connection, org, session, visitor, parentOrigin}`.
3. **`/api/webchat/send` and `/poll`** take the session token. Nothing in a request body is ever
   believed about identity: `org_id` is read out of a signature, never off the wire.

Both token kinds live in `lib/webchat/token.ts`. They are deliberately **not JWTs** — no algorithm
field to confuse, no library that might accept `alg:none`; the only thing that can verify one is
that file. `verifySessionToken` refuses a frame token and vice versa, so a token minted before any
session exists cannot be used to skip the session lookup.

### Defence in depth: `frame-ancestors`

The embed response sets its own CSP with `frame-ancestors` built from *that install's* allowlist, so
the browser independently refuses to render the widget anywhere else. This is why `next.config.ts`
**excludes `/embed/*`** from the app-wide `X-Frame-Options: SAMEORIGIN` and CSP (a negative-lookahead
source) rather than loosening them for the whole app: Next.js emits headers from every matching
entry, and two `Content-Security-Policy` headers are intersected by the browser — the stricter one
would win, silently, and the widget would never render.

### What none of this covers

A client that is not a browser can send any `Referer` it likes, obtain a frame token, and call the
API. **That is irreducible** for a public endpoint with a public key, and it is not papered over.
What answers it instead:

- **`allowed_origins` empty ⇒ refuse everywhere.** Fail closed. An install that has not been told
  where it lives answers nobody. The install UI therefore asks for the domain in the same breath as
  it hands over the snippet — a widget that silently does nothing is the failure this product has
  already been bitten by.
- **Volume caps** in `lib/webchat/sessions.ts`, counted from the database because `lib/rateLimit.ts`
  is an in-memory Map and a no-op on Vercel (landmine #8): inbound messages per conversation per
  hour, and **new sessions per install per hour** — the second exists because rotating the visitor
  id is the obvious way around the first.
- The reply engine's existing spend guard (per conversation and per org per hour) still applies,
  which is where the model bill actually lives.
- The embedding origin is in every refusal log.
- **Refusals carry no CORS headers**, so a cross-origin prober cannot read the status and learn
  which check failed, or whether a site key exists.

---

## The pipeline (identical to Telegram, on purpose)

```
widget → /api/webchat/send → webChatAdapter.normalizeInbound → ingestInboundMessage → respondToInbound
```

- **Thread key = `web_chat_sessions.id`**, not the visitor id. They are one-to-one today, but the
  session is the row that can be closed and reopened, so "start a new chat" stays implementable
  without every past message following the visitor into the new thread.
- **Contact key = `visitor_id`**, a random string the *loader* keeps in the **customer's own**
  `localStorage`. Not ours: storage inside a third-party iframe is partitioned or blocked outright
  by Safari, so an id kept there would be forgotten between page loads and every visit would look
  like a new person. It is not a credential — the worst a forged one does is rejoin a conversation
  whose id the forger already had.
- **`displayName` is left null.** A placeholder like "Website visitor" would be written into
  `contacts` and later read back by recall (R-139) as if the person had said it. The AI asks for a
  name when it needs one.
- **`clientMessageId`** is generated per send and reused on retry, so a flaky mobile connection
  produces one message in the owner's Inbox rather than three.
- **`connection_id` is written onto the conversation meta**, which is the generic key
  `resolveOutboundTarget` reads — that is what makes human takeover work here with no
  channel-specific code in the Inbox.

## The transport that does not transport

`lib/platform/transports/webchat.ts` is the only transport with no provider to call. The visitor's
browser is holding the conversation open and asking us for new messages, so **a reply is delivered
by being recorded** — the row in `messages` *is* the outbound channel.

That inverts the rule `respondToInbound` is built around ("send before storing, because a
stored-but-unsent reply is a lie the Inbox tells the owner"). It is not a violation: with no
separate send there is no window in which the two can disagree. `sendText` therefore does exactly
one thing — mint the id the reply will be stored under — and both callers (`respondToInbound` for
the AI, `sendHumanReply` for a person) keep working with no special case.

Delivery to the visitor is then:
- the **`send` response**, which returns the AI's answer synchronously (the visitor is waiting);
- **`/api/webchat/poll`**, every 5s while the widget is open and the tab visible, which is how a
  reply a person typed in the Inbox ten minutes later reaches them.

Polling rather than a stream is deliberate: an SSE connection means one function invocation held
open per open widget, on a platform billed by duration, for a channel whose traffic is mostly people
who opened the bubble and wandered off. If a customer ever needs true real-time, the widget switches
to a stream and nothing else in the channel changes.

## What the visitor's browser may read

`lib/webchat/thread.ts` is a disclosure boundary, not a convenience. It returns `role`, `content`,
`createdAt` and nothing else — **never `meta`**, which carries `generated`, `sent_by`, artifact ids
and internal notes. A customer messaging a shop has no business learning which staff member typed a
reply, or that the AI opened a ticket about them. System messages are excluded (instruction, not
dialogue), and every query is scoped by org **and** conversation, both taken from the signature.

In the widget, every message is inserted with `textContent`, never as markup: the content is written
by two untrusted parties — a stranger on the internet and a language model — and rendered in a
document that holds a session token.

## Who the visitor thinks they are talking to

The header is a face, a name and a role, and all three are the business's to choose
(`display_name`, `header_subtitle`, `avatar_path`; migration `20260908063203`).

Four things about it are decisions rather than styling:

- **A default that is drawn, not photographed.** `public/webchat/agent-avatar.svg` is an
  illustrated support agent. A stock photograph of a real person, sitting at the top of thousands
  of shops' chat panels, is somebody's actual likeness being used to imply they work there — in
  every workspace at once. The illustration makes the same promise (a friendly person is waiting)
  and none of the false one.
- **The picture is stored, never linked.** See the CSP note above. Uploads land in the private
  `channel-media` bucket under `<org>/webchat/branding/<connection>/<uuid>.<ext>` and are streamed
  back by `/api/webchat/avatar/<siteKey>` on our own origin. PNG/JPEG/WebP only — **an SVG is a
  document with script in it**, and served same-origin it would be script in the frame holding the
  visitor's session token — capped at 512 KB, and the first bytes must agree with the declared
  type, because `File.type` is whatever the uploader said.
- **A new upload is a new URL.** The `?v=` is the stored file's own uuid, so the response is
  cached `immutable` and a replaced logo is still visible immediately. A stable URL would have
  meant choosing between a stale avatar and re-fetching on every page view of the customer's site.
- **The role line is optional and empty means localised.** `header_subtitle` NULL renders the
  widget's own default in the visitor's language, which beats an English one for most of them.

### The widget speaks the visitor's language now

`lib/webchat/copy.ts` holds the widget's own furniture — placeholder, Send, the attachment errors,
the default role line — in all four locales, resolved by the embed route from the `locale` the
loader passes and delivered in the boot payload. It is a third localisation mechanism on purpose:
the widget is reachable by neither of the two in landmine #22 (it is a static ES5 file inside an
iframe, and the dashboard boundary walks a different document), so its chrome was English for
everybody, under conversations the AI was holding in Turkish. `app.js` keeps an English fallback
for every key so a browser holding an older cached copy never renders a blank button.

## What a visitor may send

Uploads go through `/api/webchat/upload` (session token, then the rules in
`lib/webchat/uploads.ts`) and the key comes back for the next `send`, which re-checks that the key
belongs to *that* session. Since 2026-09-08 the allow-list carries **images, audio, video and
documents** (PDF, Word, Excel, CSV, plain text); it started at images and audio, and refusing the
invoice and the ten-second clip of the fault sent exactly the customer this channel exists for
back to email.

The ceiling is **per kind** (`WEBCHAT_UPLOAD_LIMITS`: 8 MB image, 15 MB audio and video, 10 MB
document) and must stay at or under `MEDIA_BYTE_LIMITS` in the perception stage — a higher one
here means accepting an upload the AI then reports back as too large, paid for and useless. All of
them stay under the bucket's own 20 MB limit.

Still an allow-list, and the absences are the point: **no SVG** (script), **no archives or
executables** (nobody asking a shop a question needs one, and accepting them makes a public
endpoint a file drop for someone else's malware).

## Files

| Path | What it is |
|---|---|
| `supabase/migrations/20260901090000_web_chat_channel.sql` | `web_chat_connections`, `web_chat_sessions`; RLS on, no policies |
| `lib/webchat/origins.ts` | Allowlist matching. Pure. Exact scheme+host+port, one wildcard level, never a bare `*`, never a suffix match |
| `lib/webchat/token.ts` | Frame + session tokens |
| `lib/webchat/connections.ts` | Install lifecycle: create, update, rotate key, switch off, remove |
| `lib/webchat/sessions.ts` | Visitor threads + the volume caps |
| `lib/webchat/http.ts` | Shared refusal/CORS discipline for the three public endpoints |
| `lib/webchat/thread.ts` | What the visitor may read back |
| `lib/webchat/uploads.ts` | What a visitor may attach: allow-list, per-kind ceilings, per-session count, ownership check |
| `lib/webchat/branding.ts` | The header avatar: allow-list, byte sniff, storage keys, the cache-busting URL |
| `lib/webchat/copy.ts` | The widget's own words in en/es/de/tr |
| `app/api/webchat/upload/route.ts` · `avatar/[siteKey]/route.ts` | Take one file in; stream the avatar back out |
| `public/webchat/agent-avatar.svg` | The default support agent — drawn, not photographed |
| `supabase/migrations/20260908063203_web_chat_agent_identity.sql` | `avatar_path`, `header_subtitle` |
| `lib/platform/adapters/webchat.ts` · `transports/webchat.ts` | The two registry halves |
| `app/api/webchat/{session,send,poll}/route.ts` | The public API |
| `app/embed/chat/route.ts` | The iframe document + per-connection `frame-ancestors` |
| `public/widget.js` | The loader — the only Denku code that runs in a customer's page |
| `public/webchat/app.{js,css}` | The widget itself, inside the iframe |
| `app/(app)/dashboard/channels/web/*` | The install surface |
| `test/webchat-security.test.ts` · `test/webchat-adapter.test.ts` · `test/webchat-agent-identity.test.ts` | Origins, tokens, colours, the adapter, the avatar and the widget's copy |

## Before it can be sold

1. Apply the migrations. (Both are applied to prod: `20260901090000` and `20260908063203`.)
2. Confirm `SECRET_ENCRYPTION_KEY` is set. The channel **refuses** to issue sessions without it, and
   both the install page and `/embed/chat` say so rather than failing silently.
3. Create an install, add the real domain, paste the snippet on the site.
4. Hold a real conversation: the AI answers in the business's language and hours, a booking or
   ticket is created, the owner is emailed, a person takes over from the Inbox and the AI goes
   quiet, and handing back resumes it.
5. Verify all of it in the database, then flip `productionReady`.

## Deliberately not built

- **A read of what is inside a document.** A visitor may SEND a PDF, and the business sees it in
  the Inbox — but nothing extracts its text, so the AI is told a file arrived and forbidden to
  guess what it says. Reading documents is a perception-stage change (`isUnderstandableMime`),
  not a web-chat one, and it would land on every channel at once.
- **A picture on someone else's host.** The avatar is uploaded to our bucket, never linked. The
  embed document's CSP is `img-src 'self' data:`, and the alternative — widening it per
  connection from a settings field — is a security header written by whoever last edited a form.
- **Proactive / triggered messages** ("Still there?", "10% off"). A message the business never wrote,
  sent to someone who did not ask, is a product decision nobody has made.
- **Multiple installs per workspace in the UI.** The table allows several (a group with three brand
  sites); the install screen shows one, because a customer clicking "Create" twice means "show me
  the snippet again", not "give me a second install".
- **Outbound webhooks to the customer's own CRM.** Frequently asked for alongside this, and a
  separate piece of work: the "Call events endpoint" in Settings → Workspace is Denku's *inbound*
  receiving URL for the telephony provider, not a feed anyone can subscribe to. See
  `WebhooksCard.tsx`, which says so in its own comment.
