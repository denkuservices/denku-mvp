-- ===================================================================
-- R-031 — BASE SCHEMA BASELINE
--
-- Purpose: make this repository bootstrapable. Before this file existed, the
-- core tables (orgs, profiles, calls, leads, tickets, appointments, agents,
-- conversations, messages, …) appeared in NO migration — they lived only in the
-- live Supabase project. `supabase db reset` on a fresh database therefore
-- failed on the very first migration (20241201000000 does
-- `ALTER TABLE appointments ADD COLUMN call_id`, and appointments did not exist).
--
-- Contents: the complete `public` schema of the production project
-- (kebqwsdguxxjsijahrox) captured with `supabase db dump --linked --schema public`
-- on 2026-07-30, immediately after the R-134 migration reconciliation. It is
-- therefore the schema AFTER all 40 historical migrations have been applied.
--
-- Timestamp 20241101000000 places it before the earliest migration
-- (20241201000000) so it runs first on a fresh database.
--
-- ⚠️ CONSEQUENCE: every migration that follows this file runs against a database
-- that ALREADY has the final schema. They must therefore all be no-ops. Any
-- statement that is not idempotent (ADD CONSTRAINT / CREATE POLICY, which have no
-- IF NOT EXISTS form in PostgreSQL) is guarded at its own site — see the R-031
-- notes in those files. Do not remove those guards.
--
-- ⚠️ NOT APPLIED TO PRODUCTION as SQL. Production already has this schema; the
-- baseline is registered there as bookkeeping only
-- (`supabase migration repair --status applied 20241101000000`). Never run this
-- file against the live database.
--
-- Verified by `supabase db reset` against a local Docker Postgres — see
-- docs/audits/R031_BASELINE.md.
-- ===================================================================




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."acquire_org_concurrency_lease"("p_org_id" "uuid", "p_agent_id" "uuid", "p_vapi_call_id" "text", "p_limit" integer, "p_ttl_minutes" integer DEFAULT 10) RETURNS TABLE("ok" boolean, "active_count" integer, "limit_value" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_active integer;
begin
  -- Clean up expired leases first
  update public.call_concurrency_leases
    set released_at = now()
  where org_id = p_org_id
    and released_at is null
    and expires_at <= now();

  -- Count active leases for org
  select count(*) into v_active
  from public.call_concurrency_leases
  where org_id = p_org_id
    and released_at is null
    and expires_at > now();

  -- If already have a lease for this vapi_call_id, treat as ok (idempotent)
  if exists (
    select 1
    from public.call_concurrency_leases
    where org_id = p_org_id
      and vapi_call_id = p_vapi_call_id
      and released_at is null
      and expires_at > now()
  ) then
    ok := true;
    active_count := v_active;
    limit_value := p_limit;
    return next;
    return;
  end if;

  -- Enforce limit
  if v_active >= p_limit then
    ok := false;
    active_count := v_active;
    limit_value := p_limit;
    return next;
    return;
  end if;

  -- Acquire lease
  insert into public.call_concurrency_leases (
    org_id,
    agent_id,
    vapi_call_id,
    acquired_at,
    expires_at,
    released_at
  )
  values (
    p_org_id,
    p_agent_id,
    p_vapi_call_id,
    now(),
    now() + make_interval(mins => p_ttl_minutes),
    null
  )
  on conflict do nothing;

  -- Recount after insert (best-effort)
  select count(*) into v_active
  from public.call_concurrency_leases
  where org_id = p_org_id
    and released_at is null
    and expires_at > now();

  ok := true;
  active_count := v_active;
  limit_value := p_limit;
  return next;
end;
$$;


ALTER FUNCTION "public"."acquire_org_concurrency_lease"("p_org_id" "uuid", "p_agent_id" "uuid", "p_vapi_call_id" "text", "p_limit" integer, "p_ttl_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calls_ensure_webcall_meta"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  is_webcall boolean := false;
begin
  -- 1) Primary: call_type
  if new.call_type = 'webcall' then
    is_webcall := true;
  end if;

  -- 2) Webhook payload: raw_payload.message.call.type == 'webCall'
  if not is_webcall then
    if (new.raw_payload->'message'->'call'->>'type') = 'webCall' then
      is_webcall := true;
    end if;
  end if;

  -- 3) Webhook payload fallback: raw_payload.message.call.webCallUrl exists
  if not is_webcall then
    if (new.raw_payload->'message'->'call' ? 'webCallUrl') then
      is_webcall := true;
    end if;
  end if;

  -- 4) Webcall_event payload fallback: raw_payload.meta.channel == 'web'
  if not is_webcall then
    if (new.raw_payload->'meta'->>'channel') = 'web' then
      is_webcall := true;
    end if;
  end if;

  if is_webcall then
    new.raw_payload :=
      jsonb_set(
        coalesce(new.raw_payload, '{}'::jsonb),
        '{meta,channel}',
        to_jsonb('web'::text),
        true
      );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."calls_ensure_webcall_meta"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_calls_today_counts_by_phone_number"("p_org_id" "uuid", "p_vapi_phone_number_ids" "text"[]) RETURNS TABLE("vapi_phone_number_id" "text", "today_inbound_calls" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    c.vapi_phone_number_id::text AS vapi_phone_number_id,
    COUNT(*)::bigint AS today_inbound_calls
  FROM public.calls c
  WHERE c.org_id = p_org_id
    AND (c.direction IS NULL OR c.direction = 'inbound')
    AND c.started_at >= date_trunc('day', now())
    AND c.vapi_phone_number_id IS NOT NULL
    AND c.vapi_phone_number_id = ANY(p_vapi_phone_number_ids)
  GROUP BY c.vapi_phone_number_id;
$$;


