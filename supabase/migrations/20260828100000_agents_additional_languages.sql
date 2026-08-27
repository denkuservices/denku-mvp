-- Employees that understand more than one language (2026-08-28).
--
-- `agents.language` already holds the language the employee answers in. It stays exactly as it
-- is: the PRIMARY language — the one the voice and transcriber pin to, and the one the AI starts
-- the call in. This column holds the languages it should ALSO understand.
--
-- Modelled as a separate array rather than replacing `language` with a list so that nothing is
-- stored twice: the full set is `[language, ...additional_languages]`, which cannot drift from
-- itself. Around twenty places already read `agents.language`; none of them change.
--
-- Default '{}' is the current product, byte for byte: an empty array means one language, which
-- means the transcriber stays pinned to it. Nothing changes for any existing employee until an
-- owner ticks a box.
--
-- Additive and idempotent. No RLS change: `agents` already carries its policies, including the
-- UPDATE policy added in 20260827090000 without which no customer could save this either.

alter table public.agents
  add column if not exists additional_languages text[] not null default '{}'::text[];

comment on column public.agents.additional_languages is
  'Languages this employee understands BEYOND agents.language (the primary). Empty = single-language, transcriber pinned. Non-empty switches the transcriber to multilingual code-switching.';
