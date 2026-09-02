-- Documents a business uploads so its AI employee can learn the business from them.
--
-- WHY KEEP THE DOCUMENT AND NOT ONLY THE EXTRACTION. The eight Knowledge fields are what a call
-- actually speaks from, and extraction fills them — but the extraction prompt will improve, and
-- re-running it against a stored document costs one API call instead of asking an owner to find
-- and upload the file again. A stored document is also what any future retrieval index would be
-- built from, if eight fields ever stop being enough.
--
-- WHY THE TEXT IS A COLUMN. Re-extraction, showing an owner what we actually read, and any later
-- indexing all want the text, not the PDF. Keeping it beside the row means none of those has to
-- re-parse a binary or reach into storage.
--
-- PRIVATE BUCKET, NO RLS POLICIES — the same access model as `channel-media`: service-role writes,
-- server-minted signed reads, and an object key that begins with the org id so the check is
-- possible before a URL is ever signed. These are a business's own price lists and policies.
--
-- Idempotent. ROLLBACK:
--   drop table if exists public.agent_knowledge_documents;
--   delete from storage.buckets where id = 'knowledge-documents';  -- objects first

insert into storage.buckets (id, name, public, file_size_limit)
values ('knowledge-documents', 'knowledge-documents', false, 10485760)
on conflict (id) do nothing;

create table if not exists public.agent_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  -- Nullable: a document can describe the business before anyone picks which employee reads it.
  agent_id uuid references public.agents(id) on delete set null,
  filename text not null,
  mime_type text,
  byte_size integer,
  storage_key text,
  -- What we actually read. Null while extraction is pending or after it failed.
  extracted_text text,
  page_count integer,
  truncated boolean not null default false,
  status text not null default 'pending',
  -- Why it failed, in the words shown to the owner. Null on success.
  failure_reason text,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agent_knowledge_documents_status_check') then
    alter table public.agent_knowledge_documents
      add constraint agent_knowledge_documents_status_check
      check (status in ('pending', 'extracted', 'failed'));
  end if;
end $$;

create index if not exists agent_knowledge_documents_org_created_idx
  on public.agent_knowledge_documents (org_id, created_at desc);

create index if not exists agent_knowledge_documents_agent_idx
  on public.agent_knowledge_documents (agent_id);

-- RLS on with no policies: reachable by the service-role client and nobody else, matching how the
-- rest of the channel/media tables are locked. Reads go through org-scoped server code.
alter table public.agent_knowledge_documents enable row level security;

comment on table public.agent_knowledge_documents is
  'Business documents uploaded to teach an AI employee. Extraction fills the Knowledge fields; the document is kept so extraction can be re-run. See web/src/lib/knowledge/.';
