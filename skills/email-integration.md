# Email Integration — the forwarding channel

> The fourth channel, and the first whose native shape does not match the platform's. Read
> `skills/platform-architecture.md` for the channel contract and `skills/telegram-integration.md`
> for the reply engine before this. Status as of 2026-08-28: **adopted, code-complete, NOT
> production-ready.** Receiving, sending and AI drafting are all built and the migration is
> applied to prod (2026-08-28, verified: RLS on, zero policies, 3 CHECK constraints). Nothing has
> yet made the round trip on a real mailbox.

## Why forwarding and not "Sign in with Google"

Reading a mailbox through the Gmail API requires `gmail.readonly`, `gmail.modify`,
`gmail.compose`, or `gmail.metadata` — **every one of which is in Google's RESTRICTED class.**
That means a CASA Tier 2 security assessment, annual re-certification, and 4–12 weeks before the
first customer can connect. It is the Instagram position exactly: finished code waiting in
someone else's review queue.

Forwarding costs the customer about two minutes in their own mail settings, works identically on
Gmail, Outlook, and any cPanel host, and depends on **no external approval at all**.

Worth knowing for later: **`gmail.send` alone is merely SENSITIVE, not restricted — no CASA.**
So "read by forwarding, send through their real Gmail" is a legitimate future upgrade that skips
the DNS step for Gmail customers without reopening the CASA problem.

## What the customer actually does

1. Enters their customer-facing address (`info@theirshop.com`) in Settings → Channels → Email.
2. Denku issues `<slug>-<random>@<EMAIL_INBOUND_DOMAIN>` and shows provider-specific steps.
3. They set forwarding in Gmail / Outlook / their host.
4. **Gmail only:** Gmail mails a confirmation code to the issued address. That address is ours,
   so the webhook parses the code, follows the link, and completes the handshake — the customer
   never copies a number between two tabs. Outlook and most hosts have no such step.

## Accepted limits — state these plainly, never paper over them

| Limit | Why |
|---|---|
| **Only mail sent after forwarding is switched on** | A forwarding rule is not a mailbox sync. There is no history and no backfill. |
| **No read-state sync with Gmail** | Denku's own `conversation_reads` watermark is the only unread state. Marking something read here does not touch their inbox. |
| **Only the forwarded address** | Deliberate, not a gap: mirroring a whole mailbox would drown the Inbox in newsletters and put the owner's private mail in front of the AI. |
| **Attachments are recorded, not carried** | Metadata lands in `messages.meta.email_attachments`; the file itself is not stored, rendered, or sent. Same deliberate gap as Telegram's photos. |
| **No sending until a domain is verified** | See below. |

## Files

| Path | Role |
|---|---|
| `supabase/migrations/20260828120000_email_channel.sql` | `email_connections` + `conversation_drafts`. RLS on, no policies. |
| `web/src/lib/platform/adapters/email.ts` | The whole channel-specific brain. Pure, never throws. |
| `web/src/lib/email/channel/connections.ts` | Connection lifecycle; `selfAddressesFor` feeds the loop guard. |
| `web/src/lib/email/channel/rules.ts` | **Pure**: domain normalisation, the from-address check, `Re:` handling. No server imports, so it is testable. |
| `web/src/lib/email/channel/domains.ts` | Resend Domains: register, re-check, map status. |
| `web/src/lib/email/channel/sending.ts` | Who a reply is sent as, and the RFC threading headers. |
| `web/src/lib/platform/transports/email.ts` | Outbound. Refuses on an unverified domain. |
| `web/src/lib/platform/drafts.ts` | `conversation_drafts` — channel-agnostic. |
| `web/src/lib/email/channel/address.ts` | Issues the inbound address. |
| `web/src/lib/email/channel/gmailForwarding.ts` | Parses + completes Gmail's handshake. |
| `web/src/lib/email/channel/verification.ts` | Records forwarding verification state. |
| `web/src/app/api/webhooks/email/route.ts` | Svix-verified inbound. |
| `web/src/app/(app)/dashboard/channels/email/` | Connect surface. |
| `web/test/email-adapter.test.ts`, `email-channel-setup.test.ts`, `email-sending.test.ts` | 69 pure tests. |

Registry touchpoints — exactly the three the contract predicts, plus one href:
`channels.ts` (`connection: "credentials"`, `adopted: true`), `adapters/registry.ts`,
`readModel/channels.ts#CONNECTION_SOURCES`, and one `MANAGE_HREF` line in `ChannelCard.tsx`.
**Zero Inbox files were edited.**

## The four decisions in the adapter

1. **Thread key = the ROOT of `References`**, then `In-Reply-To`, then the message's own
   `Message-ID`. **Never the subject.** Two customers writing "Re: Merhaba" are not one
   conversation, and a customer editing the subject mid-thread has not started a new one.
2. **Body is flattened at ingest, never at render.** `DefaultTurnRenderer` prints plain text only
   so that no untrusted string brings markup with it. Rather than argue with that policy, HTML is
   reduced and quoted history + signature are cut here, once, where it is testable.
