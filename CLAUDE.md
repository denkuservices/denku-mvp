# CLAUDE.md — Denku Engineering Memory

> Canonical project memory for AI-assisted engineering on Denku. Read this first, then
> `CURRENT_SPRINT.md` for what's being built right now, then the relevant `skills/*.md` deep-dive
> before touching any subsystem. These docs describe THIS repo as it actually is — including its
> warts. For findings/backlog see `docs/IMPLEMENTATION_ROADMAP.md`; for north-star intent see
> `docs/PROJECT_VISION.md`.

## What Denku is

Denku is a self-serve **AI voice employee SaaS**: a business buys a subscription, gets a provisioned
US phone number answered 24/7 by a Vapi voice assistant (GPT-4o), and every inbound call is
transcribed and deterministically converted into a **ticket** or **appointment request** plus a
**lead**. Dashboard: calls, tickets, appointments, analytics, usage, billing.

- Brand name is **"Denku"** — never "Denku AI" (old name, banned).
- Customer-facing UI must say **"AI"**, not "agent", everywhere except Settings → Agents/Advanced.
- Marketing one-liner lives in `web/src/config/site.ts` (`siteConfig`).

## Product philosophy (encoded in the code — preserve it)

1. **Never dead-end.** Every finished call MUST produce an artifact even if the LLM never calls a
   tool. `ensureTicketForCall` / `ensureAppointmentForCall` in the Vapi webhook are the guarantee.
   Never remove or weaken this path.
2. **Idempotency-first.** Upserts on natural keys (`vapi_call_id`, `org_id`), conditional-UPDATE
   email sends, resume-from-partial activation, lock tokens on invoice runs. New write paths must
   follow suit — assume every webhook/action can fire twice.
3. **Billing enforcement is real, not decorative.** Pausing a workspace PATCHes Vapi phone numbers
   to `assistantId: null` so inbound actually stops. Concurrency limits reject calls via DB leases.
   Don't add features that bypass `isWorkspacePaused` / `getEffectiveLimits`.
4. **Fail-open on gating, fail-closed on money.** Middleware/onboarding checks fail open (never
   trap a paying user out); billing writes fail closed (never guess).
5. **Compensation over transactions.** Multi-system flows (Stripe → Vapi → DB) roll back each step
   explicitly on failure (see phone-line purchase). There is no distributed transaction — keep the
   rollback blocks in sync when editing.

## Repo layout — what is real and what is dead

```
web/                  ← THE app (Next.js 16 App Router, React 19, TS, Tailwind v4). All work here.
web/src/app/(marketing)  public site   (auth) login/signup/verify   (app) onboarding + dashboard
web/src/app/api/      ~45 route handlers (admin, billing, phone-lines, tools, webhooks, vapi)
web/src/lib/          domain libs (billing, concurrency, vapi, org, tickets, analytics, email…)
supabase/migrations/  INCREMENTAL ONLY — base schema exists only in the live Supabase DB
src/  (repo root)     DEAD legacy MVP (old admin panel + tool routes). Never edit, never import.
docs/qa/              sprint QA checklists
skills/               engineering deep-dives (this knowledge system)
```

Build/run: `cd web && npm run dev` / `npm run build` (baseline ~72 static+dynamic pages passing).
Lint: `npm run lint`. **There are no tests and no CI** (only a billing-cron GitHub Action).

## Architecture in one paragraph

Next.js on Vercel. Supabase = Postgres + Auth. Server code accesses the DB almost exclusively via
the **service-role client** (`web/src/lib/supabase/admin.ts`) with **manual `org_id` scoping** —
RLS exists on a few tables but is NOT the enforcement layer. `web/src/middleware.ts` gates
`/dashboard` (session + email confirmed + `onboarding_step >= 6`), allowlists the billing page, and
Basic-Auths `/admin` + `/api/admin`. Stripe handles subscriptions/add-ons/overage; Vapi handles
assistants/numbers/calls and calls back to `/api/webhooks/vapi` (the 3,100-line heart of the
system) and to `/api/tools/*` (shared-secret header) during live calls. Resend sends email.

## Non-negotiable business rules

