# Audit 05 — UX Audit

- **Date:** 2026-07-06 · **Findings current as of:** 2026-07-06
- **Lens:** Head of UX / senior product designer. Question: *can a business owner accomplish the
  core jobs — review a call, handle a ticket, buy a number, manage the AI, invite a teammate —
  without friction, confusion, or dead ends?*
- **Scope:** task flows, navigation & information architecture, feedback/confirmation, empty/
  loading/error states, forms, resilience. Visual craft is deferred to Audit 06 (UI/Design);
  content honesty to Audits 01/02.
- **Relationship to prior audits:** builds on filed UX-adjacent items (R-012 placeholder pages,
  R-023 no pagination, R-026 empty-state teaching, R-028 mobile, R-048 loading states, R-021 raw
  errors, R-010 invites, R-011 forgot-password). Those are referenced; this audit adds the
  interaction-model gaps.

> Living document (Rule 1). Canonical status: `docs/IMPLEMENTATION_ROADMAP.md`.

## What works (the task flows are real)

The core jobs are genuinely accomplishable, and better than the reputation surfaces suggest. The
8-item flat sidebar (Dashboard, Phone Lines, Calls, Tickets, Appointments, Usage, Analytics,
Settings) is a good IA decision — no nested-menu maze. The phone-lines area is the reference
implementation for the whole app: list → detail with tabs, a 4-step add-number modal with a
loading step, dedicated `loading.tsx` AND `error.tsx`, empty state, and preview-mode gating. Calls
and tickets have real detail views, filters, and shared `EmptyState` components. When a page is
built well here, it's genuinely good — the problem is that the quality is **uneven**, and the
unevenness shows up exactly at moments of friction and failure.

## Findings

### [R-061 — NEW, Medium] Runtime errors are unhandled on almost every dashboard route
Only the phone-lines area has error boundaries (`phone-lines/error.tsx`,
`phone-lines/[lineId]/error.tsx`). Calls, tickets, leads, appointments, analytics, usage, and the
entire settings tree have **no `error.tsx`** — a thrown error (a Supabase hiccup, a malformed
row, a Vapi timeout) surfaces the raw Next.js error screen mid-dashboard, or a blank area. For a
product asking businesses to rely on it operationally, "the dashboard broke and showed me a stack
trace" is a trust event. Combined with R-021 (raw upstream error strings), the failure experience
is the least-designed part of the app. *Direction:* a shared dashboard error boundary with a calm
recovery ("Something went wrong — retry / contact support") applied at the dashboard layout level,
so every route inherits it.

### [R-062 — NEW, Medium] No consistent feedback/confirmation model for actions
There is no shared toast/notification system. Each surface improvises: `PhoneLinesClient` rolls its
own `toastMessage` useState; the member-invite form calls `window.location.reload()` after
submitting; other mutations update inline state or give no confirmation at all. The result is that
"did my action work?" is answered differently on every screen — sometimes a banner, sometimes a
full page reload (jarring, loses scroll position), sometimes silence. Destructive actions are also
inconsistently guarded (phone-line delete has a typed-confirm dialog; other mutations don't).
Premium B2B tools have one predictable feedback language: every action confirms the same way.
*Direction:* adopt one toast/confirmation primitive; standardize success/failure feedback and
destructive-action confirmation across all mutations. (Pairs with R-021 for the error half.)

### [R-063 — NEW, Medium] "Agents" exist in two disconnected places with different UIs
The AI can be managed at **both** `/dashboard/agents` (+ `/agents/new`, `/agents/[agentId]`) and
`/dashboard/settings/agents` (+ `/settings/agents/[agentId]`, `.../advanced`) — two separate page
trees, two visual treatments, reachable by different paths (sidebar has neither; agents are found
via deep links / settings). A customer configuring their AI can't form a stable mental model of
"where do I manage my AI employee," and the two surfaces can present differently. This is the
information-architecture root behind several discoverability complaints. *Direction:* pick one
canonical home for AI management, redirect the other, and surface it consistently (the product's
central object — the AI employee — deserves a first-class, single location). Interacts with R-050
(the config that these screens edit is what silently strips tools) and the "AI not agent" naming
rule (R-065, Audit 06).

### Referenced (already filed — friction confirmed, not re-filed)
- **R-012** placeholder pages (Knowledge/Tools/Risk/Activity) reachable by URL — dead ends.
- **R-023** no pagination/search on lists; **no global/cross-entity search** anywhere — findability
  collapses past a few hundred rows (enrich R-023 to include cross-list search / command palette).
- **R-026** empty states state emptiness instead of teaching the next action; also *inconsistent*
  (tickets/appointments/calls use shared `EmptyState`; leads uses a bare `<p>No leads found</p>`).
- **R-048** loading states are spinners or a debug-leftover `Loading…` div, not skeletons.
- **R-011** forgot-password dead-loop; **R-010** invites 401; **R-025** activation raw errors;
  **R-028** mobile unaudited; **R-047** in-app support dead-ends to the marketing form.

## Product Score (Usability): 6 / 10

The happy paths work and the phone-lines area proves the team can build genuinely good UX. The
score is held down by the *unhappy* paths and the interaction inconsistencies: errors are
unhandled almost everywhere (R-061), feedback is improvised per-screen (R-062), the central object
lives in two places (R-063), and findability doesn't scale (R-023). None are deep — they're the
polish layer that separates "functional" from "premium," and fixing them is mostly consolidation,
not new features. Usability reaches ~7.5 with the error/feedback/IA trio addressed.

## Top ROI Improvements (usability)

| # | Improvement | R-ID | Why |
|---|---|---|---|
| 1 | One shared dashboard error boundary + calm recovery | R-061 | Removes stack-traces-in-production across the whole app; S–M effort |
| 2 | One feedback/confirmation system (toasts + destructive confirm) | R-062 | Every action becomes predictable; kills `window.reload` jank |
| 3 | Single canonical home for AI management | R-063 | Fixes the central-object confusion; discoverability |
| 4 | Teaching + consistent empty states (incl. leads) | R-026 | Turns dead lists into onboarding |
| 5 | List search/pagination + cross-entity search | R-023 | Findability at real data volumes |
| 6 | Skeleton loading states; remove debug leftover | R-048 | Perceived speed + polish |

## Executive Summary

Denku's UX is a story of unevenness: the phone-lines area is genuinely premium, and the core jobs
are all completable, but the quality doesn't hold at the edges — where things fail, where actions
confirm, and where the central object (the AI) lives. The three new findings are all
*consolidation* work: give the whole dashboard one error boundary (R-061), one feedback language
(R-062), and one home for managing the AI (R-063). Together with the already-filed polish items
(empty states R-026, loading R-048, search R-023), these move the app from "works if nothing goes
wrong" to "feels dependable when things do" — which is the actual bar for software a business runs
its phone line on. No new features required; this is craft and consolidation.

## Action Items

| # | Action | R-ID | Priority |
|---|---|---|---|
| 1 | Shared dashboard error boundary + recovery UI | R-061 | Medium |
| 2 | One feedback/confirmation system across mutations | R-062 | Medium |
| 3 | Consolidate AI management to one canonical location | R-063 | Medium |
| 4 | Consistent, teaching empty states (fix leads bare state) | R-026 | Medium |
| 5 | List + cross-entity search/pagination | R-023 | Medium |
| 6 | Skeleton loading states | R-048 | Medium |
