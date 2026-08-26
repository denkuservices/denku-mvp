# Inbox v2 — the split view

> The redesign of `/dashboard/inbox` from a filtered list page into a two-pane messaging surface:
> one persistent conversation list beside one conversation. Shipped 2026-08-26. Reference for the
> visual target: `docs/example_screenshots/dashboard_ornek_image.PNG`.

## What changed, and why

The Inbox was a list page: filters, twenty-five rows, click through to a separate detail page and
come back. Everything a customer does in an inbox — scan, open, read, open the next — cost a full
page transition and lost the scroll position, the search and the filter each time.

It is now the shape every customer already knows from their phone:

| | Before | After |
|---|---|---|
| Layout | list page → detail page | list pane ‖ conversation pane |
| List lifetime | rebuilt on every click | mounted in `layout.tsx`, survives selection |
| Filters | search + channel + date range + outcome + pager | search + channel + starred + needs-a-person, infinite scroll |
| Thread | brand-blue bubbles labelled "AI EMPLOYEE" | WhatsApp bubbles: customer white/left, us green/right |
| Context rail | permanent third column | panel from the header (the tag icon) |
| Reply | nothing | a composer, visibly present and **disabled**, naming the channel |

**The list lives in the layout.** A Next.js layout is not re-rendered when you navigate between its
children, so the list keeps its scroll position, its search text and its filter while you move from
one conversation to the next. That persistence *is* the split view. It is also why the list fetches
through a server action (`fetchInboxPageAction`) rather than from a page render: a layout cannot see
`searchParams`, and filtering belongs to the pane rather than to the URL. Deep links still work —
`?channel=`, `?q=`, `?filter=` and Home's `?handling=human` are read once on mount.

**The palette is deliberately not the dashboard's.** Elsewhere `brand-500` is the colour of action;
in a thread, side and colour are how a reader tells two voices apart before reading either. The
values are WhatsApp's, dark mode included, and they are confined to
`app/(app)/dashboard/inbox/_components/theme.ts` so no other surface can pick them up.

**Two dropped filters.** Date range and outcome are gone from the surface (owner decision,
2026-08-26). `filterConversationViews` still supports both — nothing was deleted from the read
model — so restoring them is a UI change, not a data one.

## New state, and the migration behind it

`supabase/migrations/20260826120000_conversation_stars_and_reads.sql` — **additive, RLS-locked,
service-role only, and inert until applied.**

| Table | Scope | What it holds |
|---|---|---|
| `conversation_stars` | the **org** | A conversation the business flagged. Shared: two people see the same stars. |
| `conversation_reads` | the **user** | A watermark — everything at or before `last_read_at` has been seen by this person. |

Unread is a watermark rather than a counter on purpose: a counter would have to be decremented by
whoever opened the conversation and would drift the moment two people shared an inbox. A voice call
counts as **one** unread event (counting its transcript turns would print "23 unread" for one phone
call); a chat thread counts its unseen inbound messages.

**Nothing older than tracking can be unread.** `UNREAD_TRACKING_SINCE` (the migration's own date)
bounds the rule: on the day the table lands, an org with 181 archived calls would otherwise open the
Inbox to 181 badges about calls it answered months ago. That is not a fact about their data, it is an
artefact of when we started recording — so the past stays silent and only new activity badges.

**Before the migration is applied** the Inbox renders completely: the star control shows disabled,
and **no unread badges appear at all** — never "everything unread", which would be a fabricated
number about the customer's own data. Same discipline as `conversation_handling`.

To apply: run the migration on the Denku project (`kebqwsdguxxjsijahrox`) with the rest of the
`supabase/migrations` flow. Nothing else needs enabling — there is no feature flag beyond the
existing `PLATFORM_UX_ENABLED`, which already gates the whole platform IA.

## The composer is inert on purpose

Denku cannot send on any channel today: voice is a call that already ended, Instagram is
receive-only by design (Sprint 1.5) until the reply epic and Meta's Advanced Access land. A live
looking composer would be the most dishonest control in the product — it would invite someone to
type a reply that never arrives. So it is drawn where replying will happen, disabled, and it says
why, naming the channel. When a channel gains `capabilities.outbound`,
`_components/Composer.tsx` is the one file that changes.

## Where things live

```
app/(app)/dashboard/inbox/
  layout.tsx                     the split shell + the first page of rows (server)
  page.tsx                       the "pick a conversation" pane
  [conversationId]/page.tsx      header · thread · composer, details panel from the header
  _actions.ts                    fetch page · star · mark read · takeover · opt-out
  _components/
    InboxSplit.tsx               two panes, one column at a time on a phone
    ConversationList.tsx         search · chips · rows · infinite scroll (client)
    ThreadHeader.tsx             identity · star · the details panel trigger
    Composer.tsx                 present, disabled, explains itself
    MarkRead.tsx                 records the read watermark on open
    theme.ts                     the messaging palette, confined to this surface
lib/platform/
  stars.ts  reads.ts             the two new state tables, fail-soft
  readModel/inbox.ts             one row from four tables + the name lookup
```

Tests: `test/inbox-list.test.ts` (composition, the degradation rules, the watermark rule, and the
promises the surface makes). The channel chips stay registry-driven, so
`test/channel-contract.test.ts` still holds: adding a channel needs no edit to any Inbox file.