| Rule | Source of truth |
|---|---|
| Plans: starter $149/400min/conc 1/1 num · growth $399/1200/4/2 · scale $899/3600/10/5; overage 0.22/0.18/0.13 $/min | `billing_plan_catalog` table (seeded in `supabase/migrations/20250127…`) |
| Preview mode (no plan) = `org_plan_limits.plan_code IS NULL` → gate destructive/paid features, CTA to billing | `web/src/lib/billing/isPreviewMode.ts` |
| Dashboard access requires `organization_settings.onboarding_step >= 6` (plan alone is NOT enough) | middleware + `lib/auth/checkOnboarding.ts` |
| Onboarding DB steps: 0 init · 1 Goal · 2 Language · 3 Phone intent · 4 Plan · 5 Activating · 6 Live. **UI step = DB step − 1** (UI 5 = Live) — do not mix them | `skills/onboarding-flow.md` |
| Workspace pause: `workspace_status ∈ {active,paused}`, `paused_reason ∈ {manual,hard_cap,past_due}`. Pause overrides everything (webhooks ignored, leases denied, rebind blocked) | `lib/billing/limits.ts`, `lib/workspace/*` |
| Effective limits = plan base + active `billing_org_addons` (`extra_phone`, `extra_concurrency`) — always computed live, never cached | `lib/billing/limits.ts` |
| Concurrency: org-level leases, 15-min TTL, advisory-lock RPC; reject call on `limit_reached` | `lib/concurrency/leases.ts` |
| Overage: threshold $100 / hard cap $250 per org-month; hard cap ⇒ pause | `billing_overage_state` |
| Welcome email exactly once per org (conditional UPDATE on `welcome_email_sent_at`) | `onboarding/sendWelcomeOnOnboardingStart.ts` |
| US numbers only; provisioning fallback area code **321**; provider is always `"vapi"` | purchase + activation routes |

## Coding conventions actually used here

- **Every query on a tenant table MUST carry `.eq("org_id", orgId)`.** With the service-role client
  there is no safety net — a missed filter is a cross-tenant leak. Resolve orgId via
  `lib/org/getActiveOrgId.ts` or `lib/analytics/params.ts#resolveOrgId`.
