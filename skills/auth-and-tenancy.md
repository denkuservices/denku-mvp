# Skill: Auth & tenancy

> How identity, sessions, org scoping, and the TWO separate "admin" worlds work. Most security
> mistakes in this codebase happen at the seams described here.

## Identity stack

- Supabase Auth, email+password, PKCE. Server client: `web/src/lib/supabase/server.ts`
  (`createSupabaseServerClient`, cookie handling tuned for localhost vs prod — `secure` flag
  follows `NODE_ENV`, `sameSite: lax`, cookie writes are try/catch'd because Server Components
  can't write cookies).
- Email confirmation is REQUIRED before dashboard (middleware checks `email_confirmed_at`).
- Custom verification email: signup uses `supabaseAdmin.auth.admin.generateLink({ type: "signup" })`
  and mails the token via Resend (`lib/email/sendVerifyEmail.ts`). Supabase's own email is the
  fallback source of truth; Resend is optional (`resend` client is null without `RESEND_API_KEY`,
  senders: default `Denku <onboarding@resend.dev>`, welcome `Denku <hello@denku.io>`).
- `/auth/callback/route.ts` handles both PKCE `code` exchange and legacy `token_hash` OTP; routes
  by org/plan state (no org or no plan → `/onboarding`).
- **There is NO forgot-password flow** (template exists in `lib/email/templates.ts`, no page).

## Tenancy model

- `orgs` is canonical (id, name, created_by, phone_desired_area_code, …).
  `organizations_legacy` is dual-written for FK integrity (`organization_settings.org_id`
  references it; `phone_number` NOT NULL → write `""`). `organizations` is a **read-only
  compatibility VIEW** over `orgs` — never write to it.
- `profiles`: `id` = auth user id (PK-ish), `auth_user_id` (unique where not null), `org_id`,
  `email` (unique on lower(email)), `full_name`, `phone`, `role` (`owner` | `admin`),
  welcome-email idempotency columns. RLS select/update-own policies exist on profiles keyed by
  `auth.uid() = auth_user_id`.
- One org per user in practice. Org resolution pattern (copy it exactly):

```ts
const { data: profiles } = await supabase.from("profiles")
  .select("org_id").eq("auth_user_id", user.id)
  .order("updated_at", { ascending: false }).limit(1);
```

  Helpers: `lib/org/getActiveOrgId.ts` (session-based) and `lib/analytics/params.ts#resolveOrgId`
  (used by dashboard pages).

## THE data-access rule

Server code uses the **service-role client** (`lib/supabase/admin.ts`) for almost everything,
bypassing RLS. Therefore:

> **Every read/write on a tenant table MUST include `.eq("org_id", orgId)` where orgId came from
> the authenticated session.** No exceptions. There is no DB-level backstop.

RLS exists only patchily (profiles, agents select, webhook_debug service-role,
billing_overage_state, billing_plan_catalog read). Do not assume a table has RLS; assume it
doesn't. If you add a table, key it by `org_id` and follow this rule.

Two admin clients exist: prefer `@/lib/supabase/admin` (fail-fast, `server-only`);
`@/lib/supabaseAdmin` is the older duplicate (~10 imports remain, incl. `middleware.ts`).

## The two "admin" worlds (do not mix them)

1. **Platform operator admin** — HTTP Basic Auth (`ADMIN_USER`/`ADMIN_PASS`), enforced by
   middleware on `/admin/*` and `/api/admin/*`. Helper: `lib/auth/basic.ts#requireBasicAuth`.
   Used for internal ops (`/api/internal/enforce-billing-*` also uses it in-route).
2. **Workspace roles** — `profiles.role` (`owner`/`admin`), checked in-route via session.

**Collision (P1 bug):** workspace features were built under `/api/admin/*`
(`/api/admin/members/invite` is called by `InviteMemberForm` from the browser) but middleware
demands Basic Auth there → customers get 401. `/api/admin/analytics/export` was already exempted
in middleware for exactly this reason (it uses session auth). New customer-facing endpoints must
NOT live under `/api/admin/` — use a session-authed namespace and check `profiles.role` in-route.

## Middleware behavior (`web/src/middleware.ts`)

- Matcher: `/admin/:path*`, `/api/admin/:path*`, `/dashboard/:path*`, `/onboarding/:path*` only.
  Everything else (marketing, auth pages, most APIs, **webhooks, tools, debug routes**) never
  passes through middleware — route-level auth is on its own.
- Dashboard chain: session → email confirmed → org lookup → `onboarding_step >= 6`
  (billing path allowlisted). Runs 2–3 DB queries per request (profiles via session client,
  settings via service role) — known perf debt.
- ~~Sets debug headers `x-auth-user` / `x-auth-confirmed` / `x-auth-email`~~ **removed 2026-07-08
  (R-003)** — the middleware no longer emits any `x-auth-*` PII headers. Don't reintroduce them.
- Fail-open on settings errors (documented anti-lockout policy).

## Route-level auth patterns (choose the right one)

| Pattern | Where | How |
|---|---|---|
| Session (user-facing API) | billing checkout, phone-lines, invites | `createSupabaseServerClient()` → `auth.getUser()` → resolve org → manual scoping |
| Shared secret | `/api/tools/*` | header `x-denku-secret === DENKU_TOOL_SECRET` |
| Stripe signature | `/api/webhooks/stripe` | `stripe.webhooks.constructEvent` + `STRIPE_WEBHOOK_SECRET` |
| Cron secret | `/api/billing/cron/close-month` | `Bearer ${CRON_SECRET}` or `x-cron-secret` |
| Basic Auth | `/admin`, `/api/admin`, `/api/internal/*` | middleware or `requireBasicAuth` |
| **NOTHING (bug)** | `/api/webhooks/vapi`, `/api/dev/test-welcome` (prod-404s but exists) | P0 fixes pending |

*(`/api/debug/*` deleted 2026-07-08 — R-002. It was gitignored/local-only, never deployed; the
files and the `.gitignore` rule that hid them are both gone. Do not recreate debug routes here.)*

## Known sharp edges

- Rate limiting (`lib/rateLimit.ts`) is an in-memory Map — stateless on serverless, treat as
  decorative.
- `signupAction` detects existing users by matching error strings + status 422 — brittle against
  Supabase message changes; kept because Supabase doesn't return a clean code.
- Session may exist before email confirmation — code deliberately does NOT trust it
  (`signupAction` always routes to verify-email).
- Middleware imports `supabaseAdmin` → middleware runs on Node runtime, not Edge. Don't "optimize"
  it to Edge without removing the service-role usage.
