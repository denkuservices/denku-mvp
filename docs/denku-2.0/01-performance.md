# Performance — root cause, applied fixes, deferred backlog

**Decision:** the full comprehensive perf pass is **deferred until the system is ~100%
feature-complete** — optimizing round-trips is best done once all the queries exist, so later
features build on the optimized shape rather than re-introducing waterfalls. A safe, high-value
first pass IS already shipped (below). Do NOT do the deferred Tier-B items until feature work settles.

## Root cause (not indexes)

Hot query columns are all indexed (`idx_calls_org_id_created_at`, `conversations_org_lastmsg_idx`,
`messages_org_id_idx`, tickets/leads/appointments `(org_id, created_at)`), so full scans are NOT the
problem. The problem is **round-trip amplification + zero caching**:

- `supabase.auth.getUser()` is an **HTTP validation call to Supabase Auth**, not a local JWT decode
  — and it runs ~3–6× per navigation: middleware (`middleware.ts:251`), `(app)/layout.tsx` via
  `checkOnboarding.ts:94`, `resolveOrgId`/`getActiveOrgId`, and often a 2nd explicit `getUser` in the
  page (e.g. `tickets/page.tsx:47`). None memoized across the tree.
- 31 pages under `(app)` are `force-dynamic`; `next.config.ts` set no `experimental.staleTimes`, so
  Next 16's client Router Cache used `staleTime: 0` — a revisited page/conversation refetched every time.
- Inbox conversation switch = uncached, unprefetched full server round-trip (`inbox/[conversationId]/page.tsx:18`).
- Inbox channel-chip click sets `loading=true` (skeleton) and refetches from offset 0 with no client
  cache (`ConversationList.tsx:94-117`).
- `listConversationPage` scans 500 rows incl. `calls.transcript` and filters in JS (`conversations.ts:320-416`).
- Middleware runs `auth.getUser` + `profiles` + `organization_settings` sequentially per request; had
  7 leftover debug `console.log`s.
- Three helpers (`getWorkspaceStatus`/`isWorkspacePaused`/`getOrgTimezone`) read the SAME
  `organization_settings` row in 3 separate round-trips.

## ✅ Applied fixes (2026-08-31, verified: `tsc` clean on changed files, 864/864 tests pass)

1. **`next.config.ts`** → `experimental.staleTimes = { dynamic: 30, static: 180 }`. Biggest cheap win: revisited pages/conversations render from client cache instantly.
2. **`ConversationList.tsx`** → stale-while-revalidate client cache (`Map` keyed by `channel|query|filter`). Channel/filter switches render cached rows immediately (no skeleton flash) while revalidating; `loadMore` and optimistic unread-clear keep the cache in step.
3. **`lib/analytics/params.ts`** → `resolveOrgId` wrapped in React `cache()` (dedupes auth+profiles within a request).
4. **`lib/org/orgSettingsContext.ts`** (new) → `getOrgSettingsContext` (`cache()`-wrapped) reads `workspace_status`/`default_timezone`/`onboarding_step` once; `getWorkspaceStatus`/`isWorkspacePaused`/`getOrgTimezone` now delegate to it → 3 round-trips collapse to 1/request. Behavior/ defaults preserved exactly.
5. **`loading.tsx`** added for `calls`, `tickets`, `leads`, `analytics`, `agents` (were missing → menu clicks looked frozen).
6. Removed 7 debug `console.log`s in `middleware.ts` and the `DEBUG time filter` log in `calls/page.tsx`.

## ⏳ Deferred backlog (Tier B — do when feature-complete)

Ranked by value; several touch auth gating, so do them carefully with tests.

1. **Trim the middleware auth chain** (blocker-level cost). Cache the "onboarding complete + org_id"
   decision in a short-lived signed cookie set once per session; prefer a local session/JWT check
   (`getClaims()`) for the fast reject and only call `getUser()` when a privileged decision needs it;
   skip the `organization_settings` query on deep navigations. **Risk: auth gating correctness — cover with tests.**
2. **One `cache()`-wrapped `getRequestOrgContext()`** returning `{orgId, userId, role, workspace_status, default_timezone, onboarding_step}` in a single query; route `resolveOrgId`/`getActiveOrgId`/`isAdminOrOwner` through it and delete the redundant 2nd `auth.getUser()` in `tickets`/`analytics` pages.
3. **Push inbox/CRM list filters into SQL** (ilike search, channel, date bounds) using existing
   indexes, and **drop `calls.transcript` from list SELECTs** (`conversations.ts:320`) — turns a
   500-row transcript scan into an indexed `LIMIT 25`. Verify the list preview (`summary`) doesn't
   depend on transcript at query time before dropping it.
4. **Give the Inbox a client conversation/thread cache** + prefetch top/hovered rows (mirror the
   `fetchInboxPageAction` pattern) so reopening a conversation is instant.
5. **Collapse `getDashboardOverview`'s ~12 sequential/overlapping `calls` scans** into one wide scan
   bucketed in JS; parallelize independent stages; use estimated counts where a KPI can be approximate.
6. **Batch `computeCallOutcomes`** (calls page) into one `Promise.all`; prefer joining on `call_id`
   over the time-window heuristic.
7. Pass the resolved `userId/orgId` from middleware to the page (header/cookie) so the page + actions
   trust it instead of re-validating; fold `MarkRead` into the render or debounce it.
8. Pass identity from the server layout into `ProfileWidget` instead of a client-side `getUser`.

Key files: `middleware.ts`, `(app)/layout.tsx`, `lib/auth/checkOnboarding.ts`, `lib/analytics/params.ts`,
`lib/org/getActiveOrgId.ts`, `lib/platform/serverOrg.ts` (already `cache()`-wrapped — copy the pattern),
`lib/platform/readModel/conversations.ts`, `lib/platform/readModel/inbox.ts`, `lib/dashboard/getDashboardOverview.ts`.
