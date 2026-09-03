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
| 3 | Product intent (calls / messages / free) | 2 |
| 4 | Plan (checkout) | 3 |
| 5 | Activating | 4 |
| 6 | **Live** | 5 |

- Dashboard access rule (middleware + `lib/auth/checkOnboarding.ts`): **DB step ≥ 6**. Plan being
  active is NOT sufficient — activation must complete.
- `onboarding/page.tsx` redirects to `/dashboard` only when `state.onboardingStep === 5`
  (that's the **UI** step = DB 6). This is the ONLY onboarding→dashboard redirect (one-way gate,
  prevents ping-pong).
- Steps only move FORWARD automatically (`if currentStep < 5` guards). Never write a lower step.
  `setOnboardingStepToPlan` enforces this in SQL (`.or("onboarding_step.is.null,onboarding_step.lt.4")`)
  because the phone question now saves from *inside* step 4 — an unconditional write would pull a
  workspace back to "choose a plan" after Stripe's webhook had moved it to 5. The NULL arm is not
  padding: the column is nullable with no default, and the function's own "ensure a settings row"
  insert leaves it NULL.
- **The back button is UI-only.** It walks `currentStep` (and, inside the voice branch, the
  sub-step) and never decrements the DB — `onboarding_step` is what the middleware reads to decide
  who may reach the dashboard, and a back button that lowered it could strand a customer outside
  their own workspace over a mistyped name.

## Step 2 and 3 — one product, one set of prices (rebuilt 2026-09-03, R-153/R-156)

Step 2 used to ask for a **US area code**, and step 3 was a single screen carrying three voice
plans, the chat tiers underneath as a footnote, and a "continue without plan" link. The three large
cards are voice plans, so "the plans" meant phone service to anyone reading the page — and a
customer who had clicked *"I don't need a phone line — I want chat"* on the previous screen (an
answer that was **not stored anywhere**) picked one and was rented a US number, monthly.

The order is now **what -> how much -> (voice only) which number**, and each answer is written
before the next question is asked:

| Screen | Asks | Writes |
|---|---|---|
| UI step 2 | Which product: `voice` / `chat` / `free` | `orgs.onboarding_product_intent` (+ `phone_provisioning_mode='none'` for chat/free) |
| UI step 3 - voice - plans | Which voice plan | client state |
| UI step 3 - voice - phone | New US number (area code) or BYON | `orgs.phone_provisioning_mode` (`new`/`byo`) + `phone_desired_area_code` |
| UI step 3 - chat | Which chat tier | checkout metadata |
| UI step 3 - free | Nothing | `continueWithoutPlan` -> step 6, intent `free` |

Rules that must not be softened:

- **A customer is never shown a price for a product they did not pick.** The branches do not see
  each other's cards; that is a stronger guarantee than any warning, and the warning-based version
  of this fix lasted half a day before being replaced.
- The voice branch calls `startPlanCheckout(plan, **null**)` **at the call site**.
  `startPlanCheckout` can sell a chat tier in the same session; passing null explicitly is what
  stops a stale `selectedChat` becoming a charge.
- The phone answer is saved **before** checkout opens. Stripe's webhook can land before the browser
  returns, and `runActivation` reads `phone_provisioning_mode` to decide whether to claim a number.
- Both checkout actions **re-stamp** `onboarding_product_intent` from what is actually being bought,
  so intent and plan can only disagree if the database is edited by hand.
- `runActivation` **refuses** to provision a line when the intent is `chat` or `free`, whatever
  `org_plan_limits` says, logging `[ONBOARDING][ACTIVATION][INTENT_MISMATCH]` at `error`.
- **NULL intent means "not asked", never a decline.** A workspace that reached the plan step before
  this column existed is shown the chooser again rather than guessed at, and activation falls back
  to its old plan-based behaviour. Collapsing NULL onto one of the three values would deny a paying
  voice customer the number they bought.
- The **free** card is preview mode, not a metered tier: `continueWithoutPlan` completes onboarding,
  creates the AI employee via `ensureNonVoiceEmployee` (no Vapi, no Stripe — the card that charges
  nothing is *unable* to charge anything) and lands on `/dashboard`. The employee matters later:
  buying a chat tier from Billing grants entitlement and creates no employee, so a workspace that
  arrived without one would pay for chat and still answer nobody.
- The screen says plainly that **nothing answers a customer until a plan is bought**. That is the
  part people otherwise discover from a missed message.

## Files

- `web/src/app/(app)/onboarding/page.tsx` — server entry: handles `?checkout=success&session_id=`
  fallback activation, redirects when live, fires the welcome email, renders the client.
- `web/src/app/(app)/onboarding/OnboardingClient.tsx` (1,283 lines) — the wizard UI (bone/teal
  brand theme, NOT Horizon).
- `web/src/app/(app)/onboarding/_actions.ts` (1,948 lines) — all server actions; key exports:
  `getOnboardingState`, `saveGoalAndLanguageAction`, `saveProductIntentAction`, `savePhonePreferences`,
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
3. **Wizard steps 1–3** save goal/language (`onboarding_language`) and then the **product intent**
   (`orgs.onboarding_product_intent`). The area code is no longer asked here — it moved into the
   voice branch of the plan step, after a voice plan has actually been chosen (see above).
   ⚠️ **`onboarding_language` was READ-ONLY until 2026-09-03** — this line described an intention,
   not the code. Three places read the column (the Vapi assistant's transcriber + voice, the
   `agents` row activation creates, and `resolveWorkspaceLineDefaults` when a BYO number is
   connected) and nothing ever wrote it, so every workspace fell through to `?? "en"` and a
   business in Türkiye got an AI that answered its callers in English. The Goal step (UI step 1)
   now asks the question, with options derived from `lib/language/registry.ts` and the answer
   normalized through `toLanguageCode` before it is stored. It is asked there, not on the phone
   step, because a chat-only customer skips the phone form (`I don't need a phone line`) and their
   employee is born from the same column.
4. **Plan step**: branches on the recorded intent (above). Voice → `startPlanCheckout(planCode, null)`;
   chat → `startChatCheckout(addonKey)`; free → `continueWithoutPlan`. Stripe Checkout (see
   `skills/billing-and-stripe.md`). Activation of the plan is dual-path (webhook + redirect
   fallback), both upsert `org_plan_overrides` and raise step to 5.
5. **Activation** (`runActivation`, idempotent/resumable):
   - requires *something* bought (`getPlanState().hasAnyPlan`) — a chat customer has no voice plan
     at all since `chat_only` was retired; blocked if workspace paused; refused outright at step ≥ 6
   - **no voice plan, or a `chat`/`free` intent** → creates the employee and nothing else, no Vapi
     assistant and no number (`[ONBOARDING][ACTIVATION][NO_VOICE_LINE]`)
   - **`byo` intent** → creates the employee and assistant and claims NO number; the customer points
     their carrier at us from the Live step or Channels → Phone numbers
     (`[ONBOARDING][ACTIVATION][BYO_NUMBER_PENDING]`)
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

- `continueWithoutPlan` is the **free preview** card on the plan step. Preview mode still gates
  paid features (see billing skill) — which is the point, and the screen says so.
- Two org-creation paths: signup (random UUID) vs `ensureDefaultOrgForUser` (orgId = userId,
  used by bootstrap actions). Both must keep dual-writing `orgs` + `organizations_legacy` until
  the legacy table is retired.
- `handleCheckoutSuccess` on the page must stay idempotent — users refresh the success URL.
- Activation errors return raw strings to the wizard; UX debt.
- TEMP DEBUG `console.log("[WELCOME] …")` still in `onboarding/page.tsx`.