3. **Sender comes from the `From:` header.** Gmail rewrites the envelope `Return-Path` to its own
   domain when forwarding but leaves `From:` intact. Reading the envelope would name the
   forwarder every time.
4. **Contact key = lower-cased address, and nothing more.** Gmail's dot/`+tag` canonicalisation is
   deliberately NOT applied: those are the same mailbox on Gmail and different mailboxes almost
   everywhere else, and merging two customers into one contact is worse than splitting one into
   two.

## The hazard Telegram never had: loops

Email is the one channel where answering the wrong sender can run away. `isAutomatedEmail` and
`isSelfAddressed` refuse, before anything is stored:

- `Auto-Submitted:` anything but `no` (RFC 3834), `X-Auto-Response-Suppress`, `Precedence: bulk|list|junk`
- any `List-*` header
- `no-reply@`, `noreply@`, `mailer-daemon@`, `postmaster@`, `bounce(s)@`
- **our own addresses** — the concrete one: `notifyNewArtifactsForConversation` emails the owner
  on every artifact. If the owner's notification address is the mailbox they forwarded, that
  notification arrives as "a customer wrote in", gets answered, and creates another artifact.
  Nothing else in the pipeline would stop it.

Outbound AI mail carries `Auto-Submitted: auto-replied` so the *other* side's autoresponder
stands down too — the same guard, pointing the other way.

## Webhook discipline

Same shape as Telegram, different auth. Resend signs with Svix (`svix-id`, `svix-timestamp`,
`svix-signature`) over the **raw body** — so `await req.text()` first, verify, *then* parse, the
same rule Instagram follows. Missing headers or a bad signature → **401, nothing written.** After
auth passes it **always answers 200**, because Resend retries a non-2xx and a retry means the
customer is answered twice.

Routing is by **recipient address**, since a delivery says nothing about which workspace it
belongs to — hence the global unique on `inbound_address`. An unknown recipient is logged and
answered 200; retrying will not make the address exist.

The webhook payload is **metadata only**; the body and the headers that decide threading come
from `resend.emails.receiving.get(email_id)`. One fetch is unavoidable.

**Not gated by `PLATFORM_MODEL_ENABLED`** — that flag protects voice's legacy dual-write. Email
has no legacy store, so gating it would mean a channel that receives nothing. Same carve-out as
Telegram.

## Sending

Nothing goes out until the org's own domain is DKIM-verified by Resend. `resolveSendIdentity`
refuses on three independent grounds — no connection, domain not verified **by the provider**, or
a from-address that is not inside that domain — and `emailTransport` returns `{ok:false}` rather
than falling back to a Denku address. `lib/email/senders.ts` is deliberately not reused: its
`SenderKind` is a fixed `auth|notify|welcome` union that defaults to `denku.io`, and a customer
reply arriving from `notifications@denku.io` is exactly the over-claim the honesty rules forbid.

`addressBelongsToDomain` is a **security boundary**, not formatting. A naive suffix test would let
`notyourshop.com` send under `yourshop.com`'s signature; only the domain itself or a true
subdomain passes. It has its own test.

Outbound carries `In-Reply-To` + `References` (or the reply opens a NEW thread in the customer's
client, reading as a company that ignored them) and `Auto-Submitted: auto-replied` (the loop
guard's outbound half).

## Drafting

`reply_mode` defaults to `'draft'`: the AI writes, a person sends. Email is the first channel
where a wrong answer cannot be walked back — it is kept, forwarded, sometimes legally meaningful.
Auto-send is a per-connection opt-in.

Drafts live in `conversation_drafts`, **never in `messages`**. `respond.ts` and `humanReply.ts`
both state the rule: the Inbox must not show a message the customer never received. Putting a
draft in `messages` would also feed the AI its own unsent words back as history.

Two decisions that are easy to get wrong:

1. **Approving a draft is NOT a takeover.** `sendHumanReply` takes `takeover: false` on that path.
   Flipping handling to `"human"` would silence the AI on a conversation the business is happy for
   it to keep answering, and every approval would quietly cost them the automation.
2. **Tools still run in draft mode**, so the appointment is real before the sentence promising it
   is delivered — the rule `fallback.ts` already enforces. The cost is a booking to cancel if the
   owner discards the draft; the alternative, telling a customer their appointment is made with no
   record of it, is the failure that actually hurts.

Recall is name-gated on email (`recallForStatedName`, not `resolveRecall`), because
`docs/CONTACT_RECALL_SPEC.md` §3 rates an email address as only medium-strength identity: `info@`
is shared and forwarded.

## Still not proven

No real mail has round-tripped, and `EMAIL_INBOUND_DOMAIN` / `RESEND_WEBHOOK_SECRET` / the MX
record and Resend webhook are operator steps that remain open. `productionReady` stays `false`
until a real message gets a real reply, verified in the database — Telegram's standard.

## Environment

`EMAIL_INBOUND_DOMAIN` (e.g. `in.denku.io`, MX pointed at Resend), `RESEND_WEBHOOK_SECRET`,
plus the existing `RESEND_API_KEY`. Without the first, the connect path refuses to issue an
address rather than sending a customer off to configure forwarding into a black hole.
