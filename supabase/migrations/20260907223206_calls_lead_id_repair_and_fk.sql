-- Repoint calls.lead_id after the lead merge, and add the constraint that would have caught it.
--
-- WHY
-- `20260907211214_leads_one_row_per_number` merged duplicate leads. It repointed the two tables
-- that reference `leads` through a FOREIGN KEY — `tickets.lead_id` and `appointments.lead_id` —
-- because those are the two the constraint catalogue lists.
--
-- `calls.lead_id` is also a reference to a lead. It just is not a foreign key, so it did not
-- appear in that query and was missed. Seventeen calls were left pointing at rows that no longer
-- exist. Nothing crashed: a dangling uuid simply resolves to no contact, so those calls showed no
-- customer name, did not group with the rest of that person's history in the Inbox, and were
-- absent from their contact timeline. The kind of failure that is invisible until someone reads
-- the screen carefully.
--
-- `artifacts.lead_id` is not affected: `artifacts` is a VIEW.
--
-- WHAT THIS DOES
--   1. repoints every dangling calls.lead_id to the surviving lead for the same (org_id,
--      from_phone) — the same identity rule the merge itself used, and it recovers all seventeen;
--   2. nulls out anything still dangling, because a uuid pointing at nothing is worse than an
--      honest "no contact" (this is a no-op today; it exists so the FK in step 3 cannot fail on
--      a row this migration did not anticipate);
--   3. adds the foreign key, ON DELETE SET NULL, so a future merge or deletion can never leave
--      this column dangling again. That is the durable half — steps 1 and 2 are a one-time
--      repair and are safely re-runnable as no-ops.
--
-- ON DELETE SET NULL rather than CASCADE, deliberately: a call is the billing record and the
-- transcript. Deleting a contact must never delete the evidence that the call happened.
--
-- ROLLBACK
--   alter table calls drop constraint if exists calls_lead_id_fkey;
-- The repointing is not reversible, but it restores the link the merge broke rather than
-- inventing one — every repaired row now names the lead that owns its phone number.

begin;

-- 1) Recover by phone.
update calls c
set lead_id = l.id
from leads l
where c.lead_id is not null
  and l.org_id = c.org_id
  and l.phone = c.from_phone
  and not exists (select 1 from leads x where x.id = c.lead_id);

-- 2) Anything still pointing at nothing becomes an honest null.
update calls c
set lead_id = null
where c.lead_id is not null
  and not exists (select 1 from leads x where x.id = c.lead_id);

-- 3) The reason it cannot happen again.
alter table calls
  drop constraint if exists calls_lead_id_fkey;

alter table calls
  add constraint calls_lead_id_fkey
  foreign key (lead_id) references leads (id) on delete set null;

commit;
