-- Instagram data-deletion tracking (Sprint 1.5 — Meta compliance addendum)
-- Meta's Data Deletion Request callback must return a status URL + confirmation
-- code the user can check later. This table backs that status lookup.
-- Service-role only (RLS enabled, no policies); mirrors the other Instagram tables.
-- Idempotent DDL.

create table if not exists public.instagram_data_deletion_requests (
  id                 uuid primary key default gen_random_uuid(),
  confirmation_code  text not null unique,
  ig_user_id         text,
  org_id             uuid,
  status             text not null default 'received'
                       check (status in ('received','completed','failed')),
  detail             text,
  requested_at       timestamptz not null default now(),
  completed_at       timestamptz
);

create index if not exists idx_ig_data_deletion_ig_user_id
  on public.instagram_data_deletion_requests (ig_user_id);
create index if not exists idx_ig_data_deletion_requested_at
  on public.instagram_data_deletion_requests (requested_at desc);

alter table public.instagram_data_deletion_requests enable row level security;
-- Intentionally NO policies: service-role only. The public status page reads it
-- server-side by exact confirmation_code (a capability), never via anon/PostgREST.
