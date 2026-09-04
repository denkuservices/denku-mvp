# Performance — root cause, applied fixes, deferred backlog

**Status: Tier A shipped 2026-08-31. Tier B shipped 2026-09-04** (owner's call: the waiting had
become the product's worst feature, so the "wait until feature-complete" deferral below was
overridden). What remains deferred is listed at the bottom, with the reason each item was left.

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

**One fact underpins all of it:** the database is in `us-west-2` and the functions run in `iad1`
(see the `supabase-vercel-region-mismatch` note). Every round-trip is a cross-country hop, so the
cost of a page is the *count* of its sequential queries far more than the bytes any of them move.
Every fix below removes round-trips or removes the waiting between them.

## ✅ Tier A (2026-08-31, verified: `tsc` clean on changed files, 864/864 tests pass)

1. **`next.config.ts`** → `experimental.staleTimes = { dynamic: 30, static: 180 }`. Biggest cheap win: revisited pages/conversations render from client cache instantly.
2. **`ConversationList.tsx`** → stale-while-revalidate client cache (`Map` keyed by `channel|query|filter`). Channel/filter switches render cached rows immediately (no skeleton flash) while revalidating; `loadMore` and optimistic unread-clear keep the cache in step.
3. **`lib/analytics/params.ts`** → `resolveOrgId` wrapped in React `cache()` (dedupes auth+profiles within a request).
4. **`lib/org/orgSettingsContext.ts`** (new) → `getOrgSettingsContext` (`cache()`-wrapped) reads `workspace_status`/`default_timezone`/`onboarding_step` once; `getWorkspaceStatus`/`isWorkspacePaused`/`getOrgTimezone` now delegate to it → 3 round-trips collapse to 1/request. Behavior/ defaults preserved exactly.
5. **`loading.tsx`** added for `calls`, `tickets`, `leads`, `analytics`, `agents` (were missing → menu clicks looked frozen).
6. Removed 7 debug `console.log`s in `middleware.ts` and the `DEBUG time filter` log in `calls/page.tsx`.

## ✅ Tier B (2026-09-04, R-157 — `tsc` clean, 1653/1653 tests pass, `next build` green)

### 1. The middleware stopped re-deriving the same answer on every click

`middleware.ts` ran on every request into `/dashboard` — the RSC fetch behind each client-side
navigation included — and spent **three sequential round-trips** there before Next began rendering:
Supabase Auth, then `profiles`, then `organization_settings`.

- **`lib/auth/gateCookie.ts` (new)** — the decision the middleware reached, in an **HMAC-signed
  cookie** (`denku_gate`, 10 min). Signed with WebCrypto (middleware is Edge; `node:crypto` has no
  `createHmac` there) using an HKDF subkey of the deployment's existing `SECRET_ENCRYPTION_KEY`.
- **`auth.getClaims()` on the fast path** — the project uses **ES256 asymmetric JWT signing keys**
  (verified against its `/auth/v1/.well-known/jwks.json`), so the session is verified **locally**
  with no network call. It falls back to `getUser()` by itself on a shared-secret token, so it is
  never worse than before.
- **Only the ALLOW is cached.** A missing/expired cookie, a bad signature, a user id that does not
  match the session, an unconfirmed email or `onboarding_step < 6` all fall through to the
  **untouched** full check — which still calls `getUser()`. So a revoked session, a deleted user or
  a reset onboarding step is caught within 10 minutes rather than never, and somebody who has just
  *finished* onboarding is never held back (that is exactly the case that is never cached).
- **No key, no shortcut**: unsigned deployments take the original path, and say so once
  (`[middleware][GATE][UNSIGNED]`) rather than being silently slow.
- The fast path has **its own try/catch**: the outer one redirects to `/login`, and a failing
  optimisation must cost milliseconds, not somebody's session.
- `/onboarding` used `getUser()` and **discarded the result** — a pure network round-trip on every
  step of a flow that is nothing but navigation. Now `getSession()`, which keeps the same
  refresh-and-write-cookies behaviour without the call.
- The cookie is cleared on sign-out (`signOutAction`, `signOutAllDevices`) — hygiene on a shared
  machine; it is user-id-bound, so it was never a hole.

Tests: `test/dashboard-gate-cookie.test.ts` (round-trip, tampered payload, foreign key, expiry,
unsigned deployment, malformed input, hex keys).

### 2. One auth round-trip per request instead of three to six

**`lib/auth/currentUser.ts` (new)** — `getCachedUser()` / `getCachedUserResult()`, React
`cache()`-wrapped. Routed through it: `checkOnboarding.ts`, `analytics/params.ts` (`resolveOrgId`),
`platform/serverOrg.ts` (`resolveViewer`), `org/getActiveOrgId.ts`, `getDashboardOverview.ts`, and
**18 dashboard pages/server components** that each ran their own `auth.getUser()`
(`settings/account` alone ran three in one render).

