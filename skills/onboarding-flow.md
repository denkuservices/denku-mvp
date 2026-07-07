# Skill: Onboarding flow

> The signup → verified → wizard → paid → activated → live pipeline, and the gating that protects
> it. The trickiest part is the DUAL step numbering and the fail-open rules.

## Step machine — the single most confusing thing in the codebase

`organization_settings.onboarding_step` (DB) vs the wizard's UI step index are **off by one**:

| DB step | Meaning | UI step |
|---|---|---|
| 0 | initial | — |
| 1 | Goal | 0 |
| 2 | Language | 1 |
| 3 | Phone intent | 2 |
| 4 | Plan (checkout) | 3 |
| 5 | Activating | 4 |
| 6 | **Live** | 5 |

- Dashboard access rule (middleware + `lib/auth/checkOnboarding.ts`): **DB step ≥ 6**. Plan being
  active is NOT sufficient — activation must complete.
- `onboarding/page.tsx` redirects to `/dashboard` only when `state.onboardingStep === 5`
  (that's the **UI** step = DB 6). This is the ONLY onboarding→dashboard redirect (one-way gate,
  prevents ping-pong).
- Steps only move FORWARD automatically (`if currentStep < 5` guards). Never write a lower step.

## Files

- `web/src/app/(app)/onboarding/page.tsx` — server entry: handles `?checkout=success&session_id=`
  fallback activation, redirects when live, fires the welcome email, renders the client.
- `web/src/app/(app)/onboarding/OnboardingClient.tsx` (1,283 lines) — the wizard UI (bone/teal
  brand theme, NOT Horizon).
- `web/src/app/(app)/onboarding/_actions.ts` (1,948 lines) — all server actions; key exports:
  `getOnboardingState`, `saveGoalAndLanguageAction`, `savePhonePreferences`, `advanceToPlanAction`,
  `startPlanCheckout`, `runActivation`, `checkPhoneStatus`, `completeOnboarding`,
  `continueWithoutPlan`, `bootstrapOrgAndProfile`.
- `web/src/app/(app)/onboarding/sendWelcomeOnOnboardingStart.ts` — welcome email idempotency.

## The full funnel

1. **Signup** (`(auth)/signup/signupAction.ts`): `supabase.auth.signUp` → create org (random UUID)
   in `orgs` AND `organizations_legacy` (dual-write; legacy needs `phone_number: ""` for NOT NULL)
   → upsert `profiles` (id = auth user id, role `owner`) → generate Supabase confirmation link via
   admin `generateLink` → send via Resend (`sendVerifyEmail`) — **Supabase's own email remains the
   source of truth; Resend failures never fail signup**. Always routes to `verify-email` next.
2. **Verify email** (`(auth)/verify-email/*`): OTP input, holding page, resend, and set-password
   variants; confirmation lands on `/auth/callback` (PKCE `code` or legacy `token_hash`), which
   routes: no org → `/onboarding`; plan inactive → `/onboarding`; else `/dashboard`.
3. **Wizard steps 1–3** save goal/language/phone-intent (`onboarding_language`, desired area code
   → `orgs.phone_desired_area_code`).
4. **Plan step**: `startPlanCheckout(planCode)` → Stripe Checkout (see
   `skills/billing-and-stripe.md`). Activation of the plan is dual-path (webhook + redirect
   fallback), both upsert `org_plan_overrides` and raise step to 5.
5. **Activation** (`runActivation`, idempotent/resumable):
   - requires `org_plan_limits.plan_code` present; blocked if workspace paused
   - reuses `organization_settings.vapi_assistant_id` / `vapi_phone_number_id` if present
     (resume-from-partial), else creates the "Main Line" Vapi assistant and provisions a number
     (area code w/ fallback 321) — details in `skills/vapi-integration.md`
   - persists artifacts onto `organization_settings` (`vapi_assistant_id`, `vapi_phone_number_id`,
     `main_agent_id`, `phone_number_e164`, `phone_number_sip_uri`) **immediately after each
     external call** so a crash mid-way can resume
   - `checkPhoneStatus` polls until the number has an E164, then step → 6 (Live).
6. **Welcome email**: sent when the user first lands on onboarding, exactly once per org —
   conditional UPDATE on `organization_settings.welcome_email_sent_at` (and
   `profiles.welcome_email_sent_at`); on send failure the timestamp is reverted and
   `welcome_email_last_error` recorded so it retries. From address `Denku <hello@denku.io>`.
   ⚠ It's a side effect of a GET page render — don't add more side effects there.

## Gating rules (middleware `web/src/middleware.ts`)

- Matcher covers ONLY `/admin/*`, `/api/admin/*`, `/dashboard/*`, `/onboarding/*`.
  `/login` is intentionally excluded (has an in-code guard anyway).
- `/onboarding`: session checked, but page handles its own redirects — middleware never bounces
  onboarding to dashboard.
- `/dashboard`: session → email confirmed → profile org → `onboarding_step >= 6`.
  - **Billing allowlist**: `/dashboard/settings/workspace/billing[/*]` passes even with no
    org/incomplete onboarding (so users can buy a plan).
  - **Fail-open**: settings fetch errors allow access (prevents lockout loops). Same policy in
    `getOnboardingComplete()` (used by the app layout to decide sidebar vs focused chrome).
- App chrome while onboarding incomplete: `AppShellWrapper` renders a sidebar-less "Back to setup"
  header (bone theme) instead of HorizonShell — the dashboard sidebar must never flash during setup.

## Known sharp edges

- `continueWithoutPlan` exists but preview mode still gates most features (see billing skill).
- Two org-creation paths: signup (random UUID) vs `ensureDefaultOrgForUser` (orgId = userId,
  used by bootstrap actions). Both must keep dual-writing `orgs` + `organizations_legacy` until
  the legacy table is retired.
- `handleCheckoutSuccess` on the page must stay idempotent — users refresh the success URL.
- Activation errors return raw strings to the wizard; UX debt.
- TEMP DEBUG `console.log("[WELCOME] …")` still in `onboarding/page.tsx`.
