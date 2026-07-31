# R-031 — Schema Baseline / Bootstrapability

**Status:** ✅ CLOSED — 2026-07-30 · **Branch:** `chore/r031-schema-baseline`
**Result:** a fresh database built from `supabase/migrations/` alone is **byte-for-byte equivalent to production**.

## The problem

The core tables (`orgs`, `profiles`, `calls`, `leads`, `tickets`, `appointments`, `agents`,
`conversations`, `messages`, …) existed in **no migration** — only in the live project. Replaying the
repo onto an empty database failed on the very first migration:

```
20241201000000 → ALTER TABLE appointments ADD COLUMN call_id  →  relation "appointments" does not exist
```

So the repository could not bootstrap a new environment: no staging, no branch DBs, no disaster recovery
from source.

## What was done

### 1. `20241101000000_baseline_schema.sql`

The complete production `public` schema (`supabase db dump --linked --schema public`), timestamped
before the earliest migration so it runs first. 3,263 lines. **Never executed against production** —
registered there as bookkeeping only (`migration repair`).

### 2. Six migrations made replay-safe

With the baseline in place, later migrations run against a database that already has the final schema.
Six were not idempotent. Two of those were far more serious than the rest:

| Migration | Problem | Fix |
|---|---|---|
| `20241203000000` | `ADD CONSTRAINT check_workspace_status` — no `IF NOT EXISTS` in PostgreSQL | `DROP CONSTRAINT IF EXISTS` guard |
| `20250127000000` | trigger + policy already exist | `DROP … IF EXISTS` guards |
| `20250129000000` | trigger + policy already exist | `DROP … IF EXISTS` guards |
| `20260405185422` | 15 policies already exist | `DROP POLICY IF EXISTS` before each; **every `CREATE POLICY` left verbatim** |
| `20250125010000` | 🔴 **stale definition** — would have regressed production | body replaced with production truth |
| `20250126000000` | 🔴 **stale definition** — would have regressed production | body replaced with production truth |

### 3. 🔴 Two migrations were actively wrong — this is the important finding

These did not merely conflict; **replaying them would have damaged the schema.** They are the concrete
instance of CLAUDE.md landmine #9 ("never assume a migration file describes the current function
signature").

**`20250125010000` — `acquire_org_concurrency_lease`**

```
repo file : acquire_org_concurrency_lease(p_org_id uuid, p_limit int, p_agent_id uuid, …)
production: acquire_org_concurrency_lease(p_org_id uuid, p_agent_id uuid, p_vapi_call_id text,
                                          p_limit integer, p_ttl_minutes integer DEFAULT 10)
                                          RETURNS TABLE(ok boolean, active_count integer, limit_value integer)
```

Different parameter order *and* a different return type. PostgreSQL refused outright
(`cannot change return type of existing function`). Concurrency leases are what enforce the per-plan
concurrent-call limit — a silent regression here would have broken billing enforcement.

**`20250126000000` — `organizations` view**

```
repo file : 6 columns, phone_number hard-coded to ''
production: 9 columns — adds display_name, real phone_number_e164 mapping,
            vapi_assistant_id, vapi_phone_number_id
```

PostgreSQL refused (`cannot drop columns from view`).

Both files now carry production's definitions. The historical shapes remain in git history.

### 4. `20260730100000_r031_reconcile_superseded_objects.sql`

A first full replay produced a **strict superset** of production — 4 objects the live database does not
have, created by early migrations and later dropped directly in production during the
2026-01-29 → 2026-07-07 commit gap, so nothing recorded their removal.

| Object | Why production dropped it |
|---|---|
| policy `Users can view agents in their organization` | replaced by `agents_select_own_org` |
| policy `Service role can insert webhook_debug` | service role bypasses RLS; table locked policy-less by R-060 |
| policy `Service role can select webhook_debug` | same |
| index `profiles_id_unique` | redundant — `id` is already the primary key |

**The `agents` one was a real security divergence:** PostgreSQL ORs permissive policies together, so a
replayed environment would have carried *two* SELECT policies on `agents` and been **more permissive
than production**. On production this migration is a pure no-op (every statement is `IF EXISTS`).

## Verification

`supabase start` could not complete — pulling `ghcr.io/supabase/imgproxy` failed on a registry/TLS
error, unrelated to the schema. Verification therefore ran directly against a clean
`supabase/postgres:17.6.1.063` container, which is exactly what `db reset` does: apply every migration
in order to an empty database. The container supplies `auth.uid()` and the `anon` / `authenticated` /
`service_role` roles; `auth.jwt()` was added to match a real project (3 policies reference it).

**Replay: 42/42 applied, 0 errors.**

| Metric | Fresh replay | Production | |
|---|---|---|---|
| tables | 40 | 40 | ✅ |
| views | 10 | 10 | ✅ |
| functions | 11 | 11 | ✅ |
| indexes | 166 | 166 | ✅ |
| policies | 53 | 53 | ✅ |
| RLS-enabled tables | 40 | 40 | ✅ |

Set-level diffs of index names and `table|policy` pairs are **empty in both directions**.

## Production impact: none

No SQL ran against the live database. `20241101000000` and `20260730100000` were registered with
`migration repair --status applied` (bookkeeping only). Migration history: **42 local / 42 remote /
zero one-sided rows.**

## What this unlocks

- `supabase db reset` reproduces the full schema from source
- Supabase branch / staging databases can be created from the repo
- Schema is recoverable from git alone
- Migration replay is now a **regression test** — it would have caught the two stale definitions above

## Remaining note

The baseline is a point-in-time dump, so it duplicates what later migrations also create. That is the
accepted cost of adopting an existing project. Future migrations layer on normally; only add a new
baseline if the history ever becomes unwieldy enough to warrant a squash.