ALTER FUNCTION "public"."fn_calls_today_counts_by_phone_number"("p_org_id" "uuid", "p_vapi_phone_number_ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_billing_guardrails"("p_org_id" "uuid") RETURNS TABLE("org_id" "uuid", "max_billable_minutes_per_month" integer, "max_estimated_total_due_usd_per_month" numeric, "spike_multiplier" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select
    p_org_id as org_id,
    coalesce(bg.max_billable_minutes_per_month, 20000) as max_billable_minutes_per_month,
    coalesce(bg.max_estimated_total_due_usd_per_month, 5000.00) as max_estimated_total_due_usd_per_month,
    coalesce(bg.spike_multiplier, 4.00) as spike_multiplier
  from (select 1) x
  left join public.billing_guardrails bg on bg.org_id = p_org_id;
$$;


ALTER FUNCTION "public"."get_billing_guardrails"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."instagram_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."instagram_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_valid_email"("email" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $_$
  select email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$';
$_$;


ALTER FUNCTION "public"."is_valid_email"("email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_call_cost"("p_org_id" "uuid", "p_vapi_call_id" "text", "p_cost_usd" numeric, "p_payload" "jsonb", "p_source" "text" DEFAULT 'vapi_end_of_call'::"text") RETURNS TABLE("updated" boolean, "old_cost_usd" numeric, "new_cost_usd" numeric, "cost_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_old numeric;
  v_new numeric;
  v_updated boolean := false;
  v_status text := 'unchanged';
begin
  v_new := coalesce(p_cost_usd, 0);

  select c.cost_usd
    into v_old
  from public.calls c
  where c.org_id = p_org_id
    and c.vapi_call_id = p_vapi_call_id
  limit 1;

  if not found then
    insert into public.calls (
      org_id, vapi_call_id,
      cost_usd, cost_source, cost_status,
      cost_reconciled_at, last_eoc_received_at,
      cost_raw
    )
    values (
      p_org_id, p_vapi_call_id,
      v_new, p_source, 'reconciled',
      now(), now(),
      p_payload
    );

    updated := true;
    old_cost_usd := null;
    new_cost_usd := v_new;
    cost_status := 'reconciled';
    return;
  end if;

  if v_old is null or v_old <> v_new then
    update public.calls
    set cost_usd = v_new,
        cost_source = p_source,
        cost_status = 'reconciled',
        cost_reconciled_at = now(),
        last_eoc_received_at = now(),
        cost_raw = p_payload
    where org_id = p_org_id
      and vapi_call_id = p_vapi_call_id;

    v_updated := true;
    v_status := 'reconciled';
  else
    update public.calls
    set last_eoc_received_at = now(),
        cost_raw = p_payload
    where org_id = p_org_id
      and vapi_call_id = p_vapi_call_id;

    v_updated := false;
    v_status := 'unchanged';
  end if;

  updated := v_updated;
  old_cost_usd := v_old;
  new_cost_usd := v_new;
  cost_status := v_status;
  return;
end;
$$;


ALTER FUNCTION "public"."reconcile_call_cost"("p_org_id" "uuid", "p_vapi_call_id" "text", "p_cost_usd" numeric, "p_payload" "jsonb", "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_expired_concurrency_leases"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  n integer;
begin
  update public.call_concurrency_leases
     set released_at = now(),
         updated_at = now()
   where released_at is null
     and expires_at <= now();

  get diagnostics n = row_count;
  return n;
end;
$$;


ALTER FUNCTION "public"."release_expired_concurrency_leases"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_org_concurrency_lease"("p_org_id" "uuid", "p_vapi_call_id" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_updated integer;
begin
  update public.call_concurrency_leases
    set released_at = now(),
        updated_at = now()
  where org_id = p_org_id
    and vapi_call_id = p_vapi_call_id
    and released_at is null
    and expires_at > now();

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;


ALTER FUNCTION "public"."release_org_concurrency_lease"("p_org_id" "uuid", "p_vapi_call_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "voice" "text" DEFAULT 'alloy'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'America/New_York'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vapi_assistant_id" "text",
    "vapi_phone_number_id" "text",
    "vapi_provider" "text" DEFAULT 'vapi'::"text",
    "inbound_phone" "text",
    "behavior_preset" "text",
    "agent_type" "text",
    "first_message" "text",
    "emphasis_points" "jsonb",
    "system_prompt_override" "text",
    "effective_system_prompt" "text",
    "vapi_sync_status" "text",
    "vapi_synced_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "router_persona_key" "text" DEFAULT 'router_en'::"text",
    "default_persona_key" "text" DEFAULT 'support_en'::"text",
    "business_context" "jsonb"
);


ALTER TABLE "public"."agents" OWNER TO "postgres";


COMMENT ON COLUMN "public"."agents"."behavior_preset" IS 'Preset id used to derive effective system prompt (e.g., professional, support, sales).';



COMMENT ON COLUMN "public"."agents"."agent_type" IS 'High-level agent type (e.g., receptionist, support, sales).';



COMMENT ON COLUMN "public"."agents"."first_message" IS 'First message spoken by agent at call start.';



COMMENT ON COLUMN "public"."agents"."emphasis_points" IS 'JSON list of emphasis points; used in prompt derivation.';



COMMENT ON COLUMN "public"."agents"."system_prompt_override" IS 'If set, overrides derived prompt for Vapi assistant.';



COMMENT ON COLUMN "public"."agents"."effective_system_prompt" IS 'Derived prompt computed from workspace + agent fields.';



COMMENT ON COLUMN "public"."agents"."vapi_sync_status" IS 'Sync status to Vapi: pending|synced|error.';



COMMENT ON COLUMN "public"."agents"."vapi_synced_at" IS 'Last successful sync time to Vapi.';



CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "call_id" "uuid",
    "notified_at" timestamp with time zone,
    "conversation_id" "uuid",
    "contact_id" "uuid"
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "subject" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "call_id" "uuid",
    "requester_name" "text",
    "requester_phone" "text",
    "requester_email" "text",
    "requester_address" "text",
    "notified_at" timestamp with time zone,
    "conversation_id" "uuid",
    "contact_id" "uuid"
);


ALTER TABLE "public"."tickets" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."artifacts" WITH ("security_invoker"='true') AS
 SELECT "t"."id",
    "t"."org_id",
    'ticket'::"text" AS "artifact_type",
    "t"."status",
    "t"."subject" AS "title",
    "t"."description" AS "body",
    "t"."call_id",
    "t"."conversation_id",
    "t"."contact_id",
    "t"."lead_id",
    NULL::timestamp with time zone AS "occurs_at",
    "t"."created_at",
    "t"."updated_at"
   FROM "public"."tickets" "t"
UNION ALL
 SELECT "a"."id",
    "a"."org_id",
    'appointment'::"text" AS "artifact_type",
    "a"."status",
    'Appointment'::"text" AS "title",
    "a"."notes" AS "body",
    "a"."call_id",
    "a"."conversation_id",
    "a"."contact_id",
    "a"."lead_id",
    "a"."start_at" AS "occurs_at",
    "a"."created_at",
    "a"."updated_at"
   FROM "public"."appointments" "a";


ALTER VIEW "public"."artifacts" OWNER TO "postgres";


COMMENT ON VIEW "public"."artifacts" IS 'Sprint 4.5: unified read-only projection of artifact types (ticket|appointment) across channels. Write via the underlying tables. See AI_EMPLOYEES_PLATFORM_AUDIT.md.';



CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log_changes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "audit_log_id" "uuid" NOT NULL,
    "field" "text" NOT NULL,
    "before_value" "text",
    "after_value" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log_changes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_addon_catalog" (
    "addon_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "price_usd_month" numeric(12,2) NOT NULL,
    "step" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_price_id" "text",
    CONSTRAINT "billing_addon_catalog_price_usd_month_check" CHECK (("price_usd_month" >= (0)::numeric)),
    CONSTRAINT "billing_addon_catalog_step_check" CHECK (("step" > 0)),
    CONSTRAINT "billing_addon_catalog_unit_check" CHECK (("unit" = ANY (ARRAY['seat'::"text", 'number'::"text"])))
);


ALTER TABLE "public"."billing_addon_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_anomaly_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "month" "date" NOT NULL,
    "day" "date",
    "type" "text" NOT NULL,
    "severity" "text" DEFAULT 'warn'::"text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."billing_anomaly_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_guardrails" (
    "org_id" "uuid" NOT NULL,
    "max_billable_minutes_per_month" integer DEFAULT 20000 NOT NULL,
    "max_estimated_total_due_usd_per_month" numeric(12,2) DEFAULT 5000.00 NOT NULL,
    "spike_multiplier" numeric(6,2) DEFAULT 4.00 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."billing_guardrails" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_invoice_runs" (
    "org_id" "uuid" NOT NULL,
    "month" "date" NOT NULL,
    "estimated_total_due_usd" numeric NOT NULL,
    "stripe_invoice_id" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_at" timestamp with time zone,
    "lock_token" "text",
    "finalized_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "error_message" "text"
);


ALTER TABLE "public"."billing_invoice_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_org_addons" (
    "org_id" "uuid" NOT NULL,
    "addon_key" "text" NOT NULL,
    "qty" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_org_addons_qty_check" CHECK (("qty" >= 0)),
    CONSTRAINT "billing_org_addons_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."billing_org_addons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_overage_state" (
    "org_id" "uuid" NOT NULL,
    "month" "date" NOT NULL,
    "threshold_usd" numeric DEFAULT 100 NOT NULL,
    "hard_cap_usd" numeric NOT NULL,
    "last_collected_overage_usd" numeric DEFAULT 0 NOT NULL,
    "next_collect_at_overage_usd" numeric DEFAULT 100 NOT NULL,
    "last_collect_attempt_at" timestamp with time zone,
    "last_collect_invoice_id" "text",
    "last_collect_status" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."billing_overage_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_plan_catalog" (
    "plan_code" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "monthly_fee_usd" numeric(12,2) NOT NULL,
    "included_minutes" integer NOT NULL,
    "overage_rate_usd_per_min" numeric(12,4) NOT NULL,
    "concurrency_limit" integer NOT NULL,
    "included_phone_numbers" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."billing_plan_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_stripe_customers" (
    "org_id" "uuid" NOT NULL,
    "stripe_customer_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."billing_stripe_customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_stripe_prices" (
    "plan_code" "text" NOT NULL,
    "stripe_monthly_price_id" "text" NOT NULL,
    "stripe_overage_price_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."billing_stripe_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_usage_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "month" "date" NOT NULL,
    "threshold_pct" integer NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."billing_usage_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."call_concurrency_leases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "agent_id" "uuid",
    "vapi_call_id" "text",
    "acquired_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "released_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:15:00'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "call_concurrency_leases_expires_after_acquired" CHECK (("expires_at" > "acquired_at"))
);


ALTER TABLE "public"."call_concurrency_leases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "vapi_call_id" "text" NOT NULL,
    "direction" "text" DEFAULT 'inbound'::"text",
    "from_phone" "text",
    "to_phone" "text",
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "outcome" "text",
    "transcript" "text",
    "raw_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "agent_id" "uuid",
    "intent" "text",
    "vapi_assistant_id" "text",
    "vapi_phone_number_id" "text",
    "cost_usd" numeric(10,6) DEFAULT 0,
    "duration_seconds" integer,
    "call_type" "text",
    "phone_number_id" "text",
    "lead_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "persona_key" "text",
    "intent_confidence" numeric(4,3),
    "completion_state" "text",
    "cost_source" "text",
    "cost_status" "text",
    "cost_reconciled_at" timestamp with time zone,
    "last_eoc_received_at" timestamp with time zone,
    "cost_raw" "jsonb",
    "conversation_id" "uuid",
    "manifest_revision_id" "uuid",
    CONSTRAINT "calls_completion_state_chk" CHECK ((("completion_state" IS NULL) OR ("completion_state" = ANY (ARRAY['completed'::"text", 'partial'::"text", 'abandoned'::"text"])))),
    CONSTRAINT "calls_intent_confidence_range_chk" CHECK ((("intent_confidence" IS NULL) OR (("intent_confidence" >= (0)::numeric) AND ("intent_confidence" <= (1)::numeric))))
);


ALTER TABLE "public"."calls" OWNER TO "postgres";


COMMENT ON COLUMN "public"."calls"."manifest_revision_id" IS 'Sprint 8 (R-107): the employee manifest revision that handled this call — makes past behavior reconstructable.';



CREATE TABLE IF NOT EXISTS "public"."contact_identities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "external_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contact_identities" OWNER TO "postgres";


COMMENT ON TABLE "public"."contact_identities" IS 'Sprint 4.5: per-channel handle for a Contact. UNIQUE(org_id,channel,external_id) for idempotent resolution.';



CREATE TABLE IF NOT EXISTS "public"."contact_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid",
    "work_email" "text" NOT NULL,
    "name" "text",
    "company" "text",
    "industry" "text",
    "channels" "text"[],
    "tools" "text",
    "estimated_volume" "text",
    "message" "text",
    "source" "text" DEFAULT 'marketing_contact'::"text" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_requests_work_email_not_blank" CHECK (("length"(TRIM(BOTH FROM "work_email")) > 3))
);


ALTER TABLE "public"."contact_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "display_name" "text",
    "primary_phone" "text",
    "primary_email" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


COMMENT ON TABLE "public"."contacts" IS 'Sprint 4.5 platform model: channel-agnostic person. Generalizes leads. See AI_EMPLOYEES_PLATFORM_AUDIT.md.';



CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "agent_id" "uuid",
    "channel" "text" DEFAULT 'web'::"text" NOT NULL,
    "external_user_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_activity_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contact_id" "uuid",
    "external_thread_id" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "last_message_at" timestamp with time zone,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "manifest_revision_id" "uuid"
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversations" IS 'Sprint 4.5 platform backbone: canonical channel-agnostic interaction. channel=voice|instagram|web|… external_thread_id = channel-native thread. See AI_EMPLOYEES_PLATFORM_AUDIT.md.';



CREATE TABLE IF NOT EXISTS "public"."employee_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "connection_ref" "uuid",
    "external_id" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employee_channels" OWNER TO "postgres";


COMMENT ON TABLE "public"."employee_channels" IS 'Sprint 4.5 platform model: maps an AI Employee (agents.id) to a Channel. connection_ref is a polymorphic pointer (phone_lines.id | instagram_connections.id). See docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md.';



CREATE TABLE IF NOT EXISTS "public"."employee_manifests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "revision" integer NOT NULL,
    "manifest" "jsonb" NOT NULL,
    "content_hash" "text" NOT NULL,
    "reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employee_manifests" OWNER TO "postgres";


COMMENT ON TABLE "public"."employee_manifests" IS 'Sprint 8 (R-107): immutable, versioned desired-state revisions of an AI Employee. Observed state (cost/KPIs/health) is computed elsewhere by design. See docs/audits/AI_EMPLOYEE_CORE_AUDIT.md.';



CREATE TABLE IF NOT EXISTS "public"."instagram_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "ig_user_id" "text" NOT NULL,
    "username" "text",
    "account_type" "text",
    "access_token_encrypted" "text",
    "token_expires_at" timestamp with time zone,
    "scopes" "text"[],
    "status" "text" DEFAULT 'connected'::"text" NOT NULL,
    "last_refreshed_at" timestamp with time zone,
    "last_error" "text",
    "connected_by" "uuid",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "instagram_connections_status_check" CHECK (("status" = ANY (ARRAY['connected'::"text", 'revoked'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."instagram_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instagram_data_deletion_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "confirmation_code" "text" NOT NULL,
    "ig_user_id" "text",
    "org_id" "uuid",
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "detail" "text",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "instagram_data_deletion_requests_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."instagram_data_deletion_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instagram_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid",
    "object" "text",
    "entry_id" "text",
    "ig_user_id" "text",
    "event_type" "text",
    "payload" "jsonb" NOT NULL,
    "headers" "jsonb",
    "signature_valid" boolean,
    "processed" boolean DEFAULT false NOT NULL,
    "error_message" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "conversation_id" "uuid",
    "message_id" "uuid"
);


ALTER TABLE "public"."instagram_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text",
    "phone" "text",
    "email" "text",
    "source" "text" DEFAULT 'unknown'::"text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contact_id" "uuid"
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_message_id" "text",
    "direction" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text", 'tool'::"text"])))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."messages"."external_message_id" IS 'Channel-native message id; (conversation_id, external_message_id) is UNIQUE for idempotent append.';



CREATE TABLE IF NOT EXISTS "public"."onboarding_activation_lock" (
    "org_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "last_error" "text",
    CONSTRAINT "onboarding_activation_lock_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'succeeded'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."onboarding_activation_lock" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."org_daily_concurrency_peak" AS
 WITH "bounds" AS (
         SELECT "call_concurrency_leases"."org_id",
            ("min"("call_concurrency_leases"."acquired_at"))::"date" AS "min_day",
            ("max"(COALESCE("call_concurrency_leases"."released_at", "call_concurrency_leases"."expires_at")))::"date" AS "max_day"
           FROM "public"."call_concurrency_leases"
          GROUP BY "call_concurrency_leases"."org_id"
        ), "days" AS (
         SELECT "b_1"."org_id",
            ("d"."d")::"date" AS "day",
            (("d"."d")::"date")::timestamp with time zone AS "day_start",
            ((("d"."d")::"date" + 1))::timestamp with time zone AS "day_end"
           FROM ("bounds" "b_1"
             CROSS JOIN LATERAL "generate_series"(("b_1"."min_day")::timestamp with time zone, ("b_1"."max_day")::timestamp with time zone, '1 day'::interval) "d"("d"))
        ), "lease_overlaps" AS (
         SELECT "dy_1"."org_id",
            "dy_1"."day",
            "dy_1"."day_start",
            "dy_1"."day_end",
            "l"."acquired_at",
            COALESCE("l"."released_at", "l"."expires_at") AS "end_at",
            GREATEST("l"."acquired_at", "dy_1"."day_start") AS "clip_start",
            LEAST(COALESCE("l"."released_at", "l"."expires_at"), "dy_1"."day_end") AS "clip_end"
           FROM ("days" "dy_1"
             JOIN "public"."call_concurrency_leases" "l" ON ((("l"."org_id" = "dy_1"."org_id") AND ("l"."acquired_at" < "dy_1"."day_end") AND (COALESCE("l"."released_at", "l"."expires_at") > "dy_1"."day_start"))))
        ), "base" AS (
         SELECT "dy_1"."org_id",
            "dy_1"."day",
            ("count"("l".*))::integer AS "base_active"
           FROM ("days" "dy_1"
             LEFT JOIN "public"."call_concurrency_leases" "l" ON ((("l"."org_id" = "dy_1"."org_id") AND ("l"."acquired_at" < "dy_1"."day_start") AND (COALESCE("l"."released_at", "l"."expires_at") > "dy_1"."day_start"))))
          GROUP BY "dy_1"."org_id", "dy_1"."day"
        ), "events" AS (
         SELECT "lease_overlaps"."org_id",
            "lease_overlaps"."day",
            "lease_overlaps"."clip_start" AS "ts",
            1 AS "delta"
           FROM "lease_overlaps"
        UNION ALL
         SELECT "lease_overlaps"."org_id",
            "lease_overlaps"."day",
            "lease_overlaps"."clip_end" AS "ts",
            '-1'::integer AS "delta"
           FROM "lease_overlaps"
        ), "scan" AS (
         SELECT "e"."org_id",
            "e"."day",
            "e"."ts",
            "e"."delta",
            "b_1"."base_active",
            (("b_1"."base_active" + "sum"("e"."delta") OVER (PARTITION BY "e"."org_id", "e"."day" ORDER BY "e"."ts", "e"."delta" ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)))::integer AS "concurrent_now"
           FROM ("events" "e"
             JOIN "base" "b_1" USING ("org_id", "day"))
        )
 SELECT "dy"."org_id",
    "dy"."day",
    COALESCE("max"("s"."concurrent_now"), "b"."base_active", 0) AS "peak_concurrent_calls"
   FROM (("days" "dy"
     LEFT JOIN "base" "b" ON ((("b"."org_id" = "dy"."org_id") AND ("b"."day" = "dy"."day"))))
     LEFT JOIN "scan" "s" ON ((("s"."org_id" = "dy"."org_id") AND ("s"."day" = "dy"."day"))))
  GROUP BY "dy"."org_id", "dy"."day", "b"."base_active";


ALTER VIEW "public"."org_daily_concurrency_peak" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."org_daily_usage" AS
 WITH "call_daily" AS (
         SELECT "calls"."org_id",
            ("date_trunc"('day'::"text", "calls"."ended_at"))::"date" AS "day",
            ("count"(*))::integer AS "total_calls",
            ("sum"(COALESCE("calls"."duration_seconds", 0)))::integer AS "total_duration_seconds",
            "round"((("sum"(COALESCE("calls"."duration_seconds", 0)))::numeric / (60)::numeric), 4) AS "total_minutes_exact",
            ("sum"("ceil"(((COALESCE("calls"."duration_seconds", 0))::numeric / (60)::numeric))))::integer AS "billable_minutes",
            "round"("sum"(COALESCE("calls"."cost_usd", (0)::numeric)), 6) AS "total_cost_usd"
           FROM "public"."calls"
          WHERE ("calls"."ended_at" IS NOT NULL)
          GROUP BY "calls"."org_id", (("date_trunc"('day'::"text", "calls"."ended_at"))::"date")
        )
 SELECT "d"."org_id",
    "d"."day",
    "d"."total_calls",
    "d"."total_duration_seconds",
    "d"."total_minutes_exact",
    "d"."billable_minutes",
    "d"."total_cost_usd",
    COALESCE("p"."peak_concurrent_calls", 0) AS "peak_concurrent_calls"
   FROM ("call_daily" "d"
     LEFT JOIN "public"."org_daily_concurrency_peak" "p" ON ((("p"."org_id" = "d"."org_id") AND ("p"."day" = "d"."day"))));


ALTER VIEW "public"."org_daily_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'admin'::"text" NOT NULL,
    "token" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone
);


ALTER TABLE "public"."org_invites" OWNER TO "postgres";


COMMENT ON TABLE "public"."org_invites" IS 'Sprint 6 (R-010): pending member invitations. Consumed at signup by email match. Service-role only.';



CREATE OR REPLACE VIEW "public"."org_monthly_usage" AS
 SELECT "org_id",
    ("date_trunc"('month'::"text", ("day")::timestamp with time zone))::"date" AS "month",
    ("sum"("total_calls"))::integer AS "total_calls",
    ("sum"("total_duration_seconds"))::integer AS "total_duration_seconds",
    "round"("sum"("total_minutes_exact"), 4) AS "total_minutes_exact",
    ("sum"("billable_minutes"))::integer AS "billable_minutes",
    "round"("sum"("total_cost_usd"), 6) AS "total_cost_usd",
    "max"("peak_concurrent_calls") AS "peak_concurrent_calls"
   FROM "public"."org_daily_usage"
  GROUP BY "org_id", (("date_trunc"('month'::"text", ("day")::timestamp with time zone))::"date");


ALTER VIEW "public"."org_monthly_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_plan_overrides" (
    "org_id" "uuid" NOT NULL,
    "plan_code" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "org_plan_overrides_plan_code_check" CHECK (("plan_code" = ANY (ARRAY['starter'::"text", 'growth'::"text", 'scale'::"text"])))
);


ALTER TABLE "public"."org_plan_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orgs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vapi_assistant_id" "uuid",
    "vapi_phone_number_id" "uuid",
    "phone_number_e164" "text",
    "phone_country_code" "text" DEFAULT 'US'::"text" NOT NULL,
    "phone_desired_area_code" "text",
    CONSTRAINT "orgs_phone_desired_area_code_len" CHECK ((("phone_desired_area_code" IS NULL) OR ("phone_desired_area_code" ~ '^[0-9]{3}$'::"text")))
);


ALTER TABLE "public"."orgs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."org_plan_limits" AS
 SELECT "o"."id" AS "org_id",
    "ov"."plan_code",
        CASE "lower"("ov"."plan_code")
            WHEN 'starter'::"text" THEN 1
            WHEN 'growth'::"text" THEN 4
            WHEN 'scale'::"text" THEN 10
            ELSE NULL::integer
        END AS "concurrency_limit"
   FROM ("public"."orgs" "o"
     LEFT JOIN "public"."org_plan_overrides" "ov" ON (("ov"."org_id" = "o"."id")));


ALTER VIEW "public"."org_plan_limits" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."org_monthly_concurrency_compliance" AS
 SELECT "mu"."org_id",
    "mu"."month",
    "pl"."plan_code",
    "pl"."concurrency_limit",
    "mu"."peak_concurrent_calls",
    ("mu"."peak_concurrent_calls" > "pl"."concurrency_limit") AS "is_over_limit",
    GREATEST(("mu"."peak_concurrent_calls" - "pl"."concurrency_limit"), 0) AS "over_by"
   FROM ("public"."org_monthly_usage" "mu"
     JOIN "public"."org_plan_limits" "pl" ON (("pl"."org_id" = "mu"."org_id")));


ALTER VIEW "public"."org_monthly_concurrency_compliance" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."plan_pricing" AS
 SELECT "plan_code",
    (
        CASE "plan_code"
            WHEN 'starter'::"text" THEN 149
            WHEN 'growth'::"text" THEN 399
            WHEN 'scale'::"text" THEN 899
            ELSE 0
        END)::numeric AS "monthly_fee_usd",
        CASE "plan_code"
            WHEN 'starter'::"text" THEN 400
            WHEN 'growth'::"text" THEN 1200
            WHEN 'scale'::"text" THEN 3600
            ELSE 0
        END AS "included_minutes",
        CASE "plan_code"
            WHEN 'starter'::"text" THEN 0.22
            WHEN 'growth'::"text" THEN 0.18
            WHEN 'scale'::"text" THEN 0.13
            ELSE (0)::numeric
        END AS "overage_rate_usd_per_min"
   FROM ( VALUES ('starter'::"text"), ('growth'::"text"), ('scale'::"text")) "v"("plan_code");


ALTER VIEW "public"."plan_pricing" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."org_monthly_overages" AS
 SELECT "mu"."org_id",
    "mu"."month",
    "pl"."plan_code",
    "pp"."included_minutes",
    "mu"."billable_minutes",
    GREATEST(("mu"."billable_minutes" - "pp"."included_minutes"), 0) AS "overage_minutes",
    "pp"."overage_rate_usd_per_min",
    "round"(((GREATEST(("mu"."billable_minutes" - "pp"."included_minutes"), 0))::numeric * "pp"."overage_rate_usd_per_min"), 2) AS "estimated_overage_cost_usd",
    "mu"."total_cost_usd",
    "mu"."total_minutes_exact"
   FROM (("public"."org_monthly_usage" "mu"
     JOIN "public"."org_plan_limits" "pl" ON (("pl"."org_id" = "mu"."org_id")))
     JOIN "public"."plan_pricing" "pp" ON (("pp"."plan_code" = "pl"."plan_code")));


ALTER VIEW "public"."org_monthly_overages" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."org_monthly_invoice_preview" AS
 SELECT "o"."org_id",
    "o"."month",
    "o"."plan_code",
    "pp"."monthly_fee_usd",
    "o"."included_minutes",
    "o"."billable_minutes",
    "o"."overage_minutes",
    "o"."overage_rate_usd_per_min",
    "o"."estimated_overage_cost_usd",
    "round"(("pp"."monthly_fee_usd" + "o"."estimated_overage_cost_usd"), 2) AS "estimated_total_due_usd",
    "o"."total_cost_usd",
    "o"."total_minutes_exact",
    "cc"."peak_concurrent_calls",
    "cc"."concurrency_limit",
    "cc"."is_over_limit",
    "cc"."over_by"
   FROM (("public"."org_monthly_overages" "o"
     JOIN "public"."plan_pricing" "pp" ON (("pp"."plan_code" = "o"."plan_code")))
     JOIN "public"."org_monthly_concurrency_compliance" "cc" ON ((("cc"."org_id" = "o"."org_id") AND ("cc"."month" = "o"."month"))));


ALTER VIEW "public"."org_monthly_invoice_preview" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text",
    "default_timezone" "text",
    "default_language" "text",
    "billing_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workspace_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "paused_at" timestamp with time zone,
    "paused_reason" "text",
    "onboarding_step" integer,
    "onboarding_completed_at" timestamp with time zone,
    "onboarding_goal" "text",
    "onboarding_language" "text",
    "onboarding_return_to" "text",
    "vapi_assistant_id" "text",
    "vapi_phone_number_id" "text",
    "phone_number_e164" "text",
    "main_agent_id" "uuid",
    "phone_number_sip_uri" "text",
    "welcome_email_sent_at" timestamp with time zone,
    "welcome_email_message_id" "text",
    "welcome_email_error" "text",
    "welcome_email_last_error" "text",
    "billing_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notify_on_artifacts" boolean DEFAULT true NOT NULL,
    CONSTRAINT "check_billing_status" CHECK (("billing_status" = ANY (ARRAY['active'::"text", 'past_due'::"text", 'paused'::"text"]))),
    CONSTRAINT "check_paused_reason" CHECK ((("paused_reason" IS NULL) OR ("paused_reason" = ANY (ARRAY['manual'::"text", 'hard_cap'::"text", 'past_due'::"text"])))),
    CONSTRAINT "check_workspace_status" CHECK (("workspace_status" = ANY (ARRAY['active'::"text", 'paused'::"text"]))),
    CONSTRAINT "organization_settings_workspace_status_chk" CHECK (("workspace_status" = ANY (ARRAY['active'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."organization_settings" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."organizations" AS
 SELECT "id",
    "name",
    COALESCE(NULLIF("name", ''::"text"), 'Workspace'::"text") AS "display_name",
    'mvp'::"text" AS "plan",
    'active'::"text" AS "status",
    "phone_number_e164" AS "phone_number",
    "created_at",
    "vapi_assistant_id",
    "vapi_phone_number_id"
   FROM "public"."orgs" "o";


ALTER VIEW "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."persona_tools" (
    "persona_key" "text" NOT NULL,
    "tool_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."persona_tools" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personas" (
    "key" "text" NOT NULL,
    "tier" "text" NOT NULL,
    "language" "text" NOT NULL,
    "addon_key" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "personas_tier_check" CHECK (("tier" = ANY (ARRAY['core'::"text", 'premium'::"text"])))
);


ALTER TABLE "public"."personas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."phone_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "vapi_phone_number_id" "text" NOT NULL,
    "phone_number_e164" "text" NOT NULL,
    "status" "text" DEFAULT 'live'::"text" NOT NULL,
    "line_type" "text" DEFAULT 'support'::"text" NOT NULL,
    "assigned_agent_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vapi_assistant_id" "text",
    "vapi_assistant_id_paused_backup" "text",
    CONSTRAINT "phone_lines_line_type_check" CHECK (("line_type" = ANY (ARRAY['support'::"text", 'sales'::"text", 'after_hours'::"text"])))
);


ALTER TABLE "public"."phone_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "org_id" "uuid",
    "email" "text",
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text" DEFAULT 'owner'::"text" NOT NULL,
    "phone" "text",
    "auth_user_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "actor_profile_id" "uuid",
    "event_type" "text" NOT NULL,
    "summary" "text",
    "diff" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ticket_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "author_profile_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ticket_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_debug" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "source" "text" NOT NULL,
    "headers" "jsonb",
    "body" "jsonb",
    "event_type" "text",
    "vapi_call_id" "text",
    "raw_payload" "jsonb",
    "org_id" "uuid",
    "agent_id" "uuid",
    "direction" "text",
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "lease_acquired" boolean,
    "lease_released" boolean,
    "error_message" "text"
);


ALTER TABLE "public"."webhook_debug" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."webhook_debug_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."webhook_debug_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."webhook_debug_id_seq" OWNED BY "public"."webhook_debug"."id";



ALTER TABLE ONLY "public"."webhook_debug" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."webhook_debug_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_vapi_assistant_id_key" UNIQUE ("vapi_assistant_id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log_changes"
    ADD CONSTRAINT "audit_log_changes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_addon_catalog"
    ADD CONSTRAINT "billing_addon_catalog_pkey" PRIMARY KEY ("addon_key");



ALTER TABLE ONLY "public"."billing_anomaly_events"
    ADD CONSTRAINT "billing_anomaly_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_guardrails"
    ADD CONSTRAINT "billing_guardrails_pkey" PRIMARY KEY ("org_id");



ALTER TABLE ONLY "public"."billing_invoice_runs"
    ADD CONSTRAINT "billing_invoice_runs_org_month_unique" UNIQUE ("org_id", "month");



ALTER TABLE ONLY "public"."billing_invoice_runs"
    ADD CONSTRAINT "billing_invoice_runs_pkey" PRIMARY KEY ("org_id", "month");



ALTER TABLE ONLY "public"."billing_org_addons"
    ADD CONSTRAINT "billing_org_addons_pkey" PRIMARY KEY ("org_id", "addon_key");



ALTER TABLE ONLY "public"."billing_overage_state"
    ADD CONSTRAINT "billing_overage_state_pkey" PRIMARY KEY ("org_id", "month");



ALTER TABLE ONLY "public"."billing_plan_catalog"
    ADD CONSTRAINT "billing_plan_catalog_pkey" PRIMARY KEY ("plan_code");



ALTER TABLE ONLY "public"."billing_stripe_customers"
    ADD CONSTRAINT "billing_stripe_customers_pkey" PRIMARY KEY ("org_id");



ALTER TABLE ONLY "public"."billing_stripe_prices"
    ADD CONSTRAINT "billing_stripe_prices_pkey" PRIMARY KEY ("plan_code");



ALTER TABLE ONLY "public"."billing_usage_alerts"
    ADD CONSTRAINT "billing_usage_alerts_org_id_month_threshold_pct_key" UNIQUE ("org_id", "month", "threshold_pct");



ALTER TABLE ONLY "public"."billing_usage_alerts"
    ADD CONSTRAINT "billing_usage_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."call_concurrency_leases"
    ADD CONSTRAINT "call_concurrency_leases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_identities"
    ADD CONSTRAINT "contact_identities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_requests"
    ADD CONSTRAINT "contact_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_channels"
    ADD CONSTRAINT "employee_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_manifests"
    ADD CONSTRAINT "employee_manifests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instagram_connections"
    ADD CONSTRAINT "instagram_connections_org_unique" UNIQUE ("org_id");



ALTER TABLE ONLY "public"."instagram_connections"
    ADD CONSTRAINT "instagram_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instagram_data_deletion_requests"
    ADD CONSTRAINT "instagram_data_deletion_requests_confirmation_code_key" UNIQUE ("confirmation_code");



ALTER TABLE ONLY "public"."instagram_data_deletion_requests"
    ADD CONSTRAINT "instagram_data_deletion_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instagram_webhook_events"
    ADD CONSTRAINT "instagram_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_activation_lock"
    ADD CONSTRAINT "onboarding_activation_lock_pkey" PRIMARY KEY ("org_id");



ALTER TABLE ONLY "public"."org_invites"
    ADD CONSTRAINT "org_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."org_plan_overrides"
    ADD CONSTRAINT "org_plan_overrides_pkey" PRIMARY KEY ("org_id");



ALTER TABLE ONLY "public"."organization_settings"
    ADD CONSTRAINT "organization_settings_org_id_key" UNIQUE ("org_id");



ALTER TABLE ONLY "public"."organization_settings"
    ADD CONSTRAINT "organization_settings_org_id_unique" UNIQUE ("org_id");



ALTER TABLE ONLY "public"."organization_settings"
    ADD CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."persona_tools"
    ADD CONSTRAINT "persona_tools_pkey" PRIMARY KEY ("persona_key", "tool_key");



ALTER TABLE ONLY "public"."personas"
    ADD CONSTRAINT "personas_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."phone_lines"
    ADD CONSTRAINT "phone_lines_org_id_phone_number_e164_key" UNIQUE ("org_id", "phone_number_e164");



ALTER TABLE ONLY "public"."phone_lines"
    ADD CONSTRAINT "phone_lines_org_id_vapi_phone_number_id_key" UNIQUE ("org_id", "vapi_phone_number_id");



ALTER TABLE ONLY "public"."phone_lines"
    ADD CONSTRAINT "phone_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_activity"
    ADD CONSTRAINT "ticket_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_comments"
    ADD CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_debug"
    ADD CONSTRAINT "webhook_debug_pkey" PRIMARY KEY ("id");



CREATE INDEX "agents_vapi_assistant_id_idx" ON "public"."agents" USING "btree" ("vapi_assistant_id");



CREATE UNIQUE INDEX "agents_vapi_assistant_id_uq" ON "public"."agents" USING "btree" ("vapi_assistant_id") WHERE ("vapi_assistant_id" IS NOT NULL);



CREATE INDEX "agents_vapi_phone_number_id_idx" ON "public"."agents" USING "btree" ("vapi_phone_number_id");



CREATE UNIQUE INDEX "agents_vapi_phone_number_id_uq" ON "public"."agents" USING "btree" ("vapi_phone_number_id") WHERE ("vapi_phone_number_id" IS NOT NULL);



CREATE INDEX "appointments_call_id_idx" ON "public"."appointments" USING "btree" ("call_id");



CREATE INDEX "appointments_contact_idx" ON "public"."appointments" USING "btree" ("contact_id");



CREATE INDEX "appointments_conversation_idx" ON "public"."appointments" USING "btree" ("conversation_id");



CREATE INDEX "audit_log_changes_audit_log_id_idx" ON "public"."audit_log_changes" USING "btree" ("audit_log_id");



CREATE INDEX "billing_addon_catalog_is_active_idx" ON "public"."billing_addon_catalog" USING "btree" ("is_active");



CREATE INDEX "billing_anomaly_events_org_month_idx" ON "public"."billing_anomaly_events" USING "btree" ("org_id", "month", "created_at" DESC);



CREATE INDEX "billing_invoice_runs_lock_token_idx" ON "public"."billing_invoice_runs" USING "btree" ("lock_token");



CREATE INDEX "billing_invoice_runs_status_idx" ON "public"."billing_invoice_runs" USING "btree" ("status");



CREATE INDEX "billing_invoice_runs_stripe_invoice_id_idx" ON "public"."billing_invoice_runs" USING "btree" ("stripe_invoice_id");



CREATE INDEX "billing_org_addons_addon_key_idx" ON "public"."billing_org_addons" USING "btree" ("addon_key");



CREATE INDEX "billing_org_addons_org_id_idx" ON "public"."billing_org_addons" USING "btree" ("org_id");



CREATE INDEX "billing_overage_state_month_idx" ON "public"."billing_overage_state" USING "btree" ("month");



CREATE INDEX "calls_agent_created_at_idx" ON "public"."calls" USING "btree" ("agent_id", "created_at" DESC);



CREATE INDEX "calls_agent_id_idx" ON "public"."calls" USING "btree" ("agent_id");



CREATE INDEX "calls_agent_started_idx" ON "public"."calls" USING "btree" ("agent_id", "started_at" DESC);



CREATE INDEX "calls_conversation_idx" ON "public"."calls" USING "btree" ("conversation_id");



CREATE INDEX "calls_lead_id_idx" ON "public"."calls" USING "btree" ("lead_id");



CREATE INDEX "calls_manifest_revision_idx" ON "public"."calls" USING "btree" ("manifest_revision_id");



CREATE INDEX "calls_org_created_at_idx" ON "public"."calls" USING "btree" ("org_id", "created_at" DESC);



CREATE UNIQUE INDEX "calls_org_vapi_call_id_uidx" ON "public"."calls" USING "btree" ("org_id", "vapi_call_id");



CREATE UNIQUE INDEX "calls_org_vapi_call_id_uniq" ON "public"."calls" USING "btree" ("org_id", "vapi_call_id");



CREATE UNIQUE INDEX "calls_org_vapi_call_uq" ON "public"."calls" USING "btree" ("org_id", "vapi_call_id");



CREATE UNIQUE INDEX "calls_vapi_call_id_uq" ON "public"."calls" USING "btree" ("vapi_call_id");



CREATE INDEX "contact_identities_contact_idx" ON "public"."contact_identities" USING "btree" ("contact_id");



CREATE UNIQUE INDEX "contact_identities_org_channel_ext_uidx" ON "public"."contact_identities" USING "btree" ("org_id", "channel", "external_id");



CREATE INDEX "contact_requests_created_at_idx" ON "public"."contact_requests" USING "btree" ("created_at" DESC);



CREATE INDEX "contact_requests_is_read_created_at_idx" ON "public"."contact_requests" USING "btree" ("is_read", "created_at" DESC);



CREATE INDEX "contact_requests_work_email_idx" ON "public"."contact_requests" USING "btree" ("work_email");



CREATE INDEX "contacts_org_email_idx" ON "public"."contacts" USING "btree" ("org_id", "primary_email");



CREATE INDEX "contacts_org_idx" ON "public"."contacts" USING "btree" ("org_id");



CREATE INDEX "contacts_org_phone_idx" ON "public"."contacts" USING "btree" ("org_id", "primary_phone");



CREATE INDEX "conversations_agent_id_idx" ON "public"."conversations" USING "btree" ("agent_id");



CREATE INDEX "conversations_contact_idx" ON "public"."conversations" USING "btree" ("contact_id");



CREATE INDEX "conversations_last_activity_idx" ON "public"."conversations" USING "btree" ("org_id", "last_activity_at" DESC);



CREATE INDEX "conversations_manifest_revision_idx" ON "public"."conversations" USING "btree" ("manifest_revision_id");



CREATE UNIQUE INDEX "conversations_org_channel_thread_uidx" ON "public"."conversations" USING "btree" ("org_id", "channel", "external_thread_id") WHERE ("external_thread_id" IS NOT NULL);



CREATE INDEX "conversations_org_id_idx" ON "public"."conversations" USING "btree" ("org_id");



CREATE INDEX "conversations_org_lastmsg_idx" ON "public"."conversations" USING "btree" ("org_id", "last_message_at" DESC);



CREATE INDEX "employee_channels_employee_idx" ON "public"."employee_channels" USING "btree" ("employee_id");



CREATE UNIQUE INDEX "employee_channels_org_channel_conn_uidx" ON "public"."employee_channels" USING "btree" ("org_id", "channel", "connection_ref");



CREATE INDEX "employee_channels_org_channel_idx" ON "public"."employee_channels" USING "btree" ("org_id", "channel");



CREATE UNIQUE INDEX "employee_manifests_employee_hash_uidx" ON "public"."employee_manifests" USING "btree" ("employee_id", "content_hash");



CREATE INDEX "employee_manifests_employee_rev_desc_idx" ON "public"."employee_manifests" USING "btree" ("employee_id", "revision" DESC);



CREATE UNIQUE INDEX "employee_manifests_employee_revision_uidx" ON "public"."employee_manifests" USING "btree" ("employee_id", "revision");



CREATE INDEX "employee_manifests_org_idx" ON "public"."employee_manifests" USING "btree" ("org_id");



CREATE INDEX "idx_agents_created_by" ON "public"."agents" USING "btree" ("created_by");



CREATE INDEX "idx_agents_org_id" ON "public"."agents" USING "btree" ("org_id");



CREATE INDEX "idx_agents_org_id_name" ON "public"."agents" USING "btree" ("org_id", "name") WHERE ("name" IS NOT NULL);



CREATE INDEX "idx_appointments_call_id" ON "public"."appointments" USING "btree" ("call_id") WHERE ("call_id" IS NOT NULL);



CREATE INDEX "idx_appointments_org_id_created_at" ON "public"."appointments" USING "btree" ("org_id", "created_at");



CREATE INDEX "idx_appointments_org_id_start_at" ON "public"."appointments" USING "btree" ("org_id", "start_at");



CREATE INDEX "idx_billing_invoice_runs_lock_token" ON "public"."billing_invoice_runs" USING "btree" ("lock_token") WHERE ("lock_token" IS NOT NULL);



CREATE INDEX "idx_billing_invoice_runs_status" ON "public"."billing_invoice_runs" USING "btree" ("status") WHERE ("status" IS NOT NULL);



CREATE INDEX "idx_billing_invoice_runs_stripe_invoice_id" ON "public"."billing_invoice_runs" USING "btree" ("stripe_invoice_id") WHERE ("stripe_invoice_id" IS NOT NULL);



CREATE INDEX "idx_billing_overage_state_last_collect_status" ON "public"."billing_overage_state" USING "btree" ("last_collect_status") WHERE ("last_collect_status" IS NOT NULL);



CREATE INDEX "idx_billing_overage_state_month" ON "public"."billing_overage_state" USING "btree" ("month");



CREATE INDEX "idx_billing_overage_state_org_id" ON "public"."billing_overage_state" USING "btree" ("org_id");



CREATE INDEX "idx_call_concurrency_leases_agent_active" ON "public"."call_concurrency_leases" USING "btree" ("agent_id", "expires_at") WHERE (("released_at" IS NULL) AND ("agent_id" IS NOT NULL));



CREATE INDEX "idx_call_concurrency_leases_expired" ON "public"."call_concurrency_leases" USING "btree" ("expires_at") WHERE ("released_at" IS NULL);



CREATE INDEX "idx_call_concurrency_leases_org_active" ON "public"."call_concurrency_leases" USING "btree" ("org_id", "expires_at") WHERE ("released_at" IS NULL);



CREATE INDEX "idx_calls_org_id_agent_id_started_at" ON "public"."calls" USING "btree" ("org_id", "agent_id", "started_at") WHERE ("agent_id" IS NOT NULL);



CREATE INDEX "idx_calls_org_id_created_at" ON "public"."calls" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_calls_org_id_outcome_started_at" ON "public"."calls" USING "btree" ("org_id", "outcome", "started_at") WHERE ("outcome" IS NOT NULL);



CREATE INDEX "idx_calls_org_id_started_at" ON "public"."calls" USING "btree" ("org_id", "started_at");



CREATE INDEX "idx_ig_data_deletion_ig_user_id" ON "public"."instagram_data_deletion_requests" USING "btree" ("ig_user_id");



CREATE INDEX "idx_ig_data_deletion_requested_at" ON "public"."instagram_data_deletion_requests" USING "btree" ("requested_at" DESC);



CREATE INDEX "idx_instagram_connections_expiry" ON "public"."instagram_connections" USING "btree" ("token_expires_at") WHERE ("status" = 'connected'::"text");



CREATE INDEX "idx_instagram_connections_ig_user_id" ON "public"."instagram_connections" USING "btree" ("ig_user_id");



CREATE INDEX "idx_instagram_connections_status" ON "public"."instagram_connections" USING "btree" ("status");



CREATE INDEX "idx_instagram_webhook_events_ig_user_id" ON "public"."instagram_webhook_events" USING "btree" ("ig_user_id");



CREATE INDEX "idx_instagram_webhook_events_org_received" ON "public"."instagram_webhook_events" USING "btree" ("org_id", "received_at" DESC);



CREATE INDEX "idx_instagram_webhook_events_unprocessed" ON "public"."instagram_webhook_events" USING "btree" ("received_at") WHERE ("processed" = false);



CREATE INDEX "idx_leads_org_id_created_at" ON "public"."leads" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_organization_settings_billing_status" ON "public"."organization_settings" USING "btree" ("billing_status") WHERE ("billing_status" <> 'active'::"text");



CREATE INDEX "idx_organization_settings_org_id" ON "public"."organization_settings" USING "btree" ("org_id");



CREATE INDEX "idx_organization_settings_paused_reason" ON "public"."organization_settings" USING "btree" ("paused_reason") WHERE ("paused_reason" IS NOT NULL);



CREATE INDEX "idx_organization_settings_workspace_status" ON "public"."organization_settings" USING "btree" ("workspace_status");



CREATE INDEX "idx_orgs_created_by" ON "public"."orgs" USING "btree" ("created_by");



CREATE INDEX "idx_profiles_org_id" ON "public"."profiles" USING "btree" ("org_id");



CREATE INDEX "idx_profiles_org_role" ON "public"."profiles" USING "btree" ("org_id", "role");



CREATE INDEX "idx_tickets_call_id" ON "public"."tickets" USING "btree" ("call_id") WHERE ("call_id" IS NOT NULL);



CREATE INDEX "idx_tickets_org_call" ON "public"."tickets" USING "btree" ("org_id", "call_id") WHERE ("call_id" IS NOT NULL);



CREATE INDEX "idx_tickets_org_created" ON "public"."tickets" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_tickets_org_id_created_at" ON "public"."tickets" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_tickets_org_lead" ON "public"."tickets" USING "btree" ("org_id", "lead_id") WHERE ("lead_id" IS NOT NULL);



CREATE INDEX "idx_tickets_org_priority_created" ON "public"."tickets" USING "btree" ("org_id", "priority", "created_at" DESC);



CREATE INDEX "idx_tickets_org_status_created" ON "public"."tickets" USING "btree" ("org_id", "status", "created_at" DESC);



CREATE INDEX "idx_tickets_org_updated" ON "public"."tickets" USING "btree" ("org_id", "updated_at" DESC);



CREATE INDEX "idx_webhook_debug_created_at" ON "public"."webhook_debug" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_webhook_debug_vapi_call_id" ON "public"."webhook_debug" USING "btree" ("vapi_call_id");



CREATE INDEX "messages_conversation_id_idx" ON "public"."messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "messages_convo_created_idx" ON "public"."messages" USING "btree" ("conversation_id", "created_at");



CREATE UNIQUE INDEX "messages_convo_extid_uidx" ON "public"."messages" USING "btree" ("conversation_id", "external_message_id") WHERE ("external_message_id" IS NOT NULL);



CREATE INDEX "messages_org_id_idx" ON "public"."messages" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "onboarding_activation_lock_status_idx" ON "public"."onboarding_activation_lock" USING "btree" ("status");



CREATE INDEX "org_invites_email_pending_idx" ON "public"."org_invites" USING "btree" ("lower"("email")) WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "org_invites_org_email_pending_uidx" ON "public"."org_invites" USING "btree" ("org_id", "lower"("email")) WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "org_invites_token_uidx" ON "public"."org_invites" USING "btree" ("token");



CREATE INDEX "organization_settings_org_id_idx" ON "public"."organization_settings" USING "btree" ("org_id");



CREATE INDEX "organization_settings_welcome_email_sent_at_idx" ON "public"."organization_settings" USING "btree" ("welcome_email_sent_at");



CREATE UNIQUE INDEX "profiles_auth_user_id_unique" ON "public"."profiles" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_email_unique" ON "public"."profiles" USING "btree" ("lower"("email")) WHERE ("email" IS NOT NULL);



CREATE INDEX "ticket_activity_org_actor_created_at_idx" ON "public"."ticket_activity" USING "btree" ("org_id", "actor_profile_id", "created_at" DESC);



CREATE INDEX "ticket_activity_org_event_type_created_at_idx" ON "public"."ticket_activity" USING "btree" ("org_id", "event_type", "created_at" DESC);



CREATE INDEX "ticket_activity_org_ticket_created_at_idx" ON "public"."ticket_activity" USING "btree" ("org_id", "ticket_id", "created_at" DESC);



CREATE INDEX "ticket_comments_org_author_created_at_idx" ON "public"."ticket_comments" USING "btree" ("org_id", "author_profile_id", "created_at" DESC);



CREATE INDEX "ticket_comments_org_ticket_created_at_idx" ON "public"."ticket_comments" USING "btree" ("org_id", "ticket_id", "created_at" DESC);



CREATE INDEX "tickets_call_id_idx" ON "public"."tickets" USING "btree" ("call_id");



CREATE INDEX "tickets_contact_idx" ON "public"."tickets" USING "btree" ("contact_id");



CREATE INDEX "tickets_conversation_idx" ON "public"."tickets" USING "btree" ("conversation_id");



CREATE UNIQUE INDEX "uq_call_concurrency_leases_active_vapi_call" ON "public"."call_concurrency_leases" USING "btree" ("org_id", "vapi_call_id") WHERE (("released_at" IS NULL) AND ("vapi_call_id" IS NOT NULL));



CREATE UNIQUE INDEX "uq_calls_org_vapi_call_id" ON "public"."calls" USING "btree" ("org_id", "vapi_call_id");



CREATE INDEX "webhook_debug_created_at_idx" ON "public"."webhook_debug" USING "btree" ("created_at" DESC);



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_agents_updated_at" BEFORE UPDATE ON "public"."agents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_appointments_updated_at" BEFORE UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_billing_addon_catalog_updated_at" BEFORE UPDATE ON "public"."billing_addon_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_billing_org_addons_updated_at" BEFORE UPDATE ON "public"."billing_org_addons" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_billing_plan_catalog_updated_at" BEFORE UPDATE ON "public"."billing_plan_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_call_concurrency_leases_set_updated_at" BEFORE UPDATE ON "public"."call_concurrency_leases" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_calls_ensure_webcall_meta" BEFORE INSERT OR UPDATE ON "public"."calls" FOR EACH ROW EXECUTE FUNCTION "public"."calls_ensure_webcall_meta"();



CREATE OR REPLACE TRIGGER "trg_calls_updated_at" BEFORE UPDATE ON "public"."calls" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_instagram_connections_updated_at" BEFORE UPDATE ON "public"."instagram_connections" FOR EACH ROW EXECUTE FUNCTION "public"."instagram_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_leads_updated_at" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_organization_settings_updated_at" BEFORE UPDATE ON "public"."organization_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_phone_lines_updated_at" BEFORE UPDATE ON "public"."phone_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_tickets_updated_at" BEFORE UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "update_billing_overage_state_updated_at" BEFORE UPDATE ON "public"."billing_overage_state" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_billing_plan_catalog_updated_at" BEFORE UPDATE ON "public"."billing_plan_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log_changes"
    ADD CONSTRAINT "audit_log_changes_audit_log_id_fkey" FOREIGN KEY ("audit_log_id") REFERENCES "public"."audit_log"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_org_addons"
    ADD CONSTRAINT "billing_org_addons_addon_key_fkey" FOREIGN KEY ("addon_key") REFERENCES "public"."billing_addon_catalog"("addon_key") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_manifest_revision_id_fkey" FOREIGN KEY ("manifest_revision_id") REFERENCES "public"."employee_manifests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_identities"
    ADD CONSTRAINT "contact_identities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_manifest_revision_id_fkey" FOREIGN KEY ("manifest_revision_id") REFERENCES "public"."employee_manifests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_channels"
    ADD CONSTRAINT "employee_channels_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_manifests"
    ADD CONSTRAINT "employee_manifests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."instagram_webhook_events"
    ADD CONSTRAINT "instagram_webhook_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."instagram_webhook_events"
    ADD CONSTRAINT "instagram_webhook_events_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_plan_overrides"
    ADD CONSTRAINT "org_plan_overrides_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_settings"
    ADD CONSTRAINT "organization_settings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."persona_tools"
    ADD CONSTRAINT "persona_tools_persona_key_fkey" FOREIGN KEY ("persona_key") REFERENCES "public"."personas"("key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ticket_activity"
    ADD CONSTRAINT "ticket_activity_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."ticket_activity"
    ADD CONSTRAINT "ticket_activity_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_comments"
    ADD CONSTRAINT "ticket_comments_author_profile_id_fkey" FOREIGN KEY ("author_profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."ticket_comments"
    ADD CONSTRAINT "ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



CREATE POLICY "Allow authenticated users to read plan catalog" ON "public"."billing_plan_catalog" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Audit insert by org members" ON "public"."audit_log" FOR INSERT WITH CHECK ((("actor_user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."org_id" = "audit_log"."org_id"))))));



CREATE POLICY "Audit readable by org members" ON "public"."audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."org_id" = "audit_log"."org_id")))));



CREATE POLICY "Users can insert settings for their org if owner/admin" ON "public"."organization_settings" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."org_id" = "organization_settings"."org_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Users can manage their org's overage state" ON "public"."billing_overage_state" TO "authenticated" USING (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE ("profiles"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update settings for their org if owner/admin" ON "public"."organization_settings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."org_id" = "organization_settings"."org_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."org_id" = "organization_settings"."org_id") AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Users can view settings for their org" ON "public"."organization_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."org_id" = "organization_settings"."org_id")))));



ALTER TABLE "public"."agents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agents_select_own_org" ON "public"."agents" FOR SELECT USING (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE ("profiles"."auth_user_id" = "auth"."uid"()))));



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "appointments_delete_owner_admin" ON "public"."appointments" FOR DELETE USING (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE (("profiles"."auth_user_id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "appointments_insert_own_org" ON "public"."appointments" FOR INSERT WITH CHECK (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE ("profiles"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "appointments_select_own_org" ON "public"."appointments" FOR SELECT USING (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE ("profiles"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "appointments_update_own_org" ON "public"."appointments" FOR UPDATE USING (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE ("profiles"."auth_user_id" = "auth"."uid"()))));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log_changes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_changes_select_own_org" ON "public"."audit_log_changes" FOR SELECT USING (("audit_log_id" IN ( SELECT "al"."id"
   FROM "public"."audit_log" "al"
  WHERE ("al"."org_id" IN ( SELECT "profiles"."org_id"
           FROM "public"."profiles"
          WHERE ("profiles"."auth_user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."billing_addon_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_anomaly_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_guardrails" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_invoice_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_org_addons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_overage_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_plan_catalog" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "billing_plan_catalog_read" ON "public"."billing_plan_catalog" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."billing_stripe_customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_stripe_prices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_usage_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."call_concurrency_leases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "calls_insert_own_org" ON "public"."calls" FOR INSERT WITH CHECK (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE ("profiles"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "calls_select_own_org" ON "public"."calls" FOR SELECT USING (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE ("profiles"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "calls_update_own_org" ON "public"."calls" FOR UPDATE USING (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE ("profiles"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "catalog_select_authenticated" ON "public"."billing_addon_catalog" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."contact_identities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contact_requests_insert_anon" ON "public"."contact_requests" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "contact_requests_select_admin" ON "public"."contact_requests" FOR SELECT TO "authenticated" USING ((COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text"), ''::"text") = 'admin'::"text"));



CREATE POLICY "contact_requests_update_admin" ON "public"."contact_requests" FOR UPDATE TO "authenticated" USING ((COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text"), ''::"text") = 'admin'::"text")) WITH CHECK ((COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text"), ''::"text") = 'admin'::"text"));



ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_insert_org" ON "public"."conversations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."org_id" = "conversations"."org_id")))));



CREATE POLICY "conversations_select_org" ON "public"."conversations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."org_id" = "conversations"."org_id")))));



CREATE POLICY "conversations_update_org" ON "public"."conversations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."org_id" = "conversations"."org_id")))));



ALTER TABLE "public"."employee_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_manifests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."instagram_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."instagram_data_deletion_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."instagram_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_delete_own_org" ON "public"."leads" FOR DELETE USING (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE (("profiles"."auth_user_id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "leads_insert_own_org" ON "public"."leads" FOR INSERT WITH CHECK (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE ("profiles"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "leads_select_own_org" ON "public"."leads" FOR SELECT USING (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE ("profiles"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "leads_update_own_org" ON "public"."leads" FOR UPDATE USING (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE ("profiles"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "leases_select_own_org" ON "public"."call_concurrency_leases" FOR SELECT USING (("org_id" = ( SELECT "p"."org_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."auth_user_id" = "auth"."uid"())
 LIMIT 1)));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_insert_org" ON "public"."messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."org_id" = "messages"."org_id")))));



CREATE POLICY "messages_select_org" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."org_id" = "messages"."org_id")))));



CREATE POLICY "messages_update_org" ON "public"."messages" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."org_id" = "messages"."org_id")))));



ALTER TABLE "public"."onboarding_activation_lock" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_addons_delete_org" ON "public"."billing_org_addons" FOR DELETE TO "authenticated" USING (("org_id" = (("auth"."jwt"() ->> 'org_id'::"text"))::"uuid"));



CREATE POLICY "org_addons_insert_org" ON "public"."billing_org_addons" FOR INSERT TO "authenticated" WITH CHECK (("org_id" = (("auth"."jwt"() ->> 'org_id'::"text"))::"uuid"));



CREATE POLICY "org_addons_select_org" ON "public"."billing_org_addons" FOR SELECT TO "authenticated" USING (("org_id" = (("auth"."jwt"() ->> 'org_id'::"text"))::"uuid"));



CREATE POLICY "org_addons_update_org" ON "public"."billing_org_addons" FOR UPDATE TO "authenticated" USING (("org_id" = (("auth"."jwt"() ->> 'org_id'::"text"))::"uuid")) WITH CHECK (("org_id" = (("auth"."jwt"() ->> 'org_id'::"text"))::"uuid"));



ALTER TABLE "public"."org_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."org_plan_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orgs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orgs_select_own_org" ON "public"."orgs" FOR SELECT USING (("id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE ("profiles"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "orgs_update_owner_admin" ON "public"."orgs" FOR UPDATE USING (("id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE (("profiles"."auth_user_id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."persona_tools" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."phone_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "phone_lines_delete" ON "public"."phone_lines" FOR DELETE USING (("org_id" = ( SELECT "p"."org_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."auth_user_id" = "auth"."uid"())
 LIMIT 1)));



CREATE POLICY "phone_lines_insert" ON "public"."phone_lines" FOR INSERT WITH CHECK (("org_id" = ( SELECT "p"."org_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."auth_user_id" = "auth"."uid"())
 LIMIT 1)));



CREATE POLICY "phone_lines_select" ON "public"."phone_lines" FOR SELECT USING (("org_id" = ( SELECT "p"."org_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."auth_user_id" = "auth"."uid"())
 LIMIT 1)));



CREATE POLICY "phone_lines_update" ON "public"."phone_lines" FOR UPDATE USING (("org_id" = ( SELECT "p"."org_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."auth_user_id" = "auth"."uid"())
 LIMIT 1))) WITH CHECK (("org_id" = ( SELECT "p"."org_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."auth_user_id" = "auth"."uid"())
 LIMIT 1)));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "auth_user_id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "auth_user_id")) WITH CHECK (("auth"."uid"() = "auth_user_id"));



ALTER TABLE "public"."ticket_activity" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_activity_insert_owner_admin" ON "public"."ticket_activity" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "p"."org_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))) AND (( SELECT "p"."role"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())) = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_activity"."ticket_id") AND ("t"."org_id" = "t"."org_id"))))));



