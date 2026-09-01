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
| `lib/platform/adapters/webchat.ts` · `transports/webchat.ts` | The two registry halves |
| `app/api/webchat/{session,send,poll}/route.ts` | The public API |
| `app/embed/chat/route.ts` | The iframe document + per-connection `frame-ancestors` |
| `public/widget.js` | The loader — the only Denku code that runs in a customer's page |
| `public/webchat/app.{js,css}` | The widget itself, inside the iframe |
| `app/(app)/dashboard/channels/web/*` | The install surface |
| `test/webchat-security.test.ts` · `test/webchat-adapter.test.ts` | 18 tests |

## Before it can be sold

1. Apply the migration (operator action — never via MCP; see landmine #10).
2. Confirm `SECRET_ENCRYPTION_KEY` is set. The channel **refuses** to issue sessions without it, and
   both the install page and `/embed/chat` say so rather than failing silently.
3. Create an install, add the real domain, paste the snippet on the site.
4. Hold a real conversation: the AI answers in the business's language and hours, a booking or
   ticket is created, the owner is emailed, a person takes over from the Inbox and the AI goes
   quiet, and handing back resumes it.
5. Verify all of it in the database, then flip `productionReady`.

## Deliberately not built

- **Attachments.** Accepting uploads from anonymous visitors on a public endpoint is its own abuse
  and storage decision, not a widget feature. `capabilities.attachments` is `false` and says so.
- **Proactive / triggered messages** ("Still there?", "10% off"). A message the business never wrote,
  sent to someone who did not ask, is a product decision nobody has made.
- **Multiple installs per workspace in the UI.** The table allows several (a group with three brand
  sites); the install screen shows one, because a customer clicking "Create" twice means "show me
  the snippet again", not "give me a second install".
- **Outbound webhooks to the customer's own CRM.** Frequently asked for alongside this, and a
  separate piece of work: the "Call events endpoint" in Settings → Workspace is Denku's *inbound*
  receiving URL for the telephony provider, not a feed anyone can subscribe to. See
  `WebhooksCard.tsx`, which says so in its own comment.
