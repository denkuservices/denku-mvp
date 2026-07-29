# Graphify Remediation — Architecture Impact Report

**Date:** 2026-07-30 · **Branch:** `chore/graphify-remediation` · **Roadmap ID:** R-133
**Scope:** `web/` (518 code files + 9 docs) · **Method:** Graphify knowledge graph (AST + semantic), then
per-finding verification against the code and the live Supabase DB (read-only).

> **Reading rule.** Every claim below was verified against source or the live DB before being acted on.
> Where Graphify's signal turned out to be wrong or low-value, that is stated explicitly rather than
> quietly dropped. Two of the four "duplication" findings were **rejected** after inspection.

---

## 1. What Graphify found

Graph built over `web/`: **2,355 nodes · 5,409 edges · 167 communities** (images excluded — 124 Horizon
template assets carry no architectural signal). Cost: 94,557 input tokens, one semantic subagent.

**God nodes (highest degree):**

| Node | Edges | Betweenness |
|---|---|---|
| `createSupabaseServerClient()` | 212 | 0.217 |
| `supabaseAdmin` | 93 | 0.158 |
| `cn()` | 73 | — |
| `logEvent` | 69 | — |

**Surprising connections:** `HORIZON_PREVIEW_STATUS.md` ↔ `HORIZON_SETUP.md` and
`LANDING_REDESIGN_SPEC.md` ↔ `DELTA_PLAN_TAILWIND.md`, both flagged `semantically_similar_to` (INFERRED).

**Health warning:** 688 dangling-endpoint edges (external npm imports — expected, `node_modules` is out
of graph), 1 self-loop, 12–13 same-endpoint collapsed edges (duplicate `imports_from` on adjacent lines).

---

## 2. What was actually changed

### 2.1 Shared cookie policy extracted (the one real coupling defect)

**Finding.** `middleware.ts:22–60` duplicated `lib/supabase/server.ts` verbatim: identical env-var
validation (same error string), identical `secure: isProduction` / `sameSite ?? "lax"` / `path ?? "/"`
defaults, identical `maxAge: 0` removal, **and copy-pasted comments**. Only the storage backend differed
(`cookies()` from `next/headers` vs `request`/`response.cookies`).

**Why this mattered.** These two clients must agree byte-for-byte on cookie attributes. Middleware
refreshes the session cookie that Server Components later read. If one side changed `secure` or
`sameSite` and the other did not, the browser silently drops or shadows the cookie → intermittent
logouts, reproducible only on one transport. A single security policy sitting in two hand-maintained
copies is textbook unnecessary coupling.

**Change.** New `web/src/lib/supabase/cookiePolicy.ts` exporting `resolveSupabaseAnonCredentials()`,
`authCookieOptions()`, `authCookieRemovalOptions()`. Both clients now derive attributes from it.

- Not marked `server-only` **on purpose** — it reads only `NEXT_PUBLIC_*` and `NODE_ENV`, holds no
  secrets, and must stay importable from Edge middleware.
- `isProduction` moved from a hoisted `const` to a per-call read of `NODE_ENV`. Functionally identical
  (`NODE_ENV` is immutable for a process lifetime); noted for completeness.
- Net: **−18 lines**, and the duplication count for that policy went 2 → 1.

### 2.2 Temporary debug code removed

**19 author-marked temporary logs deleted** across 5 files. The boundary was deliberately drawn at
*author-marked* `TEMP` — an objective signal that the code was never intended for production — not at
personal taste.

| File | Removed | Note |
|---|---|---|
| `onboarding/sendWelcomeOnOnboardingStart.ts` | 9 `// TEMP DEBUG` logs | **One wrote `user.email` into production logs** |
| `lib/org/ensureDefaultOrg.ts` | 4 `// TEMP DEBUG` logs | Unconditional; no env guard |
| `onboarding/page.tsx` | 2 `// TEMP DEBUG` logs | |
| `(auth)/verify-email/_actions/setPassword.ts` | 1 dev-gated `TEMP` block | |
| `(auth)/verify-email/_actions/verify.ts` | 1 dev-gated `TEMP` block | |

None were env-guarded in the first three files, so **all ran in production**. The PII leak
(`{ id: user?.id, email: user?.email }`) is the reason this was worth doing rather than cosmetic.

Three orphan-avoidance details, each behaviour-preserving:

- `didUpdate` in `sendWelcomeOnOnboardingStart.ts` was read *only* by its log → removed with it.
- `welcomeResult` in `onboarding/page.tsx` was read *only* by its log → binding dropped, **the
  `await sendWelcomeOnOnboardingStart()` call kept** (it sends the email).
