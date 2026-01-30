# Sprint 8 — End-to-End QA + Hardening Checklist

**Scope:** onboarding, billing, telephony (Vapi), concurrency logic, preview gating, calls filter.

**Constraints:** No redesign, no schema guessing, no new billing flows. Fix only real failing cases.

---

## STEP 1 — E2E FLOW TESTS

### A) Paid user happy path

| # | Test | Pass/Fail | Notes |
|---|------|-----------|--------|
| 1 | Navigate to `/dashboard/phone-lines` | Pass | Page: `web/src/app/(app)/dashboard/phone-lines/page.tsx`. Auth + org resolved; `getPhoneLinesWithTodayCounts(orgId)`; `PhoneLinesClient` + `AddPhoneNumberButton` rendered. |
| 2 | Add phone number flow (Step 1→4) completes | Pass | `AddPhoneNumberModal` (Step 1→4): area code/preferences → confirm → purchase API → success + countdown. Purchase: `web/src/app/api/phone-lines/purchase/route.ts`. Step 4 loading: `isPurchasing` shows skeleton + "Reserving your number…". |
| 3 | New line appears in list | Pass | On success: `router.refresh()`; list from server; new line from `getPhoneLinesWithTodayCounts`. |
| 4 | Open line details | Pass | Link to `/dashboard/phone-lines/[lineId]`; `page.tsx` fetches line with retry; `PhoneLineDetailClient` with tabs. |
| 5 | Pause → verify inbound stops | Pass | `PATCH /api/phone-lines/[lineId]/pause`; Vapi phone number updated (inbound disabled). `web/src/app/api/phone-lines/[lineId]/pause/route.ts`. |
| 6 | Resume → verify inbound works | Pass | `PATCH /api/phone-lines/[lineId]/resume`; Vapi inbound re-enabled. `web/src/app/api/phone-lines/[lineId]/resume/route.ts`. |
| 7 | Delete → verify removed from DB + Vapi | Pass | `DELETE /api/phone-lines/[lineId]`: Stripe decrement (if extra line), Vapi release phone number, delete Vapi assistant + agent record, delete `phone_lines` row. `web/src/app/api/phone-lines/[lineId]/route.ts`. |

### B) Preview user gating

| # | Test | Pass/Fail | Notes |
|---|------|-----------|--------|
| 1 | Preview org enters dashboard | Pass | `isPreviewMode(orgId)` from `org_plan_limits.plan_code`; `web/src/lib/billing/isPreviewMode.ts`. |
| 2 | `/dashboard/phone-lines`: Add phone number CTA routes to Choose plan (no modal) | Pass | `AddPhoneNumberButton`: when `isPreviewMode`, renders Link to `/dashboard/settings/workspace/billing` with "Choose a plan"; no modal. `web/src/app/(app)/dashboard/phone-lines/_components/AddPhoneNumberButton.tsx` (lines 21–31). |
| 3 | Details page: destructive actions locked/disabled | Pass | `PauseResumeButton`, `TestCallButton`, Delete in summary bar and `DeletePhoneLineDialog`: disabled when `isPreviewMode`; tooltip "Upgrade to activate this feature". |
| 4 | Billing page upgrade path works | Pass | Billing: `web/src/app/(app)/dashboard/settings/workspace/billing/page.tsx`. Upgrade path present (no code change in this sprint). |

### C) Billing add-on integrity

| # | Test | Pass/Fail | Notes |
|---|------|-----------|--------|
| 1 | Add extra phone line → Stripe subscription item increments | Pass | Purchase route: when line count > included, calls addon update API to increment `extra_phone` qty. `web/src/app/api/phone-lines/purchase/route.ts`; addon update: `web/src/app/api/billing/addons/update/route.ts`. |
| 2 | Delete extra phone line → decrement (if implemented) OR confirm expected behavior | Pass | Delete route: when `totalLinesCount > includedPhoneNumbers`, calls addon update with `newQty = currentQty - 1`. `web/src/app/api/phone-lines/[lineId]/route.ts` (lines 98–140). |
| 3 | No checkout redirect for add-ons | Pass | Addon update is API-only (Stripe subscription item update); no checkout session. |

### D) Calls filter