CREATE POLICY "ticket_activity_select_same_org" ON "public"."ticket_activity" FOR SELECT USING (("org_id" = ( SELECT "p"."org_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



ALTER TABLE "public"."ticket_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_comments_delete_owner_admin" ON "public"."ticket_comments" FOR DELETE USING ((("org_id" = ( SELECT "p"."org_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))) AND (( SELECT "p"."role"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())) = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "ticket_comments_insert_owner_admin" ON "public"."ticket_comments" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "p"."org_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))) AND ("author_profile_id" = "auth"."uid"()) AND (( SELECT "p"."role"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())) = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_comments"."ticket_id") AND ("t"."org_id" = "t"."org_id"))))));



CREATE POLICY "ticket_comments_select_same_org" ON "public"."ticket_comments" FOR SELECT USING (("org_id" = ( SELECT "p"."org_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))));



ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tickets_delete_owner_admin" ON "public"."tickets" FOR DELETE USING (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE (("profiles"."auth_user_id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "tickets_insert_own_org" ON "public"."tickets" FOR INSERT WITH CHECK (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE ("profiles"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "tickets_select_own_org" ON "public"."tickets" FOR SELECT USING (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE ("profiles"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "tickets_update_own_org" ON "public"."tickets" FOR UPDATE USING (("org_id" IN ( SELECT "profiles"."org_id"
   FROM "public"."profiles"
  WHERE ("profiles"."auth_user_id" = "auth"."uid"()))));



ALTER TABLE "public"."webhook_debug" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."acquire_org_concurrency_lease"("p_org_id" "uuid", "p_agent_id" "uuid", "p_vapi_call_id" "text", "p_limit" integer, "p_ttl_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."acquire_org_concurrency_lease"("p_org_id" "uuid", "p_agent_id" "uuid", "p_vapi_call_id" "text", "p_limit" integer, "p_ttl_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."acquire_org_concurrency_lease"("p_org_id" "uuid", "p_agent_id" "uuid", "p_vapi_call_id" "text", "p_limit" integer, "p_ttl_minutes" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."calls_ensure_webcall_meta"() TO "anon";
GRANT ALL ON FUNCTION "public"."calls_ensure_webcall_meta"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calls_ensure_webcall_meta"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_calls_today_counts_by_phone_number"("p_org_id" "uuid", "p_vapi_phone_number_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_calls_today_counts_by_phone_number"("p_org_id" "uuid", "p_vapi_phone_number_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_calls_today_counts_by_phone_number"("p_org_id" "uuid", "p_vapi_phone_number_ids" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_billing_guardrails"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_billing_guardrails"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_billing_guardrails"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_billing_guardrails"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."instagram_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."instagram_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."instagram_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_valid_email"("email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_valid_email"("email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_valid_email"("email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reconcile_call_cost"("p_org_id" "uuid", "p_vapi_call_id" "text", "p_cost_usd" numeric, "p_payload" "jsonb", "p_source" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_call_cost"("p_org_id" "uuid", "p_vapi_call_id" "text", "p_cost_usd" numeric, "p_payload" "jsonb", "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reconcile_call_cost"("p_org_id" "uuid", "p_vapi_call_id" "text", "p_cost_usd" numeric, "p_payload" "jsonb", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reconcile_call_cost"("p_org_id" "uuid", "p_vapi_call_id" "text", "p_cost_usd" numeric, "p_payload" "jsonb", "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."release_expired_concurrency_leases"() TO "anon";
GRANT ALL ON FUNCTION "public"."release_expired_concurrency_leases"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_expired_concurrency_leases"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_org_concurrency_lease"("p_org_id" "uuid", "p_vapi_call_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_org_concurrency_lease"("p_org_id" "uuid", "p_vapi_call_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."release_org_concurrency_lease"("p_org_id" "uuid", "p_vapi_call_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_org_concurrency_lease"("p_org_id" "uuid", "p_vapi_call_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."agents" TO "anon";
GRANT ALL ON TABLE "public"."agents" TO "authenticated";
GRANT ALL ON TABLE "public"."agents" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."tickets" TO "anon";
GRANT ALL ON TABLE "public"."tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets" TO "service_role";



GRANT ALL ON TABLE "public"."artifacts" TO "anon";
GRANT ALL ON TABLE "public"."artifacts" TO "authenticated";
GRANT ALL ON TABLE "public"."artifacts" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log_changes" TO "anon";
GRANT ALL ON TABLE "public"."audit_log_changes" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log_changes" TO "service_role";



GRANT ALL ON TABLE "public"."billing_addon_catalog" TO "anon";
GRANT ALL ON TABLE "public"."billing_addon_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_addon_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."billing_anomaly_events" TO "anon";
GRANT ALL ON TABLE "public"."billing_anomaly_events" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_anomaly_events" TO "service_role";



GRANT ALL ON TABLE "public"."billing_guardrails" TO "anon";
GRANT ALL ON TABLE "public"."billing_guardrails" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_guardrails" TO "service_role";



GRANT ALL ON TABLE "public"."billing_invoice_runs" TO "anon";
GRANT ALL ON TABLE "public"."billing_invoice_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_invoice_runs" TO "service_role";



GRANT ALL ON TABLE "public"."billing_org_addons" TO "anon";
GRANT ALL ON TABLE "public"."billing_org_addons" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_org_addons" TO "service_role";



GRANT ALL ON TABLE "public"."billing_overage_state" TO "anon";
GRANT ALL ON TABLE "public"."billing_overage_state" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_overage_state" TO "service_role";



GRANT ALL ON TABLE "public"."billing_plan_catalog" TO "anon";
GRANT ALL ON TABLE "public"."billing_plan_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_plan_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."billing_stripe_customers" TO "anon";
GRANT ALL ON TABLE "public"."billing_stripe_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_stripe_customers" TO "service_role";



GRANT ALL ON TABLE "public"."billing_stripe_prices" TO "anon";
GRANT ALL ON TABLE "public"."billing_stripe_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_stripe_prices" TO "service_role";



GRANT ALL ON TABLE "public"."billing_usage_alerts" TO "anon";
GRANT ALL ON TABLE "public"."billing_usage_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_usage_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."call_concurrency_leases" TO "anon";
GRANT ALL ON TABLE "public"."call_concurrency_leases" TO "authenticated";
GRANT ALL ON TABLE "public"."call_concurrency_leases" TO "service_role";



GRANT ALL ON TABLE "public"."calls" TO "anon";
GRANT ALL ON TABLE "public"."calls" TO "authenticated";
GRANT ALL ON TABLE "public"."calls" TO "service_role";



GRANT ALL ON TABLE "public"."contact_identities" TO "anon";
GRANT ALL ON TABLE "public"."contact_identities" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_identities" TO "service_role";



GRANT ALL ON TABLE "public"."contact_requests" TO "anon";
GRANT ALL ON TABLE "public"."contact_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_requests" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."employee_channels" TO "anon";
GRANT ALL ON TABLE "public"."employee_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_channels" TO "service_role";



GRANT ALL ON TABLE "public"."employee_manifests" TO "anon";
GRANT ALL ON TABLE "public"."employee_manifests" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_manifests" TO "service_role";



GRANT ALL ON TABLE "public"."instagram_connections" TO "anon";
GRANT ALL ON TABLE "public"."instagram_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."instagram_connections" TO "service_role";



GRANT ALL ON TABLE "public"."instagram_data_deletion_requests" TO "anon";
GRANT ALL ON TABLE "public"."instagram_data_deletion_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."instagram_data_deletion_requests" TO "service_role";



GRANT ALL ON TABLE "public"."instagram_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."instagram_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."instagram_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_activation_lock" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_activation_lock" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_activation_lock" TO "service_role";



GRANT ALL ON TABLE "public"."org_daily_concurrency_peak" TO "anon";
GRANT ALL ON TABLE "public"."org_daily_concurrency_peak" TO "authenticated";
GRANT ALL ON TABLE "public"."org_daily_concurrency_peak" TO "service_role";



GRANT ALL ON TABLE "public"."org_daily_usage" TO "anon";
GRANT ALL ON TABLE "public"."org_daily_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."org_daily_usage" TO "service_role";



GRANT ALL ON TABLE "public"."org_invites" TO "anon";
GRANT ALL ON TABLE "public"."org_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."org_invites" TO "service_role";



GRANT ALL ON TABLE "public"."org_monthly_usage" TO "anon";
GRANT ALL ON TABLE "public"."org_monthly_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."org_monthly_usage" TO "service_role";



GRANT ALL ON TABLE "public"."org_plan_overrides" TO "anon";
GRANT ALL ON TABLE "public"."org_plan_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."org_plan_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."orgs" TO "anon";
GRANT ALL ON TABLE "public"."orgs" TO "authenticated";
GRANT ALL ON TABLE "public"."orgs" TO "service_role";



GRANT ALL ON TABLE "public"."org_plan_limits" TO "anon";
GRANT ALL ON TABLE "public"."org_plan_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."org_plan_limits" TO "service_role";



GRANT ALL ON TABLE "public"."org_monthly_concurrency_compliance" TO "anon";
GRANT ALL ON TABLE "public"."org_monthly_concurrency_compliance" TO "authenticated";
GRANT ALL ON TABLE "public"."org_monthly_concurrency_compliance" TO "service_role";



GRANT ALL ON TABLE "public"."plan_pricing" TO "anon";
GRANT ALL ON TABLE "public"."plan_pricing" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_pricing" TO "service_role";



GRANT ALL ON TABLE "public"."org_monthly_overages" TO "anon";
GRANT ALL ON TABLE "public"."org_monthly_overages" TO "authenticated";
GRANT ALL ON TABLE "public"."org_monthly_overages" TO "service_role";



GRANT ALL ON TABLE "public"."org_monthly_invoice_preview" TO "anon";
GRANT ALL ON TABLE "public"."org_monthly_invoice_preview" TO "authenticated";
GRANT ALL ON TABLE "public"."org_monthly_invoice_preview" TO "service_role";



GRANT ALL ON TABLE "public"."organization_settings" TO "anon";
GRANT ALL ON TABLE "public"."organization_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_settings" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."persona_tools" TO "anon";
GRANT ALL ON TABLE "public"."persona_tools" TO "authenticated";
GRANT ALL ON TABLE "public"."persona_tools" TO "service_role";



GRANT ALL ON TABLE "public"."personas" TO "anon";
GRANT ALL ON TABLE "public"."personas" TO "authenticated";
GRANT ALL ON TABLE "public"."personas" TO "service_role";



GRANT ALL ON TABLE "public"."phone_lines" TO "anon";
GRANT ALL ON TABLE "public"."phone_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."phone_lines" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_activity" TO "anon";
GRANT ALL ON TABLE "public"."ticket_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_activity" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_comments" TO "anon";
GRANT ALL ON TABLE "public"."ticket_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_comments" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_debug" TO "anon";
GRANT ALL ON TABLE "public"."webhook_debug" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_debug" TO "service_role";



GRANT ALL ON SEQUENCE "public"."webhook_debug_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."webhook_debug_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."webhook_debug_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







