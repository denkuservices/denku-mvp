-- One-off data cleanup — the January test debris, 2026-08-27.
--
-- CONTEXT. A pre-D0 audit of the Vapi account found 18 assistants and 8 phone numbers, of which
-- exactly one line was correctly wired. The rest were test signups from 17–29 January whose
-- assistants had no webhook URL and no tools — they would have answered a call and recorded
-- nothing. On the Vapi side that is now cleaned up: **2 assistants, 2 numbers**, one-to-one —
-- `155b21ad` on +13213369681 (the D0 test line) and `ca9cf616` on +13213928560 (the line this
-- workspace purchased through the product). Both carry the webhook URL, the shared secret and
-- both tools.
--
-- This script makes the DATABASE agree with that. It is deliberately conservative:
--
--   * **Nothing with call history is deleted.** One test org (`18a6c65b`) has a single January
--     call attached to its agent; that row stays and only its dead Vapi ids are cleared, because
--     deleting the agent would orphan (or cascade into) a real call record.
--   * **No organization, profile or user is touched.** Tidiness is not worth a cascade through
--     tenant tables.
--   * Every statement names its rows explicitly rather than matching a pattern, so re-running it
--     is a no-op and a copy-paste accident cannot widen its blast radius.
--
-- HOW TO RUN: Supabase Dashboard → project `kebqwsdguxxjsijahrox` → SQL Editor → paste → Run.
-- Wrapped in a transaction: if any statement fails, nothing is applied.

BEGIN;

-- 1. Phone lines whose Vapi number was released on 2026-08-27. The numbers no longer exist, so
--    these rows can only mislead a surface into showing a line that cannot ring.
DELETE FROM public.phone_lines
WHERE vapi_phone_number_id IN (
  'bb2c669b-f1ae-4dea-b3b9-003874d4299f', -- +13213369695
  '969528a4-7530-4f96-a471-9d8cba2eecfe', -- +13213928659
  '51586c74-f640-4f95-ace3-cdb1e768fb6f', -- +13213928681
  '244eb750-1e73-4890-af15-a004b23cd184', -- +13213928667 (was paused)
  'd74cc45e-c6b5-4fb7-b20d-545962ae1731'  -- +13213928622
);

-- 2. The surviving purchased line records which assistant actually answers it. This column was
--    NULL on every row — the DB never knew, and the binding lived only on Vapi.
UPDATE public.phone_lines
SET vapi_assistant_id = 'ca9cf616-a0d8-4ff7-9db6-df99735788d3',
    updated_at = now()
WHERE vapi_phone_number_id = '03cd9649-daaa-493f-b3ce-8ab207698002'; -- +13213928560

-- 3. The one test agent that has a call attached: keep the row, drop the dead pointers.
UPDATE public.agents
SET vapi_assistant_id = NULL,
    vapi_phone_number_id = NULL,
    vapi_sync_status = NULL,
    updated_at = now()
WHERE id = 'f548c864-a24f-487a-900b-355ca39d0f41'; -- org 18a6c65b, 1 January call

-- 4. Test agents with zero calls and no phone line, all pointing at assistants that no longer
--    exist. `77a0a897` is included because its assistant was already missing from Vapi before
--    today — it is the 404 the reconcile pass kept reporting.
DELETE FROM public.agents
WHERE id IN (
  'ee13a03a-9da0-4d2e-b75e-2f0ef1f68c93',
  '54fd3c1e-4bff-4063-8edc-589a5fe107ed',
  '7a45efa0-188e-4719-a92c-5142f0849e5c',
  'da139f1c-355e-44fa-88c1-c89bb6c7e8d3',
  '33e98754-484f-4938-91cb-aa7b8ee252df',
  '60e990cc-8fed-4b08-b4de-dd0d97cb2289',
  'd2d7efaa-8f3a-4309-be59-63c161ac2990',
  '2f16050a-e557-4067-ad3c-7262c09f574c',
  '82c3cdda-3df6-456a-af75-eb76db06c9a0',
  '77a0a897-2f78-4a2f-9515-286372b773d9'
)
AND NOT EXISTS (SELECT 1 FROM public.calls c WHERE c.agent_id = public.agents.id);

COMMIT;

-- VERIFY (expect: 1 phone line, 2 agents, and no agent pointing at a dead assistant):
--   select phone_number_e164, vapi_assistant_id from public.phone_lines;
--   select name, vapi_assistant_id, (select count(*) from public.calls c where c.agent_id = a.id) as calls
--     from public.agents a order by calls desc;
