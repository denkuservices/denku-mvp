-- Reconnect tickets to the customer they already belonged to.
--
-- Until 2026-09-02 the voice webhook posted the caller's number to the ticket tool under
-- `lead_phone` while the route reads `requester_phone`, so every deterministically-created ticket
-- was written with a null phone and — because the lead lookup keys on that phone — a null
-- `lead_id`. The call row one table away held both the whole time.
--
-- This matters beyond tidiness: `lib/platform/recall.ts` answers "has this caller got an open
-- request?" by querying `tickets` on `lead_id`. With every ticket unlinked, the answer was always
-- no, so a returning customer was greeted as a stranger by a feature that was built correctly and
-- simply had nothing to read.
--
-- Idempotent by construction: each statement only fills a column that is currently NULL, so
-- re-running changes nothing. Non-destructive — no existing value is overwritten.
--
-- ROLLBACK: none needed. To undo, null the columns again for the affected rows; nothing else
-- reads them in a way that would have been changed by filling them.

update public.tickets t
set lead_id = c.lead_id
from public.calls c
where t.call_id = c.id
  and t.org_id = c.org_id
  and t.lead_id is null
  and c.lead_id is not null;

update public.tickets t
set requester_phone = c.from_phone
from public.calls c
where t.call_id = c.id
  and t.org_id = c.org_id
  and t.requester_phone is null
  and c.from_phone is not null;

update public.tickets t
set conversation_id = c.conversation_id
from public.calls c
where t.call_id = c.id
  and t.org_id = c.org_id
  and t.conversation_id is null
  and c.conversation_id is not null;

-- Contacts come through the conversation, which is the only place voice records one today.
update public.tickets t
set contact_id = cv.contact_id
from public.conversations cv
where t.conversation_id = cv.id
  and t.org_id = cv.org_id
  and t.contact_id is null
  and cv.contact_id is not null;