- Use `@/lib/supabase/admin` (fail-fast, `server-only`) for new code — NOT the older duplicate
  `@/lib/supabaseAdmin` (still imported in ~10 files; migrate opportunistically, don't add usages).
- Server actions use `"use server"` files under the route's `_actions/`; route handlers return
  `{ ok: boolean, ... }` JSON with proper status codes; validate inputs with **zod** at API edges.
- Structured logging via `lib/observability/logEvent.ts` with bracket tags
  (`[VAPI][BINDING][UNBIND][FAILED]`, `[BILLING][CHECKOUT][CREATED]`…). Canonical call events:
  `[CALL_START]`, `[INTENT_DETECTED]`, `[TOOL_CALLED]`, `[TOOL_RESULT]`. **Never throw from
  logging** — wrap in try/catch like the existing code.
- Next.js 16 specifics: `params`/`searchParams` are **Promises — always `await`**; `cookies()` is
  async; pages that read org state export `dynamic = "force-dynamic"`.
- Errors from Supabase/Vapi/Stripe: log full detail server-side, return a safe message to the user
  (existing code sometimes leaks raw messages — don't copy that pattern).
- Phone numbers are normalized E.164-ish via local `normalizePhone` helpers (duplicated in several
  files); masked in logs via `maskPhoneForLogging` (first 4 + last 4).

## Landmines — read before you step

1. **`/api/webhooks/vapi` has NO authentication** (no signature/secret). Known P0 — R-001, in the
   current sprint. Anything you build on the webhook inherits this exposure.
2. **`/api/debug/basic-auth` and `/api/debug/headers` are public** and leak `ADMIN_USER` + env
   info (outside the middleware matcher). Do not add more debug routes; these must die.
3. **`/api/admin/*` requires HTTP Basic Auth via middleware** — it is for platform operators.
   Customer browser code must NEVER call it (the member-invite form does, and is therefore broken).
   Exception already carved out: `/api/admin/analytics/export` (session auth).
4. **Two org-creation paths disagree:** `signupAction` creates org with a random UUID;
   `lib/org/ensureDefaultOrg.ts` uses deterministic `orgId = userId`. Both dual-write `orgs` +
   `organizations_legacy` (half-finished migration; `organizations` is now a read-only VIEW).
5. **Hardcoded Vapi artifacts:** tool IDs `6c9b0279-…` (create_ticket) and `5373add8-…`
   (create_appointment) in `onboarding/_actions.ts`; marketing demo assistant fallback in
   `api/vapi/start/route.ts`. These are environment-coupled — breaking them breaks activation.
6. **Vapi API quirk:** never send top-level `tools` on assistant create (400). Create assistant,
   then GET + PATCH `model.toolIds` merge. Phone routing is controlled ONLY by the phone number's
   `assistantId` field. **Any PATCH that sends a `model` object without merging first WIPES
   `toolIds`** — `syncAgentToVapi` currently does exactly this (R-050), and the phone-line
   purchase path never attaches tools at all. Fix via one shared config-assembly helper.
7. **Internal HTTP self-calls:** purchase → `/api/billing/addons/update` (forwards cookies!),
   webhook → `/api/tools/create-ticket` (uses `DENKU_TOOL_SECRET`). Base URL comes from
   `NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → localhost (`lib/utils/url.ts`). Changing auth or URL
   logic breaks these silently. This already bit prod once: live Vapi assistants carry
   `serverUrl = http://localhost:3000/api/tools` from dev-machine activations (R-077).
8. **`lib/rateLimit.ts` is an in-memory Map** — a no-op on Vercel. Don't rely on it for anything
   security-relevant.
9. **Live DB has drifted past the repo migrations** (e.g., RPC `reconcile_call_cost`, the
   TABLE-returning `acquire_org_concurrency_lease`, and the **billing invoice-preview view/RPC**
   that computes usage→minutes→overage→total all exist only in prod). Never assume a migration file
   describes the current function signature — read the calling code. Note: the billing math being
   unversioned means what customers are charged can't be reviewed/tested from the repo (R-075).
10. **Supabase MCP in this workspace points at the WRONG project** ("BondAI"). Do not trust MCP
    `list_tables` for Denku; infer schema from code / `skills/database-schema.md`.

## Design system (per-surface, do not cross-contaminate)

- **Marketing + auth + onboarding + pre-onboarding chrome:** warm "luxury" theme — bone `#F7F5F1`,
  teal `#1B6E6E`, copper `#B8895A`, Fraunces display serif, scoped via `.brand-surface`
  (`web/src/app/globals.css`). Hex values are written inline (no tokens) — match that style.
- **Dashboard:** Horizon UI template — DM Sans/Poppins, `brand-500` blue, navy dark tokens,
  ApexCharts, `components/ui-horizon/*` + `components/horizon-shell/*`. Primary buttons =
  `bg-brand-500` purple/blue per Sprint-8 rule.
- **Landing redesign (approved, NOT built):** hybrid dark SaaS per `web/LANDING_REDESIGN_SPEC.md`.
  Keep the Spline robot (`SplineClient.tsx`, scene URL in env). Dark system must NOT leak into
  onboarding/auth/dashboard without explicit user approval.
- shadcn primitives (`components/ui/*`) exist with oklch tokens — a fourth system. Prefer reusing
  what the surface already uses over "unifying" ad hoc.

## Key documents

- `docs/PROJECT_VISION.md` — **the north star**: what Denku believes (mission, product/AI/CX/
  engineering philosophy, principles, non-negotiables, 3-year direction). Describes what Denku *is*,
  independent of how it's currently built; every other doc and decision serves it. Read when a
  choice needs grounding in first principles.
- `docs/PROJECT_CHARTER.md` — **operating principles**: how Denku decides, ships, and measures —
  scope, goals, KPI framework, prioritization, risk tolerance, MVP/production-ready definitions,
  decision ownership, documentation standards. Read when you need to know *how we work*, not *what
  we believe* (that's the vision).
- `docs/IMPLEMENTATION_ROADMAP.md` — **master findings tracker** (single source of truth for all
  audit findings, `R-###` IDs, priority/status). Update it whenever a finding is fixed or found.
- `docs/EXECUTION_PLAN.md` — **how to act on findings safely**: sorts them into implement-now /
  decide-first / external-dependency, with cross-category sequencing. Read before starting fix work.
- `docs/RETROSPECTIVE.md` — **confidence layer over the findings**: blind spots, assumptions, what
  needs human verification, limits of the static-analysis audit program. Read before trusting a
  finding as fact (the DB/Vapi/Stripe live state was never observed).
- `docs/AUDIT_PLAYBOOK.md` — **the official audit standard**: philosophy, workflow, roadmap rules,
  audit categories, finding template, quality checklist. Any audit work starts there.
- `docs/audits/` — audit narratives + condensed rules/index (`docs/audits/README.md`). Every new
  audit follows the playbook and updates the roadmap in the same change.
- `CURRENT_SPRINT.md` — **the active implementation sprint**: goal, prioritized tasks, validation
  checklist, definition of done. What to build right now. Update task status as you ship (the
  roadmap holds the full backlog; the sprint holds only what's in flight).
- `skills/vapi-integration.md` — assistants, numbers, webhook pipeline, tools, demo agent
- `skills/billing-and-stripe.md` — plans, checkout, add-ons, overage, pause, close-month
- `skills/onboarding-flow.md` — step machine, gating, activation, checkout dual-path
- `skills/auth-and-tenancy.md` — auth flows, middleware, org model, the two admin worlds
- `skills/database-schema.md` — inferred schema, RPCs, migration rules, drift notes
- `skills/dashboard-architecture.md` — Horizon shell, page inventory (real vs placeholder), data patterns
- `skills/design-system.md` — the four themes, tokens, fonts, per-surface rules
- `skills/deployment-and-environments.md` — Vercel, crons, env var inventory, external config