⚠️ **The resolvers' differing semantics were deliberately NOT unified.** `resolveOrgId` matches
`profiles.id`, `getActiveOrgId` matches `auth_user_id` by `updated_at`, `resolveViewer` tries `id`
then `auth_user_id` — CLAUDE.md landmines #16/#20 explain why, and merging them would change which
workspace some accounts see. Only the duplicate *network calls* were removed.

`(app)/layout.tsx` reads `onboarding_step` from the gate cookie the middleware just wrote, instead
of re-deriving it (auth + 2 queries) purely to choose which chrome to draw. No cookie → original check.

### 3. The Inbox stopped shipping 500 transcripts to render 25 rows

`listConversationPage` scanned up to `CONVERSATION_SCAN_LIMIT` rows **including `calls.transcript`**
— by far the largest column on a call — for the sake of a 140-character preview under the
twenty-five rows that survive filtering.

- New `preview?: boolean` on `ListConversationsOpts`; `hydrateSummaries()` fetches transcripts
  **by id, for the page only**, after the window is narrowed.
- **Search keeps the old shape**, because matching on what was said means having what was said for
  every candidate row. Searching is a deliberate act; opening the Inbox is not.
- `preview: false` also applied to the pure counting scans in `readModel/aggregate.ts` (×2) and
  `readModel/employeeActivity.ts` (a 500-row scan that only reads ids and timestamps).
- `listConversationViews` also ran employee-names → calls → conversations as a **ladder**; the three
  are independent and now go out together.

Tests: `test/inbox-preview-hydration.test.ts` (a fake that projects to the requested columns, like
Postgres — so a preview silently becoming null fails here, not in production).

### 4. Home stopped being a ladder of a dozen queries

`getDashboardOverview` issued ~12 sequential stages — org name, six counts, three feed lookups, the
readiness probe, the month metrics, a six-month scan, an eight-week scan, a tickets scan, a
48-hour scan, the roster, the savings window — none of which read anything the previous one
produced. All the windows are now computed up front and every query **started** in one place; the
aggregation code below is untouched and still awaits each result exactly where it did. Only the
agent-performance scan still waits, because it is keyed on the roster's ids.

Tests: `test/dashboard-overview.test.ts` — asserts the reads overlap (a probe on max in-flight) AND
that every figure still comes from the query it came from before, which is the half a hoist can
silently break.

### 5. Opening a conversation is warmed before the click

The thread is `force-dynamic`, so Next's automatic link prefetching only ever fetched its loading
boundary. `ConversationList` now prefetches on hover/focus (once per id per mount — the router keeps
it for `staleTimes.dynamic`), and eagerly warms the top row.

### 6. The calls page's outcome lookup

`computeCallOutcomes` ran four sequential queries per org (appointments/tickets by call id, then
both by time window). They are independent; they now go out together.

### 7. "Spinner with changing text" past two seconds

`_platform/ui/SlowLoadNotice.tsx` + `slowLoadCopy.ts`, added to every `loading.tsx` (via the shared
`ListSkeleton`/`GridSkeleton`, plus the bespoke ones). **Silent for the first 2 seconds** — a
spinner that flashes for a fifth of a second is worse than none — then a pill fades in with a line
that changes as the wait goes on. Localised through the dashboard dictionary (en/es/de/tr).

It **never claims progress it cannot see**: no percentage, no "almost done", and the last message
("this is taking longer than usual") is terminal rather than looping reassurances. The two bare
`<div>Loading…</div>` phone-line boundaries were replaced with real skeletons at the same time.

Tests: `test/slow-load-notice.test.ts` (silence below the threshold, the 2s threshold itself, the
progression, the terminal message, no fabricated progress, all four locales, nonsense clocks).

## 📏 Measured against a real workspace (2026-09-04)

The first pass above was reasoned from the code. This pass was **measured**: a production build
(`next start`) signed in as a real owner, with every Supabase round-trip traced by wrapping the
clients' `fetch`. Two things that measurement immediately corrected:

- **`PLATFORM_UX_ENABLED` is ON**, so `/dashboard` never calls `getDashboardOverview` at all — the
  home page is `WorkspaceLaunchpad` + `SetupNudges` + `PlatformDashboard`. The `getDashboardOverview`
  work above is real but it serves the legacy path; everything below is where the time actually was.
- **The numbers are inflated ~6×.** A single trivial round-trip from the dev machine (Turkey) to
  Supabase (`us-west-2`) measured **500–740ms**; from Vercel's `iad1` it is ~70–90ms. The *shape* —
  how many sequential stages a page has — is identical, and that is what was optimised.

### What the trace showed

The home page issued **46 queries**, and the first two were a **serial prologue nothing could
overlap with**: `auth.getUser()` (733ms) → `profiles` (457ms) → everything else. That was **49% of
the page**. Behind it, `listConnectedChannelViews` walked `CHANNEL_ORDER` **awaiting one channel
before asking about the next** — and three different components each asked for the same answer, so
`web_chat_connections`, `email_connections` and `telegram_connections` were read three times apiece,
in series.

### Fixed in this pass

