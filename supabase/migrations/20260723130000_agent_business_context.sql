-- R-013 — business context for the AI (Sprint 4, 2026-07-23)
--
-- One JSONB blob per agent holding the business-context fields the AI needs to sound
-- like it works for this specific business (name, services, hours, service area, FAQs,
-- booking policy, cancellation policy, tone). Additive + nullable; injected into the
-- derived system prompt (see settings/_lib/prompt-derivation.ts). Kept as JSONB so the
-- field set can evolve without further migrations.

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS business_context jsonb;
