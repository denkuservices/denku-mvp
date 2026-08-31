-- Backfill `agents.vapi_phone_number_id` — repairs workspace-pause enforcement
--
-- WHAT: for every phone line that has a backing agent, copy the Vapi phone-number id from
-- `phone_lines` (and from `organization_settings` for the onboarding "Main Line" agent) onto
-- the agent row, where the agent does not have one yet.
--
-- WHY this is a billing-enforcement fix, not tidy-up: `unbindOrgPhoneNumbers` /
-- `rebindOrgPhoneNumbers` (web/src/lib/vapi/phoneNumberBinding.ts) select agents where BOTH
-- `vapi_assistant_id` AND `vapi_phone_number_id` are non-null, then PATCH the number to
-- `assistantId: null`. That PATCH is the ONLY thing that actually stops inbound calls
-- (routing truth = the phone number's assistantId). An agent missing this column is invisible
-- to that query, so **its line keeps answering calls on a paused workspace** — pausing for
-- `hard_cap` or `past_due` silently does nothing for it. `/api/phone-lines/purchase` wrote the
-- number id only onto `phone_lines`, so every purchased extra line is affected; the onboarding
-- resume path could leave the main agent unlinked for the same reason.
--
-- The code side is fixed by `web/src/lib/vapi/agentPhoneLink.ts#linkAgentToPhoneNumber`, called
-- from the purchase route and from `runActivation`. This migration repairs rows created before
-- that landed. See docs/BYO_PHONE_NUMBERS_PLAN.md §3.
--
-- ⚠ FILENAME DATE: this was applied on **2026-08-31**, not the 08-29 its version implies. The
-- Supabase MCP stamps the version from the LOCAL clock, and that clock was two days behind at
-- the time. The filename matches what prod actually recorded, which is what matters for
-- repo↔prod sync — do NOT "correct" it. It still sorts before 20260831081251, and it really was
-- applied before that one, so the ordering is honest.
--
-- SAFETY: `agents_vapi_phone_number_id_uq` is a partial UNIQUE index on
-- (vapi_phone_number_id) WHERE NOT NULL. Both statements therefore refuse to write a number id
-- that another agent row already holds, so the backfill can never fail on a duplicate: it
-- repairs what it safely can and reports the rest. Idempotent — re-running is a no-op because
-- every statement is guarded by `vapi_phone_number_id IS NULL`.

-- 1) Phone lines (purchased lines, 1:1 with their backing agent).
update public.agents a
   set vapi_phone_number_id = pl.vapi_phone_number_id,
       updated_at           = now()
  from public.phone_lines pl
 where pl.assigned_agent_id     = a.id
   and pl.org_id                = a.org_id
   and a.vapi_phone_number_id  is null
   and pl.vapi_phone_number_id is not null
   and not exists (
         select 1
           from public.agents other
          where other.vapi_phone_number_id = pl.vapi_phone_number_id
            and other.id <> a.id
       );

-- 2) The onboarding "Main Line" agent, whose number lives on organization_settings.
update public.agents a
   set vapi_phone_number_id = os.vapi_phone_number_id,
       updated_at           = now()
  from public.organization_settings os
 where os.main_agent_id         = a.id
   and os.org_id                = a.org_id
   and a.vapi_phone_number_id  is null
   and os.vapi_phone_number_id is not null
   and not exists (
         select 1
           from public.agents other
          where other.vapi_phone_number_id = os.vapi_phone_number_id
            and other.id <> a.id
       );

-- 3) Report anything still unlinked. These are lines whose number id is already claimed by a
--    different agent row (a real inconsistency) or lines with no backing agent at all — both
--    need a human, so surface them instead of silently leaving pause enforcement broken.
do $$
declare
  orphan_lines integer;
begin
  select count(*)
    into orphan_lines
    from public.phone_lines pl
   where pl.vapi_phone_number_id is not null
     and not exists (
           select 1
             from public.agents a
            where a.org_id = pl.org_id
              and a.vapi_phone_number_id = pl.vapi_phone_number_id
         );

  if orphan_lines > 0 then
    raise warning
      'backfill_agent_phone_number_link: % phone line(s) still have no agent carrying their vapi_phone_number_id — workspace pause will NOT unbind them. Investigate before relying on pause.',
      orphan_lines;
  else
    raise notice 'backfill_agent_phone_number_link: every phone line is linked to an agent.';
  end if;
end $$;