1. **`readModel/channels.ts`** — one `cache()`d `Promise.all` over every declared connection source,
   shared by `listConnectedChannelViews`, `listChannelsByEmployee` and `countConnectedChatChannels`
   (the last of which was four more sequential head-counts). A caller injecting its own client
   bypasses the memoization, so tests stay honest.
2. **`lib/auth/profileRows.ts` (new)** — one `profiles` read per request, matching **both** `id` and
   `auth_user_id` in a single `.or()` query. `resolveViewer`'s fallback used to be two sequential
   queries, and for any account keyed by `auth_user_id` (how signup writes them) the first always
   missed. Each resolver still applies its own rule to the result — the rules are **not** merged.
3. **`getSessionUserId()`** — the user id via `getClaims()` (local ES256 verification, no network)
   instead of `getUser()` (an HTTP call). Used only where the id is all that is needed; anything
   reading email, metadata or confirmation state still goes through `getCachedUser()`, and
   **authorization (`getViewer`) deliberately still calls `getUser()`** so a revoked session cannot
   spend money.
4. **The gate cookie carries both org answers** (`org` = the `auth_user_id` rule, `orgById` = the
   `id` rule), so a page can skip the `profiles` query entirely without any resolver silently
   adopting another's rule. Guarded twice: the cookie must verify, and its `uid` must match the
   cryptographically verified session. A cookie minted before this field existed reads as "not
   recorded" and the query runs as before.
5. **`getArtifactCounts`** — four sequential head-counts → one `Promise.all`.

### Before → after (local production build, ~500ms round-trip)

| Surface | Before | After |
|---|---|---|
| **Middleware** (every navigation) | 1099ms (full check) | **11–20ms** (gate fast path) |
| Home `/dashboard` | 3613–4409ms | **1472–1901ms** |
| Inbox list | 2151ms | **1318–1789ms** |
| Requests | 2653ms | **1894ms** |
| Contacts | 1248–1854ms | **593–706ms** |
| Channels | — | **348–364ms** |
| Open a conversation | — | **1263–1530ms** (one wave, no prologue) |
| Settings → Workspace | — | **2012–2600ms** ← slowest remaining |

Structurally, on the home page: `auth.getUser()` calls **1 → 0**, `profiles` reads **5 → 1** (the
survivor is `getViewer`'s authorization read, which must stay live and now runs in parallel),
connection tables **3–4 each → 1 each**, and the 1190ms serial prologue **→ 0**.

### Two things measurement said NOT to do

- **`organization_settings` is read four times on Settings → Workspace** (`{workspace_status,…}`,
  `{*}`, notification prefs, business hours) — one row, four round-trips. Left alone deliberately:
  each reader treats "unknown column" as *migration not applied → safe default*, and the business-
  hours reader's default is the load-bearing "no hours configured means OPEN". Collapsing them onto
  one `select("*")` changes an error into an absent field, which is the kind of quiet change that
  turns a safe default into a wrong one. Worth doing with its own tests, not as a perf tweak.
- **The remaining `auth.getUser()` on Settings** is `getViewer()`. It is authorization, and
  `getUser()` is what notices a revoked session. Not touched.

## ⏳ Still deferred, and why

1. **Push the Inbox's ilike search and date bounds into SQL.** Entangled with the R-018 truthful-count
   guarantee: `total`/`bounded` describe *the scanned window*, and moving the filters into the query
   changes what those words mean. Worth doing — it would also fix a real correctness wart (a date
   filter outside the 500-row window silently returns nothing) — but it is a contract change, not a
   perf tweak, and belongs with its own tests.
2. **Pass the topbar identity from the server layout into `ProfileWidget`** (old item 8). Deliberately
   NOT done: it would remove two client round-trips but add a blocking server query to the render
   path that items 1–2 above just made query-free. It affects when a name appears, not how fast a
   page transitions.
3. **A single `getRequestOrgContext()` returning `{orgId, userId, role, …}`** (old item 2). The
   duplicate *network calls* are gone; what remains is the three resolvers' deliberately different
   `profiles` matching, which is a correctness question (landmine #16/#20), not a performance one.
   Do it when the workspace switcher forces one resolver to exist.
4. **The region mismatch itself.** Every fix above reduces the *number* of cross-country hops;
   none of them shortens one. Moving the functions to `us-west-2` (or the database to `iad1`) is
   still the largest single remaining win and is an infrastructure decision, not a code change.

Key files: `middleware.ts`, `lib/auth/gateCookie.ts`, `lib/auth/currentUser.ts`, `(app)/layout.tsx`,
`lib/auth/checkOnboarding.ts`, `lib/analytics/params.ts`, `lib/org/getActiveOrgId.ts`,
`lib/platform/serverOrg.ts`, `lib/platform/readModel/conversations.ts`,
`lib/platform/readModel/aggregate.ts`, `lib/platform/readModel/employeeActivity.ts`,
`lib/dashboard/getDashboardOverview.ts`, `dashboard/calls/page.tsx`,
`dashboard/inbox/_components/ConversationList.tsx`, `dashboard/_platform/ui/SlowLoadNotice.tsx`.