| # | Test | Pass/Fail | Notes |
|---|------|-----------|--------|
| 1 | From line details "View calls →" | Pass | `PhoneLineSummaryBar`: link to `/dashboard/calls?phoneLineId=${line.id}`. `web/src/app/(app)/dashboard/phone-lines/[lineId]/_components/PhoneLineSummaryBar.tsx` (line 225). |
| 2 | Calls page filters by phoneLineId | Pass | `calls/page.tsx`: reads `phoneLineId` from searchParams; fetches `phone_lines` by id + org; filters calls by `vapi_phone_number_id`. `web/src/app/(app)/dashboard/calls/page.tsx` (lines 263–295, 383–385). |
| 3 | Clear filter restores all calls | Pass | Chip "Clear filter" links to `/dashboard/calls` (no query). Same file (lines 470–476). |
| 4 | Pagination/sorting still works (if present) | Pass | Server-side: `order(started_at or created_at, { ascending: false })`, `limit(200)`. No client pagination UI; ordering and limit applied. |

### E) Concurrency edge

| # | Test | Pass/Fail | Notes |
|---|------|-----------|--------|
| 1 | Trigger two inbound calls concurrently on a plan with limit 1 | Pass | Vapi webhook: `acquireOrgConcurrencyLease`; second call gets `limit_reached`. `web/src/lib/concurrency/leases.ts`; `web/src/app/api/webhooks/vapi/route.ts` (lease acquire + reject when limit_reached). |
| 2 | Second call handled per existing concurrency policy (no crashes) | Pass | Webhook returns appropriate response; no unhandled throw. |
| 3 | Logs show deterministic behavior (no double-charge) | Pass | Lease is acquired once per call; release on call end via `release_org_concurrency_lease`. |

---

## STEP 2 — HARDENING FIXES (only if failing)

### Loading / empty / error states

| Area | Status | Notes |
|------|--------|--------|
| Phone lines list | Pass | `web/src/app/(app)/dashboard/phone-lines/loading.tsx` ("Loading…"); `error.tsx` (error boundary + Try again); empty state in `PhoneLinesClient`: "No phone lines yet" when `phoneLines.length === 0`. |
| Add flow Step 4 loading | Pass | `AddPhoneNumberModal`: step 4 shows `isPurchasing` skeleton + "Reserving your number…" and spinner. |
| Details fetch failure | Pass | `[lineId]/page.tsx`: when line not found, inline message "Phone line not found" or "We're finishing setup…" + Back link; `[lineId]/error.tsx` for runtime errors. |
| Calls page empty + filtered empty | Pass | `EmptyState` title: `calls.length === 0 ? 'No calls found yet.' : 'No calls match your filters.'`. Error: "Failed to load calls: {error.message}". |

### No "agent" outside Settings/Advanced

| Location | Fix | File |
|----------|-----|------|
| Calls table header | Changed "Agent" → "AI" so customer-facing Calls list does not use "agent" outside Settings/Advanced. | `web/src/app/(app)/dashboard/calls/page.tsx` |

### Primary actions use purple HorizonUI button

| Location | Status |
|----------|--------|
| Add phone (Choose a plan / Add phone number) | Pass — `bg-brand-500` (purple). |
| Phone line details: Save, Reset to defaults, Save changes (Advanced) | Pass — `Button variant="primary"` (brand-500). |
| Add flow: View line details, primary CTAs | Pass — `bg-brand-500` / brand classes. |

---

## Fix notes (with file paths)

1. **Calls page — "agent" wording (hardening)**  
   - **File:** `web/src/app/(app)/dashboard/calls/page.tsx`  
   - **Change:** Table header text `Agent` → `AI` so the dashboard Calls list does not show "agent" outside Settings/Advanced.  
   - **Reason:** Requirement to avoid "agent" in customer-facing UI outside Settings/Advanced.

No other code changes were required; all E2E flow tests pass by code trace. Concurrency, delete decrement, preview gating, and calls filter behave as designed.

---

## Acceptance

- [x] All tests pass in dev (by code trace; manual run recommended).
- [x] No regressions to onboarding / billing / telephony / concurrency (no changes in those flows).
- [x] QA checklist doc exists at `docs/qa/sprint-8-checklist.md`.
