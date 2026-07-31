# Archived migrations

Migrations moved out of `supabase/migrations/` because they must never run again,
but whose history we deliberately do **not** delete.

This directory is a **sibling** of `supabase/migrations/`, not a child, so the
Supabase CLI does not scan it. Nothing here is applied, tracked, or repaired.

**Never move a file back into `supabase/migrations/` without re-verifying it
against production first.**

---

## `20250201000000_add_profiles_welcome_email_sent_at.sql`

**Status:** obsolete — superseded by `20250202000000_add_organization_settings_welcome_email.sql`
**Archived:** 2026-07-30 (R-134)
**Applied in production:** No

Adds `welcome_email_sent_at` and `welcome_email_last_error` to `public.profiles`.

Evidence for retiring it:

1. **Never applied.** Neither column exists on `public.profiles` in production
   (verified 2026-07-30 against project `kebqwsdguxxjsijahrox`).
2. **Zero code references.** Every read and write of `welcome_email_sent_at` /
   `welcome_email_last_error` targets `organization_settings`, never `profiles` —
   see `web/src/app/(app)/onboarding/sendWelcomeOnOnboardingStart.ts` lines 62–83.
   The once-only welcome-email idempotency lock is the conditional `UPDATE` on
   `organization_settings`, which is what CLAUDE.md documents as the business rule.
3. **Superseded one day later.** `20250202000000` put the same two columns on
   `organization_settings`, which is the table the lock actually uses.

Applying it now would add two permanently-unread columns to a tenant table.

If a per-user (rather than per-org) welcome-email record is ever wanted, write a
**new forward migration** — do not resurrect this file.
