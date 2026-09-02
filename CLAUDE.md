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

> **Platform direction (from 2026-07-23):** the north star is evolving from a Voice-AI product to a
> multi-channel **AI Employees platform** (Voice · Instagram · WhatsApp · Email · future) — a business
> hires an **AI Employee** and connects **channels** to it. This is a *direction*, not the current
> build: today only **Voice** is a real, shipping channel and **Instagram** is receive-only. The
> canonical reference is [docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md](docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md);
> the target nouns are **Employee / Channel / Conversation / Contact**.
>
> **Sprint 4.5 (Platform Foundation) shipped the model (code-complete 2026-07-24).** The shared
> layer is now BUILT and adopted behind a flag — see `skills/platform-architecture.md`:
> `employee_channels` (Employee=`agents`↔Channel), `contacts`/`contact_identities` (generalize
> `leads`), the enriched `conversations`/`messages` as the canonical interaction layer, and an
> `artifacts` view. **Voice and Instagram now write into `conversations`/`messages`** via pure
> channel adapters + the shared `ingestInboundMessage` pipeline (`web/src/lib/platform/*`) — gated by
> **`PLATFORM_MODEL_ENABLED`** (default OFF → byte-for-byte legacy; dual-write, no read cutover yet).
> All additive, RLS-locked, idempotent, never-throw. Voice keeps its existing intent + never-dead-end
> artifact creation untouched; Instagram stays receive-only. **Rules:** add a new channel as an
> adapter + connection table + registry line (never a bolt-on); keep changes additive/flagged; don't
> point reads at `conversations` yet (read cutover = R-085, later). Activation: `docs/SPRINT_4.5_MIGRATION.md`.
> Backfill/UI/convergence are filed as R-081..R-086. WhatsApp/Email are NOT built (out of scope).

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
(repo root had a DEAD legacy MVP `src/` — old admin panel + tool routes — DELETED in R-034, 2026-07-23. Don't recreate a top-level `src/`; all app code lives in `web/`.)
docs/qa/              sprint QA checklists
skills/               engineering deep-dives (this knowledge system)
```

Build/run: `cd web && npm run dev` / `npm run build` (baseline ~72 static+dynamic pages passing).
Lint: `npm run lint` (⚠ ~216 pre-existing errors — tracked debt, non-blocking in CI). Tests:
`npm run test` (vitest, `web/test/`, all Supabase mocked — no live DB). CI:
`.github/workflows/ci.yml` runs the suite on every push/PR (test blocking, lint non-blocking);
**Vercel is the build gate.** Seed suites = leases, webhook-artifact idempotency, org-scoping
(R-037). Plus a billing-cron GitHub Action.

## Architecture in one paragraph

Next.js on Vercel. Supabase = Postgres + Auth. Server code uses **two** clients, deliberately:
the **service-role client** (`web/src/lib/supabase/admin.ts`) with **manual `org_id` scoping** for
privileged/background writes, and the **cookie client** (`web/src/lib/supabase/server.ts`) for
request-scoped, user-authenticated reads. The split is ~50/50 (89 vs 86 importers) and the boundary
holds: all 8 cron/webhook/tools routes use service-role, **zero** use the cookie client.
**⚠️ RLS IS load-bearing — corrected 2026-07-30 (R-134).** An earlier version of this file said
"RLS exists on a few tables but is NOT the enforcement layer." That is **false and dangerous**:
RLS is enabled on **13 of 14** tenant tables with 1–4 policies each, scoped via `profiles → org_id`,
and ~60 files read through it. Do not disable a policy assuming it is decorative.
`web/src/middleware.ts` gates
`/dashboard` (session + email confirmed + `onboarding_step >= 6`), allowlists the billing page, and
Basic-Auths `/admin` + `/api/admin`. Stripe handles subscriptions/add-ons/overage; Vapi handles
assistants/numbers/calls and calls back to `/api/webhooks/vapi` (the 3,100-line heart of the
system) and to `/api/tools/*` (shared-secret header) during live calls. Resend sends email.

## Non-negotiable business rules

| Rule | Source of truth |
|---|---|
| Plans: starter $149/400min/conc 1 · growth $399/1200/4 · scale $899/3600/10 — **1 included number on every voice plan** (corrected 2026-08-31; the catalogue said 1/2/5 while the site said 1 everywhere, extras are the `extra_phone` add-on); overage 0.22/0.18/0.13 $/min | `billing_plan_catalog` table (seeded in `supabase/migrations/20250127…`) |
| **Voice and chat are two independent products** (corrected 2026-09-02). A workspace may hold either, both, or neither: voice = `org_plan_limits.plan_code` (`starter`/`growth`/`scale`, NULL = no voice), chat = a tier in `billing_org_addons`. The `chat_only` $0 voice plan is **retired** — a chat customer simply has no voice plan | `web/src/lib/billing/planState.ts` |
| Preview mode = **bought nothing at all** (not "no voice plan" — that was the old rule and it read a paying chat customer as unpaid) → gate destructive/paid features, CTA to billing | `web/src/lib/billing/isPreviewMode.ts` → `planState.ts` |
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
- Use `@/lib/supabase/admin` (fail-fast, `server-only`) — the **single** service-role client.
  (R-033, done 2026-07-23: the older duplicate `@/lib/supabaseAdmin` was migrated across all 10
  importers and deleted. Don't reintroduce a second admin client.)
- Server actions use `"use server"` files under the route's `_actions/`; route handlers return
  `{ ok: boolean, ... }` JSON with proper status codes; validate inputs with **zod** at API edges.
- Structured logging via `lib/observability/logEvent.ts` with bracket tags
  (`[VAPI][BINDING][UNBIND][FAILED]`, `[BILLING][CHECKOUT][CREATED]`…). Canonical call events:
  `[CALL_START]`, `[INTENT_DETECTED]`, `[TOOL_CALLED]`, `[TOOL_RESULT]`. **Never throw from
  logging** — wrap in try/catch like the existing code.
- Next.js 16 specifics: `params`/`searchParams` are **Promises — always `await`**; `cookies()` is
  async; pages that read org state export `dynamic = "force-dynamic"`.
- Security headers live in `next.config.ts` `headers()` (R-056). CSP is **report-only** for now, so
  a new external origin (script/style/img/connect) won't break yet — but add it to the CSP
  allowlist there before anyone flips CSP to enforcing. Violations log via `/api/csp-report`.
- Errors from Supabase/Vapi/Stripe: log full detail server-side, return a safe message to the user
  (existing code sometimes leaks raw messages — don't copy that pattern).
- Phone numbers are normalized E.164-ish via local `normalizePhone` helpers (duplicated in several
  files); masked in logs via `maskPhoneForLogging` (first 4 + last 4).

## Landmines — read before you step

1. **`/api/webhooks/vapi` auth is STAGED, not yet enforcing** (R-001, In Progress). As of
   2026-07-08 the POST handler checks the `x-vapi-secret` header against `VAPI_WEBHOOK_SECRET` via
   `lib/vapi/webhookAuth.ts`, but runs in observe-only `log` mode by default — it logs
   `[VAPI][WEBHOOK][AUTH][…]` and **still processes forged requests**. It only rejects (401) when
   `VAPI_WEBHOOK_AUTH_MODE=enforce`. Until an operator sets the secret in Vercel, verifies a real
   call logs `[…][OK]`, and flips to enforce, treat the webhook as **still unauthenticated** —
   don't assume it's protected. When enforcement lands, any new path that makes Vapi POST here
   (e.g. Task 6 repointing `serverUrl`) MUST also send the `x-vapi-secret` header.
2. ~~`/api/debug/basic-auth` and `/api/debug/headers`~~ **deleted 2026-07-08 (R-002).** They were
   gitignored/local-only (never deployed — prod 404'd), but leaked `ADMIN_USER` to any local
   requester; the files and the `.gitignore` rule that hid them are both gone. **Do not add debug
   routes under `/api/debug/*`** — there is no longer an ignore rule, so any such route would be
   committed and reviewable, but the rule stands: these must not exist.
3. **`/api/admin/*` requires HTTP Basic Auth via middleware** — it is for platform operators.
   Customer browser code must NEVER call it (the member-invite form does, and is therefore broken).
   Exception already carved out: `/api/admin/analytics/export` (session auth).
4. **Two org-creation paths disagree:** `signupAction` creates org with a random UUID;
   `lib/org/ensureDefaultOrg.ts` uses deterministic `orgId = userId`. **`organizations_legacy` is
   GONE — corrected 2026-07-30 (R-134).** It was `DROP`ped in production by migration
   `20260405185521`, and `organization_settings.org_id` has referenced `orgs(id)` since
   `20260405185454`. The "dual-write / half-finished migration" note here was stale: the DB side
   finished, only the code lagged. `organizations` remains a read-only VIEW over `orgs`.
   Three code paths broken by that lag were fixed in R-134 (`ensureDefaultOrg` hard-failed;
   onboarding showed an empty workspace name; `getAvgResponseTime` was dead). **~24
   `organizations_legacy` "ensure FK parent" blocks still remain** in `onboarding/_actions.ts` and
   `signupAction.ts` — they discard their errors, so they are harmless no-ops that only waste a
   round-trip. Do not add new ones; delete them when you touch that code.
5. **Hardcoded Vapi artifacts:** tool IDs `6c9b0279-…` (create_ticket) and `5373add8-…`
   (create_appointment) are now centralized as `DENKU_TOOL_IDS` in `lib/vapi/assistantConfig.ts`
   (was duplicated in `onboarding/_actions.ts`); marketing demo assistant fallback in
   `api/vapi/start/route.ts`. These are environment-coupled — breaking them breaks activation.
6. **Vapi API quirk:** never send top-level `tools` on assistant create (400). **Always attach
   tools + webhook `server.url` via the shared `ensureAssistantConfig` helper**
   (`lib/vapi/assistantConfig.ts`) — it does GET→merge→PATCH keeping `model.toolIds` merged (never
   replaced). All three paths (onboarding `runActivation`, phone-line purchase, Settings
   `syncAgentToVapi`) go through it as of 2026-07-08 (R-050/R-077 fixed). Do NOT hand-roll a
   `model` PATCH — that's the strip bug. Phone routing is still controlled ONLY by the phone
   number's `assistantId` field. Existing pre-fix assistants: reconcile via `POST
   /api/internal/reconcile-vapi-assistants`.
7. **Internal HTTP self-calls:** purchase → `/api/billing/addons/update` (forwards cookies!),
   webhook → `/api/tools/create-ticket` (uses `DENKU_TOOL_SECRET`). Base URL comes from
   `NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → localhost (`lib/utils/url.ts`). Changing auth or URL
   logic breaks these silently. This already bit prod once: live Vapi assistants carried
   `serverUrl = http://localhost:3000/api/tools` from dev-machine activations (R-077, **fixed
   2026-07-08** — the assistant `server.url` now comes from explicit `VAPI_WEBHOOK_BASE_URL` via
   `assistantConfig.ts`, which refuses localhost/`VERCEL_URL`; existing assistants need the
   reconcile endpoint run).
8. **`lib/rateLimit.ts` is an in-memory Map** — a no-op on Vercel. Don't rely on it for anything
   security-relevant.
9. **Live DB has drifted past the repo migrations** (e.g., RPC `reconcile_call_cost`, the
   TABLE-returning `acquire_org_concurrency_lease`). Never assume a migration file describes the
   current function signature — read the calling code (or the live DB, see #10). **The billing math
   is now baselined (R-075, 2026-07-23):** the 8-view chain (`org_daily_usage` →
   `org_monthly_invoice_preview`) is captured in `supabase/migrations/20260723100000_baseline_billing_usage_views.sql`
   with a golden-master TS mirror `lib/billing/usageMath.ts`. Key rule: `billable_minutes =
   Σ ceil(duration_seconds/60)` **per call** (rounds up each call). Full base-schema baseline is still
   R-031.
   **Migration history reconciled 2026-07-30 (R-134); repo and prod are SYNCHRONIZED.**
   Read [docs/MIGRATION_DEPENDENCY_GRAPH.md](docs/MIGRATION_DEPENDENCY_GRAPH.md) before touching
   `supabase/migrations/`. Current state, **re-verified against live prod 2026-08-25**:
   **44/44 migrations applied, zero one-sided rows.** 4 migrations that had been applied straight
   to prod during a 5-month commit gap are recovered into the repo, and the 9 previously-PARTIAL
   migrations were **completed** (28/28 missing objects now exist). `20250126000000` remains
   **destructive if re-run** (its `ALTER TABLE … RENAME` would rename the live `organizations`
   VIEW away) so its `relkind='r'` guard must never be removed.
   ✅ **Corrected 2026-08-25: the `workspace_status` / `paused_reason` enums ARE now enforced by
   the database.** `check_workspace_status`, `check_paused_reason` and `check_billing_status` were
   applied on 2026-07-30. An earlier version of this file said they "were never applied" and that
   application code was the only guard — that is no longer true, and writing a value outside the
   enum will now fail at the DB, not pass silently.
10. **Supabase MCP: two projects are reachable — target Denku EXPLICITLY by id.** `list_projects`
    returns Denku prod `kebqwsdguxxjsijahrox` (`ACTIVE_HEALTHY`) **and** the unrelated `BondAI`
    (`ukosngcmvejbhfimggrn`). The old "points at the wrong project" warning meant BondAI is the
    default — always pass `project_id: "kebqwsdguxxjsijahrox"` for Denku. Access is **read-only by
    policy** (inspection/verification only — never modify prod data or schema via MCP; write migration
    FILES for an operator to apply). Confirmed 2026-07-23: it reaches Denku prod (used for R-075/R-060).
    **The policy stands. One documented exception exists:** on 2026-08-31 the user explicitly
    instructed applying the R-140 backfill (`20260829125306_backfill_agent_phone_number_link`) via
    MCP, so prod records it under that version and the repo filename was renamed to match. Treat
    that as a one-off authorization, not a precedent — still default to writing migration files and
    asking, and always align the repo filename to the version prod actually recorded.
    **Superseded 2026-09-01:** the owner granted standing permission to apply migrations directly
    ("bundan sonra kendin de migration yapabilirsin"), given the product is pre-revenue and in
    active development. Writes are now allowed without asking each time — but the care that made
    them safe is not optional: additive DDL only, idempotent (`if not exists`), a ROLLBACK comment,
    a migration FILE committed to the repo as the source of truth, and the repo filename aligned to
    the version prod records. Anything destructive (DROP, a column type change, a data backfill that
    cannot be re-run) still gets asked about first. Revisit this grant the day there are paying
    customers on the box. **Note:** a migration applied through the Supabase SQL Editor does NOT
    write `supabase_migrations.schema_migrations` — insert the version row by hand, or repo and prod
    drift apart silently (happened on 2026-09-01 with the Web Chat migration).
11. **Instagram webhook (`/api/webhooks/instagram`, Sprint 1.5) is RECEIVE-ONLY** and its signature
    check needs the **raw body** — always `await req.text()` and verify `X-Hub-Signature-256`
    *before* `JSON.parse`. Unlike the Vapi webhook, Meta always signs, so it enforces from day one.
    Instagram creds are **per-tenant, encrypted** (`instagram_connections`, service-role only; token
    via `lib/crypto/secretBox.ts`) — never a global account. Don't add reply/AI logic here (future
    epics). Meta's **deauthorize** + **data-deletion** callbacks (`/api/instagram/deauthorize`,
    `/api/instagram/data-deletion`) use a `signed_request` (`lib/instagram/signedRequest.ts`) —
    a *different* mechanism from the webhook's `X-Hub-Signature-256`. See
    `skills/instagram-integration.md`. **Sprint 1.5 CLOSED 2026-07-22** — code-complete AND the
    receive pipeline is **operationally verified in production** via Meta's signed **Test** webhook
    (delivery → signature verify → persist → 200, observed in DB + Vercel logs). Facts to carry
    forward: (a) **AUTHORITATIVE Meta rule** — while the app is **unpublished (Dev Mode)** Meta
    delivers **only dashboard Test events**; NO real production data (incl. from Admins/Developers/
    **Testers**) is delivered until the app is **published (Live)**. Real Instagram DM webhooks
    therefore require **Business Verification + App Review (Advanced Access for
    `instagram_business_manage_messages`) + Live Mode** — an external Meta dependency, NOT a Denku
    defect. (An earlier note here wrongly claimed Dev-Mode Tester delivery — that was the older
    Facebook-Login flow; corrected.) The receive-only foundation is also NOT a strong App Review
    submission for the messaging permission yet (no messaging UI) — dossier + verdict in
    `docs/META_APP_REVIEW_PACKAGE.md`. (b) Open Instagram debt: **R-078** (a TEMP dashboard subscribe
    button in `InstagramConnectionCard`, remove after verification) and **R-079** (OAuth stores
    requested not granted scopes).

12. **Telegram is per-tenant and its webhook has NO body signature.** Each customer connects
    their OWN BotFather bot (`telegram_connections`, token AES-encrypted, service-role only).
    Telegram signs nothing — it only echoes the `secret_token` we registered via `setWebhook`, in
    the `X-Telegram-Bot-Api-Secret-Token` header. **That echo IS the authentication**, so it must
    be random per connection, compared in constant time, and must NEVER be put in a URL. The
    connection id in the path is addressing, not a credential (a Telegram update says nothing
    about which bot received it). It enforces from the first request — no observe-only mode. After
    auth passes the route ALWAYS answers 200, because Telegram retries non-2xx and a retry means
    the customer is answered twice. **Not gated by `PLATFORM_MODEL_ENABLED`** — that flag protects
    voice's legacy dual-write; Telegram has no legacy store. Telegram is the first channel Denku
    *replies* on: the reply engine (`lib/platform/reply/*`) is channel-agnostic and its prompt
    forbids claiming a booking without the matching tool call. See `skills/telegram-integration.md`.

13. **Email is a FORWARDING channel** (built 2026-08-28, `adopted: true`,
    **`productionReady: true` since 2026-09-03** — flipped on the evidence the bar asked for: a
    real Gmail → Hotmail → forwarding → Denku round trip verified in the DB, AI drafting, human
    approving. ⚠️ **The flag does not remove the sending limit**: nothing goes out from an
    unverified domain and there is NO fallback to a Denku address, so a workspace cannot send as
    itself until its owner publishes DNS. Receiving/reading/drafting work the day they forward;
    automatic sending waits on their DNS — anything that SELLS this channel must say so, which is
    why `lib/denku-agent/corpus.ts` carries an `email-sending-limit` chunk). The customer forwards a published address
    (`info@`) to one Denku issues (`<slug>-<rand>@EMAIL_INBOUND_DOMAIN`); we never hold their
    mailbox password and never see anything they do not forward. **Do not "upgrade" this to
    Gmail OAuth casually** — every Gmail *read* scope (`gmail.readonly`/`modify`/`compose`/
    `metadata`) is Google-**restricted**: CASA Tier 2 + annual re-certification, i.e. the
    Instagram App Review trap again. (`gmail.send` alone is only *sensitive* — no CASA — so
    send-side OAuth stays a legitimate future option.) Four things to know before touching it:
    (a) **forwarding yields no history and no read-state sync** — only mail arriving after the
    rule is switched on, so never promise "your unread mail appears here"; (b) **threading keys
    on the `References` root, never the subject** — and the sender is read from the `From:`
    header because Gmail rewrites the envelope `Return-Path` when forwarding; (c) **a self-feeding
    loop is a real risk** — `notifyNewArtifactsForConversation` emails the owner on every
    artifact, so if their notification address is the forwarded mailbox it arrives as a new
    "customer", which is why `isAutomatedEmail`/`isSelfAddressed` refuse auto-replies, `List-*`,
    `no-reply@` and our own addresses *before* anything is stored; (d) **nothing is sent from an
    unverified domain, and there is no fallback to a Denku address** — `lib/email/senders.ts`
    (fixed `auth|notify|welcome` union, `denku.io` defaults) must never be reused for channel
    sending, and `addressBelongsToDomain` is a security boundary, not formatting. Also:
    `reply_mode` defaults to `'draft'` (the AI writes, a person sends); drafts live in
    `conversation_drafts`, **never in `messages`**, because the Inbox must not show a message the
    customer never received; approving a draft must NOT flip handling to `"human"`, or every
    approval silently costs the business its automation. See `skills/email-integration.md`.

14. **Web Chat runs in a stranger's browser, so the site key is an ADDRESS, not a password.**
    Built 2026-09-01, **`productionReady: true` since 2026-09-03** — proven the way every other
    channel had to be: the owner embedded the snippet on **minosandco.com**, opened the widget as a
    visitor, and the AI answered. That proof covers the two things that matter here — the origin
    allowlist admitted a genuine third-party domain, and the reply engine drove a conversation over
    the store-and-fetch transport. It also proved the **entitlement gate from both sides**: with a
    chat plan the AI replied; without one the widget still opened and displayed the thread but
    produced no reply, which is the intended shape (never show a visitor a broken widget because
    the business has not paid). Web chat is now sold as a chat channel like Telegram and email.
    The customer pastes a public key into their page source;
    access control is their **origin allowlist**, and it can only be enforced where the browser
    tells the truth — the `Referer` on the iframe document request at `/embed/chat`. The widget's
    own `fetch` calls are same-origin (`Origin: https://denku.io`), so checking the allowlist there
    would refuse every legitimate request. The embed route therefore checks `Referer` once and mints
    an HMAC-signed **frame token**, exchanged at `/api/webchat/session` for a **session token** that
    names the org; no request body is ever believed about identity. Four rules: (a) **empty
    `allowed_origins` refuses everywhere** — fail closed, and the install UI asks for the domain in
    the same breath as the snippet; (b) `/embed/*` is **excluded** from the app-wide
    `X-Frame-Options`/CSP in `next.config.ts` and sets its own per-connection `frame-ancestors` —
    two CSP headers would be intersected by the browser and silently block the widget; (c) a
    non-browser client can forge `Referer` and reach the API, which is irreducible, so the volume
    caps in `lib/webchat/sessions.ts` (DB-counted, because `lib/rateLimit.ts` is a no-op) and the
    reply engine's spend guard are the real ceiling; (d) the transport **sends nothing** — the row
    in `messages` IS the delivery, and the visitor's browser fetches it, which is why human takeover
    from the Inbox works here with no channel-specific code. See `skills/webchat-integration.md`.

15. **Supabase Auth owns the auth emails a real customer sees.** `signInWithOtp` and
    `resetPasswordForEmail` hand the send to Supabase, which renders from templates stored in
    ITS dashboard — editing `lib/email/templates.ts` changes only the (little-used) Resend path,
    so a "fixed" auth email can still arrive looking like nothing else we send. Brand-matching
    HTML is generated into `docs/email/supabase-auth/` and must be pasted in by an operator.
    Everything else Denku sends renders through ONE chrome (`lib/email/layout.ts`): dark
    masthead + vortex mark, copper hairline, bone ground, serif headings, one button, one
    footer, and an honest "why you're receiving this" line. Two rules when touching mail:
    (a) **every new email registers in `lib/email/previewSamples.ts`** — that inventory is what
    `/api/dev/email-preview`, the preview script and the design tests all iterate, so an
    unregistered template is one nobody ever looks at; (b) **anything triggered by a webhook,
    cron or resumable action sends through `sendOnce()`** (`lib/email/dispatch.ts`), which claims
    a `(kind, dedupe_key)` row in `email_dispatch_log` — Stripe redelivers, activation resumes
    from partial, and a duplicate receipt cannot be recalled. Money mail is staged behind
    `BILLING_NOTIFICATIONS_ENABLED`; onboarding and security mail deliberately is not. See
    `skills/transactional-email.md`.

16. **Authorization is a capability matrix, and it did not used to exist.** Corrected 2026-09-01
    after a Settings audit. Until then `/api/billing/plan/change`, `/api/billing/addons/update`,
    the Stripe portal + checkout routes and `/api/phone-lines/purchase` checked only that
    *someone* was signed in — a `viewer` could move a workspace onto the $899 plan or buy add-ons
    — and an `admin` could invite a second `owner`, which made the two roles the same role. Both
    are closed. **The rule now: any route that spends money, changes membership, touches a channel
    or reads the audit trail begins with `guard(<capability>)` from `lib/auth/permissions.ts`.**
    Do not hand-roll `role === "admin"` string checks; add a row to the matrix. Four things that
    are deliberate and must not be "simplified": the role is read with the **service-role** client
    (authorization must not depend on an RLS policy staying permissive); an unrecognised role
    string is **not** a role (fail closed); `profiles` is resolved by `id` **then** `auth_user_id`
    (this repo carries both, and the old routes disagreed about which); and only an `owner` may
    grant or take `owner`. A workspace must never lose its last owner — `assertNotLastOwner`
    guards every path that writes `profiles.role`/`org_id`, and ownership moves through the atomic
    `transfer_org_ownership` SECURITY DEFINER function, never two UPDATEs. The audit log is now
    capability-gated, paged/filtered in Postgres, CSV-exportable (the export is itself audited),
    and — for the first time — **actually written to** by billing and membership changes; it had
    advertised that coverage while nothing wrote a row. Password changes require the current
    password (verified on a throwaway client with `persistSession: false`, never the request's own
    client, which would rotate the session mid-request); sessions are individually revocable and
    TOTP two-step exists, both per-ACCOUNT, not org-enforced. See
    `skills/workspace-roles-and-members.md`.

17. **Business hours are a FACT the AI knows, never a gate.** Built 2026-09-01; scoped by the
    owner the same day: **every Denku product answers 24/7, on every channel, at every hour.**
    Opening hours describe when STAFF are in. A business paying for an AI employee is buying the
    eleven-at-night call its competitors miss, so **never add a behaviour that stops, refuses or
    shortens** — a `say_closed` option ("state the hours and end the call") existed for a few hours
    and was removed before anyone could set it, because it contradicted the product it belonged to.
    `after_hours_behavior` has exactly two values, both of which answer: `note_hours` (say the
    business is closed, then carry on and help fully, honest that a person follows up later) and
    `answer_normally` (do not raise it). The evaluator lives in `lib/business-hours/schema.ts`
    (pure, 30 tests). Four rules: **(a) no hours configured means OPEN** — and so does an
    unparseable document, an unknown timezone, or a failed read; nothing about a settings column
    should make a customer worse off. (b) A dated exception beats the weekly pattern. (c)
    `close <= open` means the shift runs past midnight (`22:00–02:00` is a bar, not a typo) and
    spills into the next day. (d) Wall-clock via `Intl`, **never a stored UTC offset** — an offset
    is an hour wrong for half the year. Chat channels evaluate per message; voice gets the schedule
    plus a standing honesty rule (a Vapi prompt is written once per assistant and cannot be told
    "it is 11pm now") and logs `[CALL][AFTER_HOURS]` — which costs nothing precisely *because*
    hours gate nothing. The Settings copy says "answers 24/7" in three places; keep it there.
    See `skills/business-hours.md`.

18. **Perception writes into `messages.content`, and that is on purpose.** Built 2026-09-01: every
    chat channel (Telegram, Instagram, Email, Web Chat) now reads photos and hears voice notes via
    ONE shared stage inside `ingestInboundMessage` — `lib/platform/media/*` + `lib/llm/multimodal.ts`.
    Five things to know before touching it: (a) **the description and the transcript go into the
    message BODY**, prefixed `[image]` / `[voice message]`, because the Inbox, `loadHistory`,
    `classifyIntent` and recall all already read `content` — a side table would mean teaching each
    of them and the one forgotten would answer a customer as if they sent nothing; `meta.media[]`
    carries the structured record beside it. (b) **Adapters never fetch.** They emit a `ref`
    (`file_id`, CDN url, Resend attachment id, storage key) and the WEBHOOK injects a
    `resolveMedia` closure holding the credential — same shape as `classifyIntent`. A Telegram
    download URL contains the bot token and must never be logged. (c) **Callers must answer
    `ingested.content`, not the raw normalized content**, or a photo with no caption is answered as
    an empty message. (d) **A file we could not read must never read as one we could** — the
    rendition says so and the prompt forbids guessing; and the prompt only claims a sense the
    registry says the channel has (`imageUnderstanding` / `audioUnderstanding`, which are a
    DIFFERENT claim from `attachments`). (e) **Idempotency is checked before the spend**: a
    redelivered webhook short-circuits on the stored message instead of paying for the vision call
    twice. Originals live in the private `channel-media` bucket (migration
    `20260901110952`, no RLS policies by design — service-role writes, signed reads) because every
    provider URL expires. Web Chat is the one channel with a visitor upload endpoint; its limits in
    `lib/webchat/uploads.ts` are what stand in for identity. See `skills/media-perception.md`.

19. **An e-commerce backend is NOT a channel — and the first one is IdeaSoft.** Built 2026-09-02
    (`adopted: true`, `productionReady: false` — migration `20260902205405` applied to prod, but
    **no real store has ever been connected**, so every behaviour below is documentation-derived,
    not observed). A channel is where a customer *talks*;
    IdeaSoft is the business's *system of record*. The customer messaging on Telegram has an order
    that lives in IdeaSoft — channel Telegram, source IdeaSoft. Adding `"ideasoft"` to
    `lib/platform/channels.ts` would make every surface that iterates channels (Channels page,
    Inbox filters, onboarding, usage metering, `test/channel-contract.test.ts`) render a "channel"
    nobody can message. It is a new noun — **Integration** — with a provider registry
    (`lib/commerce/`) so the tool layer never learns a provider's name. Five facts drive the whole
    design and each has a failure attached: (a) the **refresh token is single-use** — two
    concurrent refreshes kill the connection, so refresh is claimed with a conditional UPDATE like
    `sendOnce()`; (b) it **expires after 2 months of silence**, so a proactive refresh cron is not
    an optimisation but the thing that stops the owner re-authorizing by hand; (c) **webhooks carry
    only changed fields** — they are a trigger, re-fetch by `id`, and enough failed deliveries make
    IdeaSoft **delete the subscription**, which is why a reconcile cron is mandatory; (d) the
    webhook HMAC is keyed with our app's `client_secret`, so it proves IdeaSoft sent it but **not
    which store** — the connection id goes in the URL path exactly as Telegram does it, addressing
    not credential; (e) there is **no published rate limit**. And the one that is not an API fact:
    an anonymous visitor must never read a stranger's order, so **`lookup_order` was deliberately
    not built** — the shipped tools (`find_product`, `search_catalog`) read only the catalogue,
    which the store already publishes on its own website. Do not add an order tool without the
    identity rules in §7 of the skill. Two other things worth knowing: the tools appear ONLY for a
    workspace with a `connected` store (`toolDefinitionsFor`), so every other workspace gets the
    array that used to be a constant; and **voice will not answer product questions until a
    `find_product` tool is created in Vapi and its id added to `DENKU_TOOL_IDS`** — the route
    exists, the registration does not. **Any IdeaSoft or commerce-API work starts at
    `skills/commerce-integrations.md`.**

20. **The assistant on denku.io is Denku running as its own customer — and nothing it claims is
    typed by hand.** Built 2026-09-03. The landing page's call button and the chat widget both
    reach it. It exists because the old one (`155b21ad…`, still the pilot phone line) carried a
    hand-typed prompt that had gone stale invisibly: it told callers **"English and Spanish"**
    while four languages shipped, and had never heard of Telegram, Email, Web Chat, BYON, the
    commerce integration, or three of the four things Denku sells. **The rule: availability is
    DERIVED** from `CHANNELS[...].productionReady` + `LANGUAGES` + the billing catalogue
    (`lib/denku-agent/facts.ts`), so a channel flipping to production-ready starts being offered in
    the same commit. The registry's three-way split — sellable / connectable-but-silent / not built
    — is rendered as three separate clauses, because collapsing it is how a demo becomes a refund.
    Five rules: (a) **`skills/*.md` must NEVER reach this assistant** — landmines and unfixed bugs
    read back to a prospect; anything sellable is restated in `corpus.ts` in customer words; (b) no
    SOC 2 / HIPAA / ISO claim, ever — Denku holds none; (c) **`search_denku_knowledge` is NOT in
    `DENKU_TOOL_IDS`** and a test pins that list's length, because `ensureAssistantConfig` merges
    it into every assistant and would hand a plumber's AI Denku's price list; (d) `isDenkuSelfOrg`
    is an IDENTITY (the one workspace that IS Denku) while **`orgs.is_internal` is an ENTITLEMENT**
    (workspaces Denku operates — grants **chat capacity only**, never voice minutes, concurrency,
    overage caps or pause, so revenue figures stay a record of what was actually charged); (e) the
    voice tool route answers **without** an org, unlike every other tool route, because its caller
    is an anonymous visitor before any `calls` row exists — it still refuses an org that resolves
    to someone else. Vapi artifacts and prod rows are created by scripts, never by hand:
    `scripts/register-denku-agent.mts` (re-run after any channel/price/corpus change — the prompt
    is a snapshot) and `scripts/provision-denku-workspace.mts`. ⚠️ **`VAPI_AGENT_ID` is dead** and
    no longer read; it is still set in Vercel to the old assistant, which is exactly why the new
    variable has a different name. ⚠️ **Denku's own Inbox is unreadable** — the workspace has no
    `profiles` row on purpose (there is no workspace switcher in the UI, so adding one MOVES that
    person there permanently). See `skills/denku-own-agent.md`.

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
- **Inbox (`/dashboard/inbox`) is a messaging surface with its own palette** (Inbox v2,
  2026-08-26): WhatsApp's values — `#F3F2EE` thread ground, white incoming / `#E6F5EC` outgoing
  bubbles, `#25D366` accents, WhatsApp-dark in dark mode. Side + colour are how a reader tells the
  two voices apart, which `brand-500` cannot do. It is confined to
  `dashboard/inbox/_components/theme.ts` — **do not import it elsewhere, and do not "unify" the
  Inbox back into Horizon.** See [docs/INBOX_V2.md](docs/INBOX_V2.md).

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
- `docs/INBOX_V2.md` — the Inbox split view: why the list lives in the layout, the two new state
  tables (`conversation_stars` / `conversation_reads`, inert until migrated), and why the composer
  is deliberately disabled
- `skills/workspace-roles-and-members.md` — **who may do what**: the capability matrix, the member lifecycle and ownership transfer, the audit log, and account security (re-auth, sessions, TOTP)
- `skills/business-hours.md` — when the business is open, what the AI does when it is not, and exactly how far that reaches (chat yes, voice not yet)
- `skills/platform-architecture.md` — the AI-Employees platform model (Employee/Channel/Conversation/Contact/Artifact), the shared ingest pipeline + channel adapters, dual-write flag, how to add a channel (Sprint 4.5)
- `skills/denku-own-agent.md` — **the assistant that sells Denku**: why its knowledge is derived from the registries rather than typed, the three layers (890-token prompt + 22-chunk corpus + model-picks-the-topic retrieval), and the rules that stop it over-promising
- `skills/vapi-integration.md` — assistants, numbers, webhook pipeline, tools, demo agent
- `skills/instagram-integration.md` — Instagram channel foundation (OAuth, per-tenant creds, receive-only webhook)
- `skills/telegram-integration.md` — the Telegram channel AND the channel-agnostic **reply engine** (`lib/platform/reply/*`, `lib/platform/transports/*`) — the first channel Denku answers on itself
- `skills/webchat-integration.md` — the Web Chat channel: why the site key is public, where the origin allowlist can honestly be enforced, and the transport that delivers by storing
- `skills/media-perception.md` — how the AI sees and hears on every chat channel: the shared perception stage, why the description lives in `messages.content`, the resolver-per-channel split, and the limits that make an anonymous upload endpoint defensible
- `skills/email-integration.md` — the Email channel: why forwarding beats Gmail OAuth (CASA), RFC threading, quote stripping, the loop guard, and what is deliberately not built yet
- `skills/commerce-integrations.md` — **IdeaSoft and any future e-commerce backend** (İkas, Ticimax, Shopify): why an integration is not a channel, the OAuth/token traps, the catalogue tools, and the identity rule that stops a stranger reading someone else's order. Built 2026-09-02, **never run against a real store.** Read this before writing a line of IdeaSoft API code.
- `skills/transactional-email.md` — **what Denku sends to a customer's inbox**: the 19-email estate + the 5 Supabase-Auth ones, the shared `renderEmail()` chrome, the send-once claim ledger, and the rules for adding an email
- `skills/billing-and-stripe.md` — plans, checkout, add-ons, overage, pause, close-month
- `skills/onboarding-flow.md` — step machine, gating, activation, checkout dual-path
- `skills/auth-and-tenancy.md` — auth flows, middleware, org model, the two admin worlds
- `skills/database-schema.md` — inferred schema, RPCs, migration rules, drift notes
- `skills/dashboard-architecture.md` — Horizon shell, page inventory (real vs placeholder), data patterns
- `skills/design-system.md` — the four themes, tokens, fonts, per-surface rules
- `skills/deployment-and-environments.md` — Vercel, crons, env var inventory, external config
