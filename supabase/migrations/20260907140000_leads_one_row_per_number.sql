-- One row per number: merge duplicate leads, then make the natural key a fact.
--
-- WHY
-- Three route handlers each carried their own "select, and insert if missing" for leads. With no
-- unique constraint underneath, that is a race — and Vapi posts a dozen status-update events per
-- call, several of which resolve a lead, at overlapping times. Two find nothing, both insert.
--
-- The twins were survivable. What was not is that the lookup used PostgREST's `.maybeSingle()`,
-- which ERRORS when it matches more than one row rather than returning the first. So the moment a
-- number had two leads, every later lookup failed, fell through to the insert branch, and added a
-- third. The bug's only input was its own output: one real caller became 266 "customers" on the
-- first Turkish workspace, a few of them wearing a name, the rest anonymous.
--
-- WHAT THIS DOES
--   1. picks a survivor per (org_id, phone) — the earliest row, the first time that business
--      heard from that person;
--   2. carries the best name onto it, so a merge never loses the one row that knew who called;
--   3. repoints tickets.lead_id and appointments.lead_id (the only two FKs to leads);
--   4. deletes the losers;
--   5. adds the unique index, so this cannot recur.
--
-- Step 5 is the durable half. Steps 1-4 are a one-time repair, and are written to be safely
-- re-runnable: with the index in place there is nothing left to merge and every statement is a
-- no-op.
--
-- ROLLBACK
--   drop index if exists leads_org_phone_key;
-- The merge itself is NOT reversible — the duplicate rows are gone. They carried no information
-- the survivor does not: same org, same phone, and the best name is carried across in step 2.

begin;

-- 1+2) Carry the best name onto the survivor, before the losers are deleted.
--
-- "Best" = the earliest name that a person could have actually said. The app's own rule
-- (`cleanLeadName`) rejects placeholders and anything without a letter, which is what excludes
-- the rows where the caller's phone number had been stored as their name. Only fills an EMPTY
-- name: an owner's correction of a misheard name outranks anything a later call captured.
with canonical as (
  select distinct on (org_id, phone) id, org_id, phone
  from leads
  where phone is not null
  order by org_id, phone, created_at asc, id asc
),
best_name as (
  select
    c.id as keep_id,
    (array_agg(l.name order by l.created_at asc, l.id asc)
       filter (
         where l.name is not null
           and l.name ~ '[[:alpha:]]'
           and lower(btrim(l.name)) not in (
             'unknown', 'unknown caller', 'customer', 'caller',
             'n/a', 'na', 'none', 'null', 'guest', 'anonymous', 'test'
           )
       ))[1] as name
  from canonical c
  join leads l on l.org_id = c.org_id and l.phone = c.phone
  group by c.id
)
update leads k
set name = b.name,
    updated_at = now()
from best_name b
where k.id = b.keep_id
  and b.name is not null
  and k.name is null;

-- 3) Repoint the two foreign keys. Nothing else references leads.
with canonical as (
  select distinct on (org_id, phone) id, org_id, phone
  from leads
  where phone is not null
  order by org_id, phone, created_at asc, id asc
),
dupes as (
  select l.id as dupe_id, c.id as keep_id
  from leads l
  join canonical c on c.org_id = l.org_id and c.phone = l.phone
  where l.phone is not null and l.id <> c.id
)
update tickets t
set lead_id = d.keep_id
from dupes d
where t.lead_id = d.dupe_id;

with canonical as (
  select distinct on (org_id, phone) id, org_id, phone
  from leads
  where phone is not null
  order by org_id, phone, created_at asc, id asc
),
dupes as (
  select l.id as dupe_id, c.id as keep_id
  from leads l
  join canonical c on c.org_id = l.org_id and c.phone = l.phone
  where l.phone is not null and l.id <> c.id
)
update appointments a
set lead_id = d.keep_id
from dupes d
where a.lead_id = d.dupe_id;

-- 4) The losers.
with canonical as (
  select distinct on (org_id, phone) id, org_id, phone
  from leads
  where phone is not null
  order by org_id, phone, created_at asc, id asc
)
delete from leads l
using canonical c
where l.org_id = c.org_id
  and l.phone = c.phone
  and l.phone is not null
  and l.id <> c.id;

-- 5) The reason it cannot come back.
--
-- Partial, because a lead may legitimately have no phone (a web form, an email-only contact), and
-- NULLs are distinct in a unique index anyway — being explicit says so on purpose.
--
-- Deliberately NOT extended to email today: there are zero duplicate emails in production, and a
-- second unique key would give the insert path a new way to fail (a lead matching on phone but
-- colliding on email) that no caller is written to handle. Worth doing, worth doing separately.
create unique index if not exists leads_org_phone_key
  on leads (org_id, phone)
  where phone is not null;

commit;