- `setPassword.ts` had `const cookieStore = await cookies()` whose only reader was the TEMP block. The
  author's comment states the call exists *for its side effect* ("ensure cookie writes are committed").
  **The call was kept** (`await cookies();`) and only the binding dropped — removing it would have been
  an unreviewed change to an auth path.

### 2.3 Obsolete documentation removed

| Doc | Verdict | Evidence |
|---|---|---|
| `web/HORIZON_SETUP.md` | **Deleted** | Describes `src/horizon/` + `/horizon-preview`, both deleted in `ca92b7e "Remove Horizon demo app and preview routes"`. Zero inbound references. |
| `web/HORIZON_PREVIEW_STATUS.md` | **Deleted** | Same. Referenced only by its sibling. |
| `web/DELTA_PLAN_TAILWIND.md` | **Deleted** | 100% implemented — see below. Zero inbound references. |
| `web/LANDING_REDESIGN_SPEC.md` | **Untouched** | Canonical, describes *unbuilt* work, referenced by `CLAUDE.md:214`, `docs/IMPLEMENTATION_ROADMAP.md:1003`, `skills/design-system.md:44`. |

**On "consolidate" vs "delete" (Horizon).** The brief asked to merge them into one canonical source.
Rejected: both describe an "⏳ Awaiting Horizon UI source files" state for scaffolding that no longer
exists, and the real integration took a *different* path (`components/ui-horizon/`,
`components/horizon-shell/` — direct component adoption, no isolated preview namespace). Merging two
obsolete docs would have produced one canonical **wrong** doc. Git history is the archive; the abandoned
approach is recorded in this report instead.

**On `DELTA_PLAN_TAILWIND.md`.** Every token it requested is already present in `tailwind.config.ts`:
`navy` 50–900, `brand` 50–900, `lightPrimary`, `background.100/900`, `shadow-shadow-500`, `font-poppins`,
`font-dm`; its CSS items are done too (Poppins via the `globals.css` Google Fonts `@import`, DM Sans via
`next/font/google` in `(app)/layout.tsx` — exactly the option the plan recommended).

Its one piece of durable value was the **rationale** — *why* a Tailwind-v4 app declares v3-style config
tokens, and therefore why they must not be "cleaned up". That rationale was **migrated into a header
comment in `tailwind.config.ts`**, next to the code it governs, before the doc was deleted. This is
strictly better than archiving: the knowledge now lives where someone would go to break it.

### 2.4 Dead Tailwind content glob removed

`tailwind.config.ts` globbed `./src/horizon/**/*` — a directory deleted in `ca92b7e`. Provably a no-op
(nothing matches), so removal cannot change generated CSS.

### 2.5 `graphify-out/` gitignored

Generated knowledge-graph cache (24 semantic cache files + `graph.json`). Added to root `.gitignore` and
a stray `web/graphify-out/` removed, so a large generated artifact cannot be committed by accident.
Production-safety hygiene; zero behaviour impact.

---

## 3. What was intentionally left untouched

### 3.1 `createSupabaseServerClient()` — **not split. Leave as is.**

The brief offered three possible separations. Assessment:

1. **Authentication / session retrieval — already separate.** This function does not do it. All 109
   `.auth.*` calls (94 of them `getUser()`) live in *consumers*. There is nothing to extract.
2. **Request/context handling vs client creation — not separable in any useful way.** `createServerClient`
   *requires* a cookie adapter bound to the request's cookie store. Splitting yields two functions only
   ever called together, in one order, by one caller — indirection with no gain.
3. **Mixed concern found and removed:** the embedded `TEMP` debug `console.log` (§2.2) — observability
   leaking into an infrastructure primitive. That was the genuine accumulated responsibility.

**On the 212 references.** 213 occurrences across 87 files (86 consumers + definition), each ~1 import +
1 call. That count is a property of the framework, not a defect: the App Router has no DI container and
no request-scoped singleton, so every Server Component, server action and route handler is an independent
entry point with no parent to thread a client down from. 86 ≈ "every authenticated surface". Any DI scheme
would still need 86 acquisition points, just spelled differently.

**Layering verified sound.** Of 86 consumers, 26 are auth-only and 60 also read data. The two-client
discipline holds: route handlers use the cookie client *only* for `getUser()` then do all data work via
`supabaseAdmin` (`create-draft-invoice/route.ts` = 1 `getUser()` + 20 admin ops), while Server Components
and `lib/*/queries.ts` do user-scoped reads under RLS — which is what an RLS-backed anon client is for.
**Decisive evidence:** all 8 cron / webhook / tools routes use the service-role client and **zero** use
the cookie client. A sloppy boundary would have leaked a cookie client into a cron by now, where it would
silently return zero rows.

