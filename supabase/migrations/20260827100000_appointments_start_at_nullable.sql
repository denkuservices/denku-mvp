-- An appointment REQUEST may not have a time yet.
--
-- FOUND 2026-08-27, on the first call that ever reached the appointment path in production. The
-- caller asked to book, the classifier got it right (`intent=appointment`, `source=llm`, 0.95,
-- with "tomorrow at 5 PM" extracted) — and nothing was created, because the post-call guarantee's
-- insert named a `source` column that does not exist and omitted `start_at`, which is NOT NULL.
-- The error was swallowed by a console.error. That is why this product had 92 tickets and zero
-- appointments in its entire history: the ticket path matched its table, and this one never could.
--
-- The code fix supplies `start_at` by parsing what the caller actually said, in the employee's own
-- timezone. This migration covers the case that parse cannot: the caller says "sometime next week"
-- or "I'll call back to confirm". The product's own promise is that a call **never dead-ends**, and
-- what it promises to create is an *appointment request* — CLAUDE.md's word. A request whose time
-- is still open is a real, useful artifact; a fabricated timestamp to satisfy a constraint is not,
-- and it would show up on the owner's calendar as a booking nobody made.
--
-- SAFE: every reader already types this column as nullable (`readModel/requests.ts`,
-- `readModel/conversations.ts`, the appointments page), because appointments have always been
-- rendered defensively. Existing rows are untouched; ordering by `start_at` puts nulls last, which
-- is where an unscheduled request belongs.

ALTER TABLE public.appointments ALTER COLUMN start_at DROP NOT NULL;

COMMENT ON COLUMN public.appointments.start_at IS
  'When the appointment is for. NULL means the request has no agreed time yet — the caller asked to book but named no time we could resolve. Never invent a value to fill this.';

-- ROLLBACK (only safe once every NULL row has been given a time):
--   UPDATE public.appointments SET start_at = created_at WHERE start_at IS NULL;  -- see note
--   ALTER TABLE public.appointments ALTER COLUMN start_at SET NOT NULL;
-- The UPDATE above writes a time nobody agreed to, which is exactly what this migration exists to
-- avoid — reverting means accepting that trade deliberately.
