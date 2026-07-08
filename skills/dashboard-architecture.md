# Skill: Dashboard architecture

> The `(app)/dashboard` surface: Horizon UI shell, page inventory, data-fetching patterns, and the
> conventions Sprint 7/8 locked in.

## Shell composition (layout chain)

```
app/(app)/layout.tsx                 → DM Sans font, HorizonStylesheet, getOnboardingComplete()
  └ AppShellWrapper (client)         → 3 modes:
      /onboarding/*                  → children raw (wizard owns its layout)
      onboarding incomplete          → sidebar-less bone-theme chrome + "Back to setup"
      else                           → HorizonShell
          └ HorizonShell             → MobileNavProvider + SidebarAdapter + main (xl:ml-[323px])
```

- Sidebar nav = `components/horizon-shell/nav.tsx` → **exactly 8 flat items**: Dashboard, Phone
  Lines, Calls, Tickets, Appointments, Usage, Analytics, Settings. No nesting — this was a
  deliberate product decision; don't add nested menus.
- Route-title mapping via `horizon-shell/navigation.ts`; brand text computed client-side after
  mount to avoid hydration mismatch (keep that pattern).
- Horizon assets: `next.config.ts` rewrites `/img|/fonts|/svg → /horizon/*` and webpack-aliases
  `components|contexts|variables|utils|routes|styles → src/horizon/*`. **Do not "clean up" these
  aliases** — Horizon template code depends on them; they also mean those bare specifiers are
  reserved (never create npm-style imports with those names).

## Page inventory

**Real, working pages:** dashboard home (`DashboardClient` + `getDashboardOverview`), phone-lines
(list + `[lineId]` detail with tabs: Line Configuration / Assigned AI / Advanced, add-number modal
4-step flow), calls (+ `[callId]` detail with transcript & collapsible audit metadata), tickets
(+ detail, comments, activity, quick actions), appointments, leads (+ new + detail), agents
(+ new + detail), analytics (calls + tickets analytics component suites), settings tree (account
profile/security, agents + advanced, workspace general/billing/usage/members/audit).

**Placeholder routes removed (R-012, 2026-07-08):** `dashboard/{knowledge,tools,risk,activity,
billing}` (all rendered "Placeholder page.", none in the 8-item sidebar) are deleted. `usage/page.tsx`
still just redirects to `settings/workspace/usage`; the REAL billing page is `settings/workspace/billing`.
Also removed (Task 7): the fake API-keys screen (`settings/workspace/keys`), the fabricated
integration health cards, and the orphaned no-op `DangerZoneCard` / `QuickActionsCard`.

## Data-fetching pattern (the house pattern — copy exactly)

Server Components fetch directly; no client-side data fetching for initial render:

```ts
export const dynamic = "force-dynamic";           // org state must be fresh
export default async function Page({ searchParams }: { searchParams: Promise<...> }) {
  const resolved = await searchParams;            // Next 16: Promise!
  const orgId = await resolveOrgId();             // lib/analytics/params.ts (throws → redirect)
  const { data } = await supabaseAdmin.from("calls")
    .select("…").eq("org_id", orgId)              // ← MANDATORY scoping
    .order("started_at", { ascending: false }).limit(200);
```

- Interactive islands are separate client components under the route's `_components/`.
- Mutations = server actions in `_actions/` or session-authed API routes; client calls
  `router.refresh()` after success (see AddPhoneNumberModal).
- Loading/error states: route-level `loading.tsx` / `error.tsx` (phone-lines is the reference
  implementation); empty states distinguish "no data yet" vs "no match for filters"
  (calls page: `'No calls found yet.'` vs `'No calls match your filters.'`).
- Known limits: `.limit(200)` on calls with **no pagination UI** anywhere; ordering server-side.

## Established page-level conventions (Sprint 7/8 decisions)

- **"AI", not "agent"** in customer-facing copy outside Settings → Agents/Advanced (calls table
  header was renamed for this).
- **Primary actions use the Horizon purple/blue button** (`bg-brand-500` or
  `Button variant="primary"`).
- Preview-mode gating on phone-lines: add-number CTA becomes a Link to billing; destructive
  buttons disabled with tooltip "Upgrade to activate this feature".
- Calls filtering: `?phoneLineId=<uuid>` (validated as UUID) resolves the line's
  `vapi_phone_number_id` and filters calls on it; "Clear filter" links to bare `/dashboard/calls`.
  Time filters (`?since=1d|7d|30d`): 1d = rolling 24h; 7d/30d = timezone-aware start-of-day using
  workspace timezone (fallback browser tz, fallback UTC).
- Phone Lines "Today" column uses RPC `fn_calls_today_counts_by_phone_number` (avoid N+1).
- Charts: ApexCharts via `components/ui-horizon/charts/*` (client-only wrapper
  `ReactApexChartClient` — ApexCharts cannot SSR; always use the wrapper).

## Component libraries in play (pick per surface, don't unify ad hoc)

- `components/ui-horizon/*` — dashboard cards, tables, badges, stat blocks, toolbar, empty states.
- `components/ui/*` — shadcn-style primitives (button, dialog, select, popover, command, spinner)
  used mostly by settings forms and modals.
- `components/tickets/*`, `components/analytics/*` — domain component suites.
- `components/dashboard/*` + `variables/charts.ts` — Horizon template demo widgets, some unused;
  check usage before extending.

## Sharp edges

- `dashboard/settings/workspace/billing/page.tsx` is a 1,432-line CLIENT component with its own
  local Button/Card/Badge — the largest UI file; extract before adding features to it.
- Some pages read via `supabaseAdmin`, some via the session client — both appear; the invariant is
  org scoping, not the client choice (session client at least gets RLS where policies exist).
- `getDashboardOverview` exists in two places (`app/(app)/dashboard/getDashboardOverview.ts` and
  `lib/dashboard/getDashboardOverview.ts`) — check which one the page imports before editing.
- Raw `error.message` from Supabase is rendered on some pages (calls) — don't propagate that
  pattern to new pages.