**Not a single point of failure.** Pure factory: no module-level singleton, no shared mutable state, a
fresh client per call, no connection pool (PostgREST is HTTP). Its only throw path is missing env vars —
a deploy-config failure that breaks everything regardless. It is a *shared code path*, which argues **for**
centralisation: the localhost `secure`-flag fix lives in one place instead of 86.

**Repositories / DI would be net-negative.** `supabase-js` is already the data-access abstraction; a
repository layer over PostgREST is a wrapper over a wrapper (~9 interfaces + ~9 impls + a container for
zero runtime gain). A DI container fights the App Router — with no request-scoped container you land on
`AsyncLocalStorage` or threading a client through every component's props, both worse than one-line
acquisition. And tenant isolation is already enforced **twice** (explicit `orgId` param + `.eq("org_id")`,
plus RLS); a repository adds no third defence.

### 3.2 `supabaseAdmin` (93 edges) — leave

Already the consolidated single service-role client (R-033 migrated 10 importers and deleted the
duplicate). CLAUDE.md explicitly forbids a second one. Demonstrably testable — **18 test files mock it**.
The module-level `export const supabaseAdmin = getSupabaseAdmin()` throws at import time on missing env,
which is the documented fail-fast contract, not a defect. 93 edges is the expected degree for the single
privileged data path.

### 3.3 `logEvent` (69 edges) — leave

Textbook correct shape for cross-cutting observability: pure function, imports nothing but `console`,
takes a plain object, returns `void`, never throws (double try/catch fallback). High fan-in with zero
coupling cost. Injecting a logger interface would add indirection for no benefit.

