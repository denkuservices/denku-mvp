-- Transactional email dispatch log — "send this exactly once" for the whole mail estate
--
-- WHAT: one row per transactional email we have committed to sending, keyed by
-- (kind, dedupe_key). The unique index IS the lock: a caller INSERTs to claim the send,
-- and a duplicate insert failing is the signal that someone else already sent it.
--
-- WHY: every new mail added in this change is triggered by something that can fire twice.
-- Stripe redelivers webhooks on any non-2xx and on its own schedule; onboarding activation
-- is explicitly resume-from-partial; a cron re-runs. Without a claim, a customer whose
-- payment webhook is redelivered gets the same receipt three times — which is worse than
-- not sending it, because it reads as a system out of control on the one topic where
-- customers are least forgiving.
--
-- This generalises two patterns already proven in the codebase: the conditional-UPDATE
-- claim on `organization_settings.welcome_email_sent_at` (welcome mail) and `notified_at`
-- on artifacts (R-008). Those stayed per-feature because each had a natural column to
-- claim; the billing lifecycle has no such column, and adding one per email kind would be
-- six migrations and six bespoke claim paths.
--
-- CLAIM PROTOCOL (see lib/email/dispatch.ts):
--   1. INSERT (kind, dedupe_key) → unique violation means "already handled", so skip.
--   2. Send.
--   3. On failure, DELETE the row so a later delivery retries. On success, leave it.
--   That ordering is deliberate: claiming BEFORE sending risks losing a mail if the process
--   dies mid-send, while sending before claiming risks duplicates. For transactional mail,
--   a lost mail that a retry can recover beats a duplicate that cannot be recalled.
--
-- DEDUPE KEY: chosen by the caller from the most stable identifier available for the event
-- — a Stripe invoice id, a subscription id + status, an org id for once-per-workspace mail.
-- Never a timestamp, or the key stops deduplicating.
--
-- SECURITY: RLS ENABLED with NO policies → service-role only. The table holds a recipient
-- address per row, which is tenant data; nothing in the app needs to read it from the
-- browser, and background senders use the service-role client.
--
-- ROLLBACK: drop table public.email_dispatch_log;
--   (Safe. The table is a de-dupe ledger, not a source of truth — dropping it means the
--   next occurrence of an event may re-send one email, nothing more.)
--
-- Idempotent DDL (safe to re-run).

create table if not exists public.email_dispatch_log (
  id          uuid primary key default gen_random_uuid(),

  -- Which template/event this is, e.g. 'plan_activated', 'payment_failed'. Free text
  -- rather than an enum so adding a mail is a code change, not a migration.
  kind        text not null,

  -- The event's stable identity within that kind (Stripe invoice id, org id, …).
  dedupe_key  text not null,

  -- Nullable: a few mails (member invites to strangers) have no org yet.
  org_id      uuid,

  -- Recorded for support ("did we email them?"), not for addressing.
  recipient   text,

  created_at  timestamptz not null default now()
);

-- The lock. One send per (kind, dedupe_key), forever.
create unique index if not exists email_dispatch_log_kind_key_uidx
  on public.email_dispatch_log (kind, dedupe_key);

-- Support lookups: "what did we send this workspace, most recent first".
create index if not exists email_dispatch_log_org_created_idx
  on public.email_dispatch_log (org_id, created_at desc);

alter table public.email_dispatch_log enable row level security;
-- Intentionally NO policies: service-role only. Every writer is a webhook, cron or
-- server action using the service-role client.
