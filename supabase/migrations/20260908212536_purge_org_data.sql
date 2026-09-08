-- Deleting a workspace: one statement, or nothing.
--
-- WHY THIS FUNCTION EXISTS
--
-- "Delete my account" is the one destructive control a customer is entitled to, and it is also the
-- one that is easiest to ship half-working. Denku has 48 tenant tables carrying `org_id` and only
-- 12 of them have a foreign key to `orgs` — so `delete from orgs` removes the workspace and leaves
-- 36 tables full of that business's call transcripts, customer phone numbers, encrypted channel
-- tokens and message bodies, keyed to an org id that no longer resolves to anything. Nobody would
-- ever see the leftovers, which is exactly why nobody would ever notice them.
--
-- Doing the same purge from the application would be 48 sequential PostgREST round trips against a
-- database in another region, with no transaction around them: an error or a timeout halfway
-- through leaves a workspace that is partly deleted, still billed, and impossible to reason about.
-- One SECURITY DEFINER function is one round trip and one transaction — it either all goes or none
-- of it does.
--
-- WHAT IT DOES
--
-- Deletes every `org_id`-scoped row in dependency order (children before parents, so the FKs that
-- are `no action` never fire), detaches any remaining member — a colleague keeps their Denku
-- account and loses this workspace, the same semantics as removing a member — and finally removes
-- the `orgs` row. Returns a jsonb map of table → rows removed, which is what the caller logs.
--
-- The table list is deliberately WRITTEN OUT rather than discovered from the catalogue at runtime.
-- A loop over `information_schema` would silently start deleting from a table added later, in
-- whatever order the catalogue happened to return — and a purge is not a place for surprises. A
-- new tenant table means a new line here, and `test/purge-org-data.test.ts` fails until it is.
--
-- WHAT IT DOES NOT DO
--
-- Nothing outside Postgres: Stripe subscriptions, Vapi numbers and assistants, Telegram webhooks
-- and stored files are the caller's job (`lib/account/deleteAccount.ts`), and the money is
-- cancelled BEFORE this runs so a failure there aborts with the data still intact.
--
-- ROLLBACK:
--   drop function if exists public.purge_org_data(uuid);
--   (Safe: nothing else calls it, and it holds no state.)

create or replace function public.purge_org_data(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_counts jsonb := '{}'::jsonb;
  v_table text;
  v_deleted bigint;
  -- Children first. `tickets` takes `ticket_activity`/`ticket_comments` with it and `audit_log`
  -- takes `audit_log_changes`, both by cascade; everything else is listed explicitly.
  v_tables text[] := array[
    'instagram_webhook_events',
    'conversation_drafts',
    'conversation_reads',
    'conversation_stars',
    'conversation_handling',
    'messages',
    'appointments',
    'tickets',
    'calls',
    'conversations',
    'contact_identities',
    'contact_notes',
    'contact_requests',
    'contacts',
    'leads',
    'agent_knowledge_documents',
    'employee_channels',
    'employee_manifests',
    'web_chat_sessions',
    'web_chat_connections',
    'telegram_connections',
    'instagram_connections',
    'instagram_data_deletion_requests',
    'email_connections',
    'commerce_connections',
    'phone_lines',
    'sip_trunks',
    'agents',
    'billing_anomaly_events',
    'billing_guardrails',
    'billing_invoice_runs',
    'billing_org_addons',
    'billing_overage_state',
    'billing_stripe_customers',
    'billing_usage_alerts',
    'call_concurrency_leases',
    'onboarding_activation_lock',
    'org_active_channels',
    'org_invites',
    'org_plan_overrides',
    'organization_settings',
    'saved_views',
    'webhook_debug',
    'email_dispatch_log',
    'audit_log'
  ];
begin
  if p_org_id is null then
    raise exception 'purge_org_data: org id is required';
  end if;

  foreach v_table in array v_tables loop
    execute format('delete from public.%I where org_id = $1', v_table) using p_org_id;
    get diagnostics v_deleted = row_count;
    if v_deleted > 0 then
      v_counts := v_counts || jsonb_build_object(v_table, v_deleted);
    end if;
  end loop;

  -- Detach, do not delete: a colleague's Denku account is theirs, not the owner's to remove.
  -- Role is reset because a dangling `owner` would make them owner of the next workspace they
  -- are added to (`profiles.role` is per-row, not per-membership).
  update public.profiles
     set org_id = null, role = 'viewer', updated_at = now()
   where org_id = p_org_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('profiles_detached', v_deleted);

  delete from public.orgs where id = p_org_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('orgs', v_deleted);

  return v_counts;
end;
$$;

comment on function public.purge_org_data(uuid) is
  'Deletes every org_id-scoped row for one workspace in dependency order, detaches remaining '
  'members, and removes the orgs row. One transaction. Service-role only — the caller '
  '(lib/account/deleteAccount.ts) has already proved ownership and cancelled billing.';

-- SECURITY DEFINER with no caller check inside: authorization happens in the application, which
-- has already re-authenticated the person and confirmed they are the sole owner. So nobody but
-- the service role may reach it — an `authenticated` grant here would be a one-argument endpoint
-- for destroying any workspace whose id you can guess.
revoke all on function public.purge_org_data(uuid) from public;
revoke all on function public.purge_org_data(uuid) from anon;
revoke all on function public.purge_org_data(uuid) from authenticated;
grant execute on function public.purge_org_data(uuid) to service_role;