*Cosmetic nit, deliberately not fixed:* the catch-fallback emits `stage: "system"`, which is not in the
`LogEvent["stage"]` union (untyped literal, so TS doesn't flag it). It fires only if `JSON.stringify`
fails, and changing it would alter log output in an error path. Not worth the churn.

### 3.4 `cn()` (73 edges) — leave

Standard 4-line `clsx` + `twMerge` shadcn utility; 73 edges = every component uses it, which is correct.

It shares `lib/utils.ts` with `formatUsd()` (a currency formatter) — a mild grab-bag smell. **Splitting
was rejected on a concrete argument:** `cn` and `formatUsd` do not reference each other and share no
state, so they are *already fully decoupled*. Co-location in one file creates **zero** coupling, therefore
splitting removes zero coupling. It would rewrite import lines in ~29 files to gain a tidier filename —
the definition of a cosmetic refactor.

### 3.5 Graphify's two "duplicate doc" edges — one right, one wrong

The `HORIZON_*` pair was a true positive (§2.3). The
`LANDING_REDESIGN_SPEC.md ↔ DELTA_PLAN_TAILWIND.md` edge was a **false positive**: both merely mention
`globals.css` and Tailwind tokens. One is a live spec for unbuilt work, the other a completed
implementation plan. There was no overlapping planning to merge — the correct action was to delete the
finished one and leave the live one alone, which is not what the edge suggested.

### 3.6 Hand-rolled cookie client in the Vapi webhook — left deliberately

`api/webhooks/vapi/route.ts:1603–1619` constructs its own anon client as a `webhook_debug` insert
fallback. Excluded from §2.1 on a principled boundary: its `set`/`remove` are **no-ops**, so it carries
no cookie-write policy and is not part of the duplication that was fixed. Left untouched because it sits
inside the 3,100-line webhook that guarantees never-dead-end artifact creation — editing it for zero
architectural gain is a bad trade. (It is also structurally futile: a webhook has no user cookies, so
RLS denies the insert. Filed below.)

### 3.7 R-078 Instagram `TEMP` operator button — left

Marked `// TEMP operator backfill (Sprint 1.5) — remove after webhook path verified.` Unlike the debug
logs, removing it deletes an operator-facing control — a behaviour change, gated on a verification
condition this change cannot assess. Tracked as R-078.

---

## 4. Coupling improvements

| Metric | Before | After |
|---|---|---|
| Copies of the auth-cookie attribute policy | 2 (hand-maintained) | **1** |
| Copies of anon-credential resolution + error string | 3 | **1** shared + 1 deliberate no-op-policy client (§3.6) |
| Author-marked `TEMP` debug statements in `src/` | 19 | **0** |
| Production log statements emitting user PII | ≥1 (`user.email`) | **0** |
| Docs describing deleted code as pending work | 3 | **0** |
| Dead Tailwind content globs | 1 | **0** |
| Lines in `middleware.ts` | 305 | **287** |

**Dependency-shape observations.** The graph gained one leaf module (`cookiePolicy.ts`) with exactly two
in-edges (`server.ts`, `middleware.ts`) and no out-edges beyond a type import — the shape you want for a
policy constant. Notably, `middleware.ts` previously had **no** dependency on `lib/supabase/` for cookie
behaviour despite implementing the same policy; that invisible coupling (shared semantics, no shared
symbol) is precisely what a graph cannot show and what made the drift risk real. It is now an explicit
edge. No node's degree changed materially: this was duplication removal, not restructuring.

---

## 5. Remaining acceptable technical debt

Ordered by value. **None was fixed here — each would change behaviour, alter schema, or exceed this
change's mandate.**

### P1 — `organizations_legacy` is referenced in code but does not exist in the database

The highest-value finding uncovered, and it is **not** a Graphify finding — it surfaced while verifying
one of the debug-log edits.

Live-DB facts (read-only, project `kebqwsdguxxjsijahrox`):

- `organizations_legacy` exists in **no schema** (`information_schema` `%legacy%` → zero tables).
- `organization_settings.org_id` FK actually targets **`orgs.id`** (`organization_settings_org_id_fkey`),
  not the legacy table the code comments claim.
- Code still writes/reads `organizations_legacy` in **~30 places**: `signupAction.ts`,
  `onboarding/_actions.ts` (many), `lib/org/ensureDefaultOrg.ts`.

Consequence — an error-handling asymmetry that hides the bug:

- `signupAction.ts:249` **discards** the error → silent wasted round-trip. Signup still works because the
  real FK parent (`orgs`) is written. This is why the defect is invisible in production.
- `ensureDefaultOrg.ts:76–81` **captures and returns** it → `ensureDefaultOrgForUser` can never succeed on
  its create path. Its only caller is `sendWelcomeOnOnboardingStart.ts:51`, so the observable symptom is:
  **a user who reaches onboarding without an org never receives a welcome email.**

Not fixed here because removing the legacy writes would make `ensureDefaultOrgForUser` start succeeding,
which starts *sending emails that currently are not sent* — a user-facing change requiring explicit
sign-off, plus a careful pass over ~30 references in the most business-critical path.

**Also update CLAUDE.md landmine #4**, which states both org-creation paths "dual-write `orgs` +
`organizations_legacy` (half-finished migration)". The DB side is finished; only the code lags.

### P1 — CLAUDE.md materially understates RLS

CLAUDE.md: *"RLS exists on a few tables but is NOT the enforcement layer."* Live DB: RLS is **enabled on
13 of 14** tenant tables with 1–4 policies each, correctly scoped via `profiles → org_id`. And 60 files
*do* read through the RLS-backed anon client. The split is ~50/50 (89 admin importers vs 86 cookie-client
importers), not "almost exclusively".

The code is better than the doc claims — but the doc is dangerous as written: an engineer could read it,
conclude RLS is decorative, and disable a policy that is load-bearing for 60 files.

### P2 — `orgs` has RLS disabled, 0 policies, `anon` SELECT granted

The only unprotected tenant table. Any holder of the public anon key can read every org row. Requires a
migration → out of scope (no schema changes).

### P2 — `conversations` RLS policy keys on a different column than its peers

`conversations_select_org` matches `profiles.id = auth.uid()`; `calls`/`tickets` match
`profiles.auth_user_id = auth.uid()`. All 25 current profiles have `id = auth_user_id`, so it works **by
coincidence**. Landmine #4's two disagreeing org-creation paths make divergence plausible, at which point
the policy silently denies or mismatches. Requires a migration.

### P2 — `getAvgResponseTime.ts` is dead code

Queries `conversation_messages`; the live table is `messages`. Fails safe to `"—"` on every dashboard
load. Ironically the heaviest cookie-client file (23 queries), so it inflated the very graph signal that
started this audit. Fixing it makes a currently-blank dashboard metric start showing numbers — a
user-facing change.

### P2 — Per-request memoisation of auth (highest-ROI performance item)

A single `/dashboard/tickets` render performs **4 separate `auth.getUser()` calls** — middleware,
`getOnboardingComplete()`, `resolveOrgId()`, and `page.tsx:47` — plus 3 duplicate `profiles` reads and 2
duplicate `organization_settings` reads. `getUser()` is a **network round-trip** to `/auth/v1/user`
(unlike `getSession()`, which reads the cookie locally). React `cache()` appears **nowhere** in the
codebase.

Deliberately excluded: memoising auth changes *how often the session is validated* — a behaviour change
in a security-sensitive path, and this change's mandate was behaviour-identical. When done, memoise the
**derived values** (`resolveOrgId`, `getOnboardingComplete`, the `getUser` result) — **not** the client
object, which carries mutable cookie setters two callers may expect to write independently.

### P3 — `lib/*/queries.ts` hide their request-scope requirement

`listTickets({ orgId })` takes `orgId` explicitly (good) but acquires its client ambiently, so its
signature does not reveal it can only run inside a request. This is why **18 test files mock
`supabase/admin` and zero exercise `createSupabaseServerClient`** — the entire 60-file cookie-client data
path is structurally untestable and in fact untested.

Cheapest real fix: an optional trailing client parameter defaulting to
`await createSupabaseServerClient()` across ~9 modules. Backwards compatible, unlocks the data path for
tests. This is parameter-default injection, **not** a container — the only "DI" worth doing here.

### P3 — 147 unmarked `console.log` calls in `src/`

Several emit PII (`AccountProfilePage` logs `user.email`; `AgentDetailPage` logs ids at 10 sites).
Excluded because unmarked logs carry no author signal that they are temporary, some may be load-bearing
for operator debugging, and a 147-site blind sweep is log hygiene rather than architecture. Worth a
deliberate pass with a `logEvent` policy.

### P3 — Vapi webhook `webhook_debug` fallback is structurally futile

See §3.6. A webhook has no user cookies, so the anon client's insert is denied by RLS — the code's own
comment concedes this. Dead instrumentation inside a landmine file.

---

## 6. Before / after dependency observations

**Before**

```
lib/supabase/server.ts ──┐
                         ├─ (no shared symbol; identical policy duplicated by hand)
middleware.ts ───────────┘
   env validation + secure/sameSite/path defaults + maxAge:0 ... in BOTH
   server.ts additionally: TEMP console.log inside the cookie set() hot path
```

**After**

```
lib/supabase/cookiePolicy.ts   (leaf: 2 in-edges, 0 out-edges beyond a type import)
        ▲            ▲
        │            │
server.ts        middleware.ts
   resolveSupabaseAnonCredentials() · authCookieOptions() · authCookieRemovalOptions()
```

- Unchanged on purpose: 86 `createSupabaseServerClient()` consumers, 89 `supabaseAdmin` importers, the
  two-client boundary, all 8 cron/webhook/tools routes.
- The removed edges were **not** in the graph. The duplicated cookie policy shared *semantics* without
  sharing a *symbol*, so no AST edge existed between `server.ts` and `middleware.ts` for it. That is the
  standing limitation worth remembering: a knowledge graph surfaces structural coupling, not semantic
  duplication. Graphify pointed at the right node for the wrong reason — high centrality was healthy;
  the defect was a copy-paste it could not see.

---

## 7. Validation

| Check | Baseline | After | Result |
|---|---|---|---|
| `npm run test` | 35 files / 300 tests pass | 35 files / 300 tests pass | **match** |
| `npm run build` | exit 0 | exit 0, identical route list incl. `ƒ Proxy (Middleware)` | **match** |
| `npx tsc --noEmit` (`src/`) | clean | clean | **match** |
| `npx tsc --noEmit` (`test/`) | 31 pre-existing errors (`ProcessEnv`/`NODE_ENV`) | unchanged, untouched | **match** |

Diffstat: **14 files, +530 / −558** (net −28 lines of code, +400 lines of this report).

Behaviour-preservation argument: every change is either a pure code motion producing identical cookie
attribute values, the deletion of a log statement, a documentation deletion, a provably-empty Tailwind
glob, or a gitignore entry. No API signature, route, schema, or user-visible string was modified.

---

## 8. Process note

A `git stash push`/`pop` pair run as a convenience during this audit collided with a pre-existing
249-commit-stale stash (`WIP before vapi cost fix deploy`), leaving 17 `UU` + 2 `UD` conflicts and 24
stash-derived untracked files. Recovered fully: the stash was never dropped (verified byte-identical
before and after, `c893d8a2`), tracked files were restored with a scoped
`git restore --source=HEAD`, and only the 19 explicitly-enumerated stash-derived untracked paths were
cleaned after each was confirmed present in `stash@{0}^3`. No user work was lost.

**Lesson worth keeping:** always `git stash list` before any stash operation, and check the exit status
of a command whose failure changes what the next command targets. `git stash pop` with an empty
push-of-yours silently retargets someone else's stash.

**Note for later:** `stash@{0}` is still present and is 249 commits behind `main`. Popping it onto current
`main` will conflict again — apply it to a branch off `5c37901` or discard it deliberately.
