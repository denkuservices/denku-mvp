-- ===================================================================
-- RECOVERED MIGRATION (R-134) — DO NOT EDIT THE BODY
-- Applied directly to production 2026-04-05 18:55:21 UTC and never
-- committed. Body recovered verbatim from
--   supabase_migrations.schema_migrations.statements on 2026-07-30.
-- Already applied in production: repo-side record only.
--
-- THIS MIGRATION EXPLAINS THREE STANDING CODE DEFECTS (see R-133):
--   * conversation_messages was dropped here, so
--     web/src/lib/dashboard/getAvgResponseTime.ts queries a table that
--     does not exist and always fails safe to "—".
--   * organizations_legacy was dropped here, so the ~30 code sites that
--     still write to it are dead. signupAction.ts discards the error
--     (silent); ensureDefaultOrg.ts returns it, so
--     ensureDefaultOrgForUser can never succeed on its create path.
-- Neither is fixed by this file — it only records what production did.
-- ===================================================================

-- conversation_messages RLS'siz ve messages tablosu ile çakışıyor, kaldırıyoruz
DROP TABLE IF EXISTS public.conversation_messages;

-- organizations_legacy artık hiçbir FK'a sahip değil, kaldırıyoruz
DROP TABLE IF EXISTS public.organizations_legacy;
