# Denku — Implementation Roadmap (Master Findings Tracker)

> **Single source of truth for every audit finding and its status.** Rules in
> [docs/audits/README.md](audits/README.md). Audits provide narrative and evidence; THIS file
> tracks priority, effort, dependencies, and status. One issue = one `R-###` entry, forever —
> IDs are never reused or renumbered. Update this file in the same change that resolves a finding.
>
> **Last updated:** 2026-07-24 (**Sprint 6 (Launch Readiness) CODE-COMPLETE**: turned the built-but-
> dark work toward a safe, trustworthy launch for first paying customers. **L1** Production Readiness
> Preflight (**R-098**, `/admin/readiness` — one go/no-go over env + DB probes), **L2** consolidated
> `docs/LAUNCH_RUNBOOK.md`, **L3** webhook enforce-readiness confirmed + env-driven CSP flip (`CSP_MODE`)
> for **R-001** (still operator-flip-pending), **L4** real reachable member invites (**R-010 DONE** —
> `org_invites` + session route + signup acceptance) + working support contact (**R-047 DONE**), **L5**
> marketing honesty draft (`docs/MARKETING_HONESTY_DRAFT.md` — **R-004** flagged SOC2/HIPAA claims for
> counsel; not shipped). **220 tests green; build green.** DoD = "launch-ready, pending staging env"
> (the standing P0 blocker). Review: `docs/SPRINT_6_REVIEW.md`.)
> **Prior:** 2026-07-24 (**Sprint 5.5 (Platform Experience Depth) CORE COMPLETE**: the
> daily-use surfaces are now platform-shaped, all behind **`PLATFORM_UX_ENABLED`** (legacy served when
> OFF). Order was reviewed + reordered to **leaves-before-hub**: Q0 read-model depth (aggregations +
> contacts views) → **Contacts** (R-093, real list/detail over `leads`, `/leads` redirect) →
> **Analytics** (R-091, cross-channel flagged variant) → **Dashboard** (R-090, channel/employee-aware
> home, built last) + **agents→employees** consolidation (R-092). **202 tests green; build green.**
> R-094/095/096/097 (settings/onboarding/UX/nav) → **Sprint 6**. Review: `docs/SPRINT_5.5_REVIEW.md`.)
> **Prior:** 2026-07-24 (**Sprint 5 (Platform Experience) CORE COMPLETE — P0–P3**: the AI
> Employees IA is built behind **`PLATFORM_UX_ENABLED`** (default OFF → legacy dashboard unchanged;
> new routes 404 when off). **R-087** read model (P0), **P1** platform nav + Employees/Conversations/
> Channels/Contacts surfaces + capability-preserving legacy redirects (**R-088**, refined: only the
> calls list redirects; detail/management pages stay reachable), **R-084/P2** unified Conversations
> inbox + detail with a **plugin per-channel renderer registry** (**R-089**, requirement #2), **P3**
> Employee detail (Employees own channels) + Channels inventory (WhatsApp/Email "coming soon"). All
> surfaces read the P0 read model — no duplicated business logic. **193 tests green; build green.**
> Deferred to **Sprint 5.5:** Contacts surface, dashboard reskin, settings reorg, onboarding reframe,
> naming sweep. Review: `docs/SPRINT_5_REVIEW.md`.)
> **Prior:** 2026-07-24 (**Sprint 5 started — P0 done**: R-087 Platform Read Model +
> `PLATFORM_UX_ENABLED` flag.)
> **Prior:** 2026-07-24 (**Sprint 4.5 (Platform Foundation) code-complete** — the
> AI-Employees platform model is BUILT and adopted behind a flag. 4 additive, RLS-locked
> migrations (`20260724000000..000300`): `employee_channels`, `contacts`/`contact_identities`,
> conversations/messages adoption + idempotency + back-links, artifacts generalization + view.
> `lib/platform/*`: channel registry, idempotent contacts/conversations helpers, the shared
> `ingestInboundMessage` pipeline, pure voice/instagram adapters + registry, voice recorder,
> read helpers. **Voice + Instagram now write into the shared conversation model** behind
> **`PLATFORM_MODEL_ENABLED`** (default OFF → byte-for-byte legacy). Fixed 2 latent
> `/api/conversations/*` defects. **175 tests green; build green.** Activation:
> `docs/SPRINT_4.5_MIGRATION.md`. Filed follow-ups **R-081..R-086** (backfill, IG→Employee,
> voice-artifact convergence, unified inbox UI, read cutover, message-usage billing). Model
> reference: `skills/platform-architecture.md`. **Next: operator activation, then Phase-2
> platform UX.** NOT done: WhatsApp/Email, dashboard/onboarding redesign — out of scope.)
> **Prior:** 2026-07-23 (**Platform reframe** — a Product Architecture Audit
> ([docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md](audits/AI_EMPLOYEES_PLATFORM_AUDIT.md)) reframes Denku
> from a Voice-AI product to a multi-channel **AI Employees platform** (Voice · Instagram · WhatsApp ·
> Email · future). Key finding **P-004 (Critical):** the shared conversation model (`conversations`/
> `messages`, channel-aware, already has API routes) exists but is **unadopted** by the two live
> channels (voice=`calls`, IG=raw events) — it is the natural platform backbone. Recommended **Sprint
> 4.5 = "Platform Foundation"** (Employee/Channel/Conversation/Contact abstractions, additive + non-
> breaking; **not** a UI redesign, **not** new channels). Platform findings (`P-###`) live in that
> audit; several existing `R-###` are recontextualized (R-063, R-031, R-036, R-066, R-078/R-079).
> **Hard prerequisite for 4.5: a staging/preview env.** No code changed by the audit — planning only.)
> **Prior:** 2026-07-23 (**Sprint 4 (Voice Intelligence) code-complete** — **R-051/R-052**
> (voice EN-ES + 15-min/30-s call caps), **R-013** (business context, usable via Settings), **R-019**
> (AI-primary intent detection: gpt-4o-mini structured JSON + regex fallback, end-of-call, drives
> booking), **R-016** (recording verify + retention/consent copy). **139 tests green.** Go-live gate:
> `docs/SPRINT_4_REVIEW.md` §3 acceptance checklist + `OPENAI_API_KEY` + the `agents.business_context`
> migration. **Next: Sprint 4.5** (multi-channel platform). Sprint 3 activation still pending —
> `docs/SPRINT_3_ACTIVATION.md`.)
> **Prior:** 2026-07-23 (**Sprint 3 — repo-only + live-access waves**: R-080/R-033/R-034/R-061/R-021/
> R-062/R-070/R-065/R-048/R-053/R-067 + R-075/R-076 completed; R-060/R-009 partial; R-057 blocked on
> staging. Remaining Sprint-3 items await live access/operator.)
> **Prior:** 2026-07-23 (**Sprint 2 closed** — R-011 forgot-password shipped in code via
> Supabase built-in recovery; live reset test + a one-line Supabase redirect-allowlist entry are
> operator-gated. Email deliverability clarified: the `denku.io` Resend domain **IS verified** and is
> already used by the welcome email, so R-008/R-009 are **not** email-blocked — an earlier same-day
> note wrongly inferred sandbox-only from the stale `SENDER` constant and is corrected under R-008.
> Filed **R-080** for the stale sandbox `SENDER` used by auth verify/OTP/reset emails. Also shipped
> **R-008** (ticket/appointment notifications, staged OFF) and **R-018** (dashboard data-honesty pass
> + removed 2 dead Potemkin-data files, partial R-034); **R-009 DEFERRED** to Sprint 3 (blocked by
> R-075 unversioned billing math, owner decision).)
> **Prior:** 2026-07-22 (**Sprint 1.5 (Instagram Foundation) CLOSED** — code-complete; the
> receive pipeline is **operationally verified in production** via Meta's signed Test webhook.
> **Authoritative Meta rule:** unpublished (Dev Mode) apps receive **only dashboard Test events** — no
> real production data (incl. Testers) until **published/Live**; real Instagram DM webhooks require
> **Business Verification + App Review (Advanced Access) + Live Mode** (external Meta dependency, not a
> Denku defect). See `docs/SPRINT_1.5_REVIEW.md` Closure addendum + `docs/META_APP_REVIEW_PACKAGE.md`.
> Filed **R-078** (remove TEMP subscribe button) and **R-079** (OAuth stores requested not granted
> scopes). Sprint 1 remains 9 Completed / R-001 In Progress.) · **Next free ID:** R-099

**Effort scale:** S = ≤1 day · M = 1–3 days · L = 1–2 weeks · XL = multi-week
**Audits:** [00 = Technical architecture](audits/00-technical-architecture-audit.md) ·
[01 = CEO/Product](audits/01-ceo-product-audit.md) ·
[02 = CEO/Product — Premium Experience](audits/02-ceo-product-audit.md) ·
[03 = Voice Agent / Call Experience](audits/03-voice-agent-call-experience-audit.md) ·
[04 = Security](audits/04-security-audit.md) ·
[05 = UX](audits/05-ux-audit.md) · [06 = UI/Design](audits/06-ui-design-audit.md) ·
[07 = Growth](audits/07-growth-audit.md) · [08 = Performance](audits/08-performance-audit.md) ·
[09 = Accessibility](audits/09-accessibility-audit.md) ·
[10 = Enterprise](audits/10-enterprise-readiness-audit.md) ·
[11 = Principal Engineer](audits/11-principal-engineer-audit.md) ·
[12 = Billing Correctness](audits/12-billing-correctness-audit.md)

## Status summary

| Priority | Open | In Progress | Completed | Total |
|---|---|---|---|---|
| Critical | 4 | 1 | 10 | 15 |
| High | 10 | 0 | 15 | 25 |
| Medium | 29 | 0 | 16 | 45 |
| Low | 11 | 0 | 1 | 12 |
| **Total** | **54** | **1** | **42** | **97** |

*(2026-07-24: Sprint 6 (Launch Readiness) shipped R-098 (preflight), R-010 (member invites — Critical), R-047 (support); R-001 stays In Progress (enforce-ready, operator flip); R-004 marketing-honesty draft filed for counsel (not shipped). Sprint 5.5 shipped R-090/R-091/R-092/R-093. Sprint 5 shipped R-087/R-084/R-088/R-089.)*
*(2026-07-22: +R-079 Medium, +R-078 Low — both Instagram tech-debt/robustness filed at Sprint 1.5 closure.)*

**PLATFORM FOUNDATION — Sprint 4.5 follow-ups (filed 2026-07-24; NOT in Sprint 4.5 scope):**

- **R-081 (High)** — Backfill the platform model: populate `employee_channels` from existing
  `phone_lines` + `instagram_connections`, and `leads.contact_id`. A reviewed migration/script
  after the dual-writes verify on staging. *(Data step; do not run blindly.)*
- **R-082 (Medium)** — Instagram → Employee resolution: link IG conversations to the handling
  Employee via `employee_channels` (today `agentId` is null on IG ingest).
- **R-083 (Medium)** — Converge voice artifact creation through the shared pipeline's
  `runAutomation` hook (voice currently keeps its own end-of-call ticket/appointment path; the
  hook exists to unify it once proven safe — protect the never-dead-end guarantee).
- **R-084 (High)** — Unified **Conversations inbox** UI (voice + IG in one list) + Employees /
  Channels surfaces. **DONE 2026-07-24 (Sprint 5 P2/P3)** — inbox + detail thread, Employee roster/
  detail, Channels inventory, all over the read model, behind `PLATFORM_UX_ENABLED`. **Contacts
  surface remains Sprint 5.5** (placeholder shipped).
- **R-085 (Medium)** — Read cutover: point dashboard/analytics reads at `conversations`/
  `artifacts` (after dual-writes are trusted); retire divergent legacy reads.
- **R-086 (Medium)** — Multi-dimensional billing: add a message-usage dimension for chat
  channels (the baselined billing math R-075 is voice-minute-only). Ties to audit P-008.

**PLATFORM EXPERIENCE — Sprint 5 items (filed 2026-07-24):**

- **R-087 (High)** — **Platform Read Model** (`lib/platform/readModel/*`): stable platform-shaped
  read interface (Conversation/Employee/Channel views) sourced from legacy tables, decoupling the
  new IA from the dual-write flag/backfill. **DONE 2026-07-24 (Sprint 5 P0)** — voice←`calls`,
  chat←`conversations`, Employee-centric ownership, channel-tagged for the plugin renderer,
  coming-soon affordances. Swaps sources to `conversations/*` at read-cutover (R-085), no UI change.
- **R-088 (Medium)** — Route back-compat redirects. **DONE 2026-07-24 (Sprint 5 P1/P3)** — refined
  to be **capability-preserving**: only the fully-replaced **calls list** redirects to Conversations;
  call detail (recording/cost), phone-lines + instagram (management), and leads stay reachable and are
  linked from the new surfaces (not hidden), so the flag-ON experience loses no capability.
- **R-089 (Low)** — Plugin conversation-thread renderer registry. **DONE 2026-07-24 (Sprint 5 P2)** —
  per-channel renderers register via `registerRenderer`; the core `<ConversationThread>` never changes
  to add a channel (voice + IG registered; unknown → default fallback).

**PLATFORM EXPERIENCE DEPTH — Sprint 5.5 candidates (filed 2026-07-24; proposal `docs/SPRINT_5.5_PROPOSAL.md`):**

- **R-090 (High)** — Platform **Dashboard** redesign. **DONE 2026-07-24 (Sprint 5.5)** — flagged
  channel/employee-aware Overview (KPI tiles, by-channel, employee roster, recent) over the aggregation
  read model; R-018 honesty; legacy home when flag OFF. (audit P-011)
- **R-091 (High)** — **Cross-channel analytics**. **DONE 2026-07-24 (Sprint 5.5)** — flagged
  `PlatformAnalytics` (by channel/employee/intent + 14-day trend) over the aggregation read model; legacy
  analytics when flag OFF. Event instrumentation (R-066) remains separate. (audit P-012)
- **R-092 (Medium)** — Consolidate agent surfaces → AI Employees. **DONE 2026-07-24 (Sprint 5.5)** —
  `/dashboard/agents[/:id]` → `/employees[/:id]` redirect (NOT settings/agents) + "AI Employee" naming on
  platform surfaces. Broader legacy-copy sweep continues under R-065/Sprint 6. (audit P-013)
- **R-093 (High)** — **Contacts experience**. **DONE 2026-07-24 (Sprint 5.5)** — real Contacts list +
  detail (identities, conversation history) over the contacts read model (`leads` today; contacts/
  contact_identities once backfilled R-081); conversation→contact link; `/leads` redirect. (audit P-014)
- **R-094 (Medium)** — **Settings reorganization** by the platform model (per-Employee / per-Channel /
  Workspace); subsumes R-063. (audit P-015)
- **R-095 (Medium)** — **Onboarding reframe** (Employee→Channel narrative, DB step contract preserved). (audit P-002)
- **R-096 (Medium)** — **UX/design consistency**: new `_platform` surfaces adopt Horizon primitives;
  reconcile the Horizon/shadcn split (R-064) where settings reorg touches it. (audit P-016)
- **R-097 (Low)** — **Navigation polish**: topbar/breadcrumb titles for new routes, active/empty states,
  consistent "coming soon" affordances, mobile drawer parity. (audit P-017)

**LAUNCH READINESS — Sprint 6 candidate (filed 2026-07-24; proposal `docs/SPRINT_6_PROPOSAL.md`):**

- **R-098 (High)** — **Production Readiness Preflight**. **DONE 2026-07-24 (Sprint 6 L1)** —
  `/admin/readiness` + `GET /api/admin/readiness` (operator, Basic-Auth-gated): pure env checks
  (Core/Security/Voice/Email/Billing) + live DB probes; `ready` = no required failure. Flags R-001
  (webhook not enforce), R-077 (localhost base URL), R-080 (sandbox sender), R-047 (support email),
  CSP mode. Consolidated the scattered activation runbooks into `docs/LAUNCH_RUNBOOK.md` (L2).

**Sprint 6 = LAUNCH READINESS (proposed):** turn the ~5 sprints of code-complete-but-dark work real,
secure, and trustworthy for first paying customers. Engineering: R-098 (preflight) + consolidated
runbook + **R-001** enforce-readiness (Critical) + **R-010**/**R-047** trust fixes + **R-004** honesty
copy. Operator go-live (needs a **staging env**, the standing P0 unblock): apply migrations, set env,
reconcile assistants, flip enforce/CSP, run the Sprint-4 live acceptance, flip the platform flags.
**Deferred to Sprint 7+:** platform UX depth (R-094–097), read cutover (R-085)/backfill (R-081), new
channels, voice depth (R-020 calendar strongest), R-066 instrumentation.

**RE-PRIORITIZED do-next (post-Sprint-3, 2026-07-23).** Three sprints closed the security/trust
foundation, the value/notification layer, the code-health + a11y + SEO wave, and the billing
verifiability chain. **26 completed / 53 open.** What matters now, in order:

- **P0 — Finish Sprint 3 (operator, ~1 session):** run `docs/SPRINT_3_ACTIVATION.md` (apply the RLS +
  billing migrations, register crons, flip `BILLING_NOTIFICATIONS_ENABLED`, add the reset redirect
  URL). Turns already-shipped, staged work live. Includes the long-standing Sprint-1 handoff (rotate
  admin creds, `VAPI_WEBHOOK_BASE_URL` + reconcile, webhook `enforce`, CSP enforce) — which now also
  gates R-008 activation.
- **P1 — Unblock the two remaining security items with a STAGING/preview env:** **R-057** (per-operator
  admin identity — decided, needs staging to flip the middleware auth safely) and **R-060's remaining
  3 anon-read tables** (`orgs`/`audit_log_changes`/`org_plan_overrides` RLS policies + `orgScoped`
  helper). Both are blocked *only* on a place to test — the highest-value open risk.
- **P2 — Measurement, still unbuilt and still blocking:** **R-066** (zero product analytics). Every
  product/growth bet after this is unmeasurable; do it before optimizing the funnel.
- **P3 — Trust-surface truth pass:** **R-004** (marketing over-claims — needs **legal counsel**) +
  **R-010** (broken member invites) + **R-047** (dashboard support dead-end) — a coherent "paid
  product feels finished" pass.
- **P4 — Voice-product depth (the core promise):** **R-013** (business-context prompt), **R-019**
  (real intent detection), **R-016** (recording playback) — the biggest activation/retention levers
  once the funnel is measurable.
- **Opportunistic / when-touched:** **R-031** (full-schema baseline — now doable via the live DB,
  completes verifiability + unblocks R-036), **R-055** (artifact readability), remaining a11y (R-071)
  and UI-cohesion (R-064/R-027).

**Before acting on any finding, read `docs/EXECUTION_PLAN.md` (implement-now / decide-first /
external-dependency) and `docs/RETROSPECTIVE.md` (confidence + verify-first).** Live Supabase access
is **read-only** (target project `kebqwsdguxxjsijahrox`; BondAI is the default — pass the id
explicitly): inspect + write migration FILES, **never mutate prod schema/data**. Prod-writing changes
(RLS on anon-read tables, the admin-auth flip) need a **staging/preview env** to verify — don't ship
them blind (that's why R-057 + R-060's remainder are P1-but-blocked).

---

## CRITICAL

### R-001 — Vapi webhook has no authentication
**Priority:** Critical · **Status:** In Progress (staged 2026-07-08; enforcement pending verify) · **Effort:** S–M · **Related audit:** 00
- **Business impact:** Attackers can forge call data in any org, DoS inbound calls via lease
  exhaustion, and corrupt billing minutes — existential trust/billing risk.
- **Technical impact:** `web/src/app/api/webhooks/vapi/route.ts` processes any POST; everything
  built on the webhook inherits the exposure.
- **Dependencies:** Configure a server secret on Vapi assistants/webhook; coordinate deploy so
  live calls don't drop events.
- **Recommended solution:** Require a shared-secret header (Vapi `serverUrl` secret) or HMAC on
  every webhook request; reject with 401 otherwise; add a canary log for rejected attempts.
- **Live-state verified (2026-07-07, Sprint 1 Task 2, benign probe):** `POST /api/webhooks/vapi`
  on prod returns `200 {"ok":true,"ignored":"no_call_id"}` with **no** secret header and with a
  **bogus** `x-vapi-secret` alike — no 401, no edge/WAF shield. Confirmed unauthenticated and
  reachable in production; the POST handler has zero auth before `req.json()` + `webhook_debug`
  insert. **Fix input for Task 5:** an unused `VAPI_WEBHOOK_SECRET` already exists in the env
  (present in `.env.local`, never referenced in code) — the secret may already be configured on
  the Vapi side, so wiring a header/HMAC check is likely low-friction. The benign probe wrote only
  self-tagged `webhook_debug` ops rows (no tenant data).
- **In Progress — staged auth shipped (2026-07-08, Sprint 1 Task 5).** Added
  `web/src/lib/vapi/webhookAuth.ts` (pure, unit-tested — 11 tests) and wired it into the webhook
  POST handler *before* body parse / debug insert. It verifies the `x-vapi-secret` header
  (constant-time) against `VAPI_WEBHOOK_SECRET`. **Confirmed via live Vapi read (Task 5):** the
  demo assistant `155b21ad` + its bound number already send a custom `x-vapi-secret` header
  (`server.headers`), so this reuses the existing mechanism — no new secret provisioned.
  **Staged rollout** via `VAPI_WEBHOOK_AUTH_MODE` (`off`|`log`|`enforce`; default `log` when a
  secret is present, else `off`) so deploying this **does not change behavior** — it observes and
  emits a `[VAPI][WEBHOOK][AUTH][…]` canary, never rejecting. **Still OPEN until enforcement**, an
  ops sequence (Category C): (1) confirm `VAPI_WEBHOOK_SECRET` is set in Vercel and equals the
  value in the Vapi assistant's `x-vapi-secret` header; (2) deploy, place a real/demo call, confirm
  `[VAPI][WEBHOOK][AUTH][OK]` in logs; (3) set `VAPI_WEBHOOK_AUTH_MODE=enforce`. **Cross-dep:** the
  R-077/Task-6 fix that repoints customer assistants' `serverUrl` at the prod webhook MUST also set
  the `x-vapi-secret` header, or enforcement will drop those lines.

### R-002 — Public debug endpoints leak admin credentials material
**Priority:** Critical · **Status:** Completed (2026-07-08) · **Effort:** S · **Related audit:** 00
- **Business impact:** Weakens the Basic-Auth-protected admin surface; trivially discoverable.
- **Technical impact:** `api/debug/basic-auth` + `api/debug/headers` return `ADMIN_USER`,
  password length, env details; both outside the middleware matcher.
- **Dependencies:** None.
- **Recommended solution:** Delete both routes (preferred) or gate behind `requireBasicAuth` +
  non-production check. Rotate `ADMIN_USER`/`ADMIN_PASS` after removal.
- **Prod probe note (2026-07-07, Sprint 1 Task 2):** both routes returned **404** on prod.
- **Root cause & resolution (2026-07-08, Sprint 1 Task 4):** the 404 is explained — the routes
  were **gitignored** (`web/.gitignore: src/app/api/debug/`), so they were never committed, never
  deployed, and only ever existed on local dev machines. The audit's "reachable in production"
  was therefore **incorrect** (a static-read miss) — real exposure was local-dev only, though
  `/api/debug/headers` still leaked `ADMIN_USER` to any local requester. **Fixed:** deleted
  `web/src/app/api/debug/` (both routes) AND removed the `.gitignore` rule that hid them, so the
  anti-pattern (auto-ignored, unreviewable local debug routes — CLAUDE.md landmine #2) can't
  recur silently. Note (external, unchanged): rotate `ADMIN_USER`/`ADMIN_PASS` in Vercel.

### R-003 — PII debug headers on every dashboard response
**Priority:** Critical · **Status:** Completed (2026-07-08) · **Effort:** S · **Related audit:** 00
- **Business impact:** User ID/email disclosure to intermediaries; unprofessional.
- **Technical impact:** `web/src/middleware.ts` sets `x-auth-user`/`x-auth-email`/`x-auth-confirmed`.
- **Dependencies:** None.
- **Recommended solution:** Remove the header writes; keep decisions in logs only.
- **Completed 2026-07-08 (Sprint 1 Task 4):** removed all three `x-auth-*` `response.headers.set`
  calls from `middleware.ts` (authenticated pass-through branch — the only one that actually
  emitted them; the no-user and catch branches set them on `response` but return a separate
  `NextResponse.redirect`, so those were already dead code). Also removed the now-unused `userId`
  and `confirmedStatus` locals; `userEmail`/`emailConfirmed` retained (still used by the
  verify-email redirect + gate). Behavior-preserving: no change to auth, gating, or redirects.
  Confirmed no code reads `x-auth-*` (grep) before removal.

### R-004 — Marketing trust surfaces sell a fictional product (pricing, docs, support, security)
**Priority:** Critical · **Status:** Open — honest-copy DRAFT filed 2026-07-24 (Sprint 6 L5), awaiting owner/counsel review · **Effort:** S–M · **Related audit:** 01 (C1), 02 (Persona 1)
> `docs/MARKETING_HONESTY_DRAFT.md` catalogs the over-claims + honest replacements. Severity 1 = **SOC 2
> / HIPAA compliance claims Denku does not hold** (legal exposure) — top priority for counsel; S2 =
> fabricated metrics ("98.5% success rate"); S3 = channel/absolute over-claims. NOT shipped — deliberately
> awaiting review before touching live marketing copy.
- **Business impact:** Refund/churn machine; "HIPAA & audit logs"/"SLA"/"SOC 2-ready" claims are
  legal exposure. Audit 02 found the fiction escalates along the buyer's diligence path: the
  **docs page** invents CRM/calendar/helpdesk integrations, a chat channel, API access, and
  custom models; the **support page** invents SLA tiers ("Priority handling", "Contractual SLA")
  and troubleshooting for nonexistent features; the **security page** claims HMAC-signed
  webhooks (while R-001 exists), custom-role RBAC, immutable audit logs, and per-plan retention
  (30/90/custom days). Destroys trust with every informed buyer.
- **Technical impact:** Copy-only changes — `web/src/components/marketing/pricing-data.ts`
  (+ `ComparePlans`), `app/(marketing)/docs/page.tsx`, `support/page.tsx`, `security/page.tsx`.
- **Dependencies:** Product decision on which claims become "coming soon" (see R-042).
- **Recommended solution:** One truth pass across all four surfaces: rewrite to shipped
  capabilities only (concurrency, minutes, overage, numbers, tickets/appointments, transcripts,
  analytics); keep the security page's honest "(Roadmap)" pattern for everything aspirational;
  move the rest to a public roadmap. Pair with R-046 (in-product fabrication).

### R-005 — Annual billing toggle is decorative
**Priority:** Critical · **Status:** Open · **Effort:** S (remove) / L (implement) · **Related audit:** 01 (C2)
- **Business impact:** "Save 20%" with monthly-only charging = billing bait-and-switch.
- **Technical impact:** No `annualPrice` data; checkout creates monthly `price_data` only.
  Implementing annual properly is easier after R-035 (Stripe catalog Prices).
- **Dependencies:** R-035 for the implement path.
- **Recommended solution:** Short term: remove the toggle. Later: annual Prices + toggle restored.

### R-006 — Marketing vs billing disagree on included phone numbers
**Priority:** Critical · **Status:** Open · **Effort:** S · **Related audit:** 01 (C3)
- **Business impact:** Either under-selling capacity (Growth/Scale include 2/5 numbers per
  `billing_plan_catalog`) or over-billing vs promise; also "capacity bonus" jargon on public page.
- **Technical impact:** Align `pricing-data.ts` with `billing_plan_catalog` (or vice versa).
- **Dependencies:** Decide which side is correct.
- **Recommended solution:** Make `billing_plan_catalog` canonical; fix marketing copy; add a
  comment linking the two sources.

### R-007 — CTA integrity: hero mislabeled, live demo buried, "Get started free" with no free tier
**Priority:** Critical · **Status:** Open · **Effort:** S · **Related audit:** 01 (C4), 07
- **Business impact:** "Book a demo" → signup is a bait-and-switch and the strongest conversion
  asset (live AI call) is a secondary button. Audit 07: `Contact.tsx` also renders a
  **"Get started free"** CTA when there is no free tier and a card is required at onboarding step 4
  (R-015) — same bait-and-switch family as the annual toggle (R-005).
- **Technical impact:** `web/src/components/marketing/hero-premium.tsx` CTA swap;
  `web/src/components/marketing/Contact.tsx` "Get started free" copy.
- **Dependencies:** Coordinates with landing redesign (R-022) — fix now anyway, don't wait.
- **Recommended solution:** Primary CTA = "Talk to Denku now" (DemoCallButton); secondary =
  pricing/signup with honest labels; replace "Get started free" with a truthful CTA (or ship a
  real trial, R-015).

### R-008 — No notifications when the AI creates tickets/appointments
**Priority:** Critical · **Status:** Completed (2026-07-23, code; staged OFF until operator enable) · **Effort:** M · **Related audit:** 01 (C5)
- **Business impact:** The core value ("never miss a call") is invisible between logins — the #1
  retention lifeline available.
- **Technical impact:** Hook Resend sends into the deterministic artifact path in the Vapi webhook
  (idempotent — guard like the welcome email); notification prefs on `organization_settings`.
- **Dependencies:** Resend domain (`denku.io`) verified; R-001 recommended first (don't email on
  forgeable events).
- **Email deliverability — CLARIFIED (2026-07-23, corrects an earlier same-day mis-note):** the
  `denku.io` sending domain **IS verified in Resend** ("ready to send emails", operator-confirmed).
  The product already sends to real recipients from it — `sendWelcomeEmail` uses
  `from: "Denku <hello@denku.io>"` (`lib/email/send.ts:121`). So **R-008/R-009 customer emails are
  NOT blocked by Resend** — they must simply send from a `@denku.io` address. ⚠️ Note the trap: the
  shared `SENDER` constant (`lib/email/resend.ts:5`, dup in `templates.ts:7`) is still the stale
  **sandbox** `onboarding@resend.dev`, used by the auth verify/OTP/**password-reset** emails; those
  are backstopped by Supabase's own emails and are separate tech-debt (see **R-080**). R-008 must use
  the verified `denku.io` sender, not `SENDER`.
- **Remaining real gate for R-008 (not Resend):** `VAPI_WEBHOOK_AUTH_MODE=enforce` (R-001) so
  notifications don't fire on forgeable webhook events. Until enforce is live, ship R-008 sending
  behind a safe gate (staged, like Sprint 1) rather than emailing on an unauthenticated webhook.
- **Recommended solution:** Per-event email to org owner on ticket/appointment creation with
  transcript summary + deep link; digest option later (R-017).
- **Completed 2026-07-23 (Sprint 2, code — staged OFF):** New `lib/notifications/artifactNotifications.ts`
  runs a **sweep at the end-of-call artifact-routing convergence point** in the Vapi webhook (after
  BOTH tool-created and deterministic artifacts are persisted — so healthy calls are covered, not
  just fallback tickets). Per artifact it **atomically claims** the send via a conditional UPDATE
  (`notified_at = now() WHERE notified_at IS NULL`) — the exact welcome-email idempotency lock — so
  redelivered webhooks never double-email; on send failure it **resets** the marker to retry. Sends
  from the **verified** `notifications@denku.io` (new `sendArtifactNotificationEmail` in `send.ts`),
  NOT the sandbox `SENDER`. Recipient = `organization_settings.billing_email` → owner
  `profiles.email`; honors a new per-org `notify_on_artifacts` opt-out (default true). Pure email
  builder `lib/email/templates/artifactNotification.ts` (HTML-escapes caller-controlled transcript
  text). **Never throws** (call finalization is never affected). Migration
  `supabase/migrations/20260723000000_artifact_notifications.sql` adds `tickets.notified_at`,
  `appointments.notified_at`, `organization_settings.notify_on_artifacts`. 10 new unit tests
  (gate/recipient/template + XSS-escape), 73 total green; build passing.
- **STAGED — gated by `ARTIFACT_NOTIFICATIONS_ENABLED` (default OFF).** Operator prerequisites before
  enabling (do NOT assume done): (1) apply the migration to prod; (2) `VAPI_WEBHOOK_AUTH_MODE=enforce`
  (R-001) so events aren't forgeable; (3) confirm `denku.io` deliverability; then set
  `ARTIFACT_NOTIFICATIONS_ENABLED=true`. Fast-follow (not blocking): a Settings→Notifications UI
  toggle for `notify_on_artifacts` (the column + read path exist; the `settings/notifications` route
  is currently an empty stub).

### R-009 — Silent overage charges and silent hard-cap shutdown
**Priority:** Critical · **Status:** Completed (2026-07-23; policy = Pause at cap, owner-decided) · **Effort:** M · **Related audit:** 01 (C6)
- **Business impact:** A business phone going dead at $250 overage without warning is a
  catastrophic, churn-and-chargeback event; $100 surprise charges nearly as bad.
- **Technical impact:** Add notification triggers to `billing_overage_state` transitions and the
  pause path (`enforceTelephonyPause`).
- **Dependencies:** R-008 email infrastructure (**now available** — verified `denku.io` sender +
  `sendArtifactNotificationEmail`/recipient resolver from R-008 can be reused). **Hard-blocked by
  **R-075**: the 50/75/90%-of-included-minutes warnings require included-vs-used minutes, which are
  computed only inside the **unversioned** `org_monthly_invoice_preview` view/RPC (not in the repo).
- **⚠️ Deferred by owner decision (2026-07-23):** *"Do not implement product behavior on top of
  unresolved billing math (R-075)."* Deferring honors the execution-plan rule (never refactor/extend
  the money path on inference — `docs/EXECUTION_PLAN.md`, `docs/RETROSPECTIVE.md §7`). Two further
  gates before build: (1) **R-075** — baseline the invoice-preview view/RPC into `supabase/migrations`
  and prove the minute/overage math, so warnings fire on version-controlled numbers; (2) a **product
  decision** on the hard-cap policy (*pause vs keep-billing* — current behavior is hard pause), to be
  made **after** the billing math is finalized. Investigation facts to carry forward: overage/hard-cap
  logic lives in `api/billing/overage/collect-now/route.ts` (session-auth, **user-triggered**) and
  `pauseOrgBilling`; there is **no continuous overage-enforcement cron** (only `close_month.yml`
  monthly), and **no dashboard-wide pause banner** exists today (only `WorkspaceStatusBadge`).
- **Recommended solution:** Emails at 50/75/90% of included minutes and before threshold charge;
  explicit customer setting: "at hard cap: pause vs keep billing"; loud email + banner on pause.
  **Sequence: R-075 first, then the policy decision, then build (reusing R-008's email infra).**
- **PARTIAL — done 2026-07-23 (Sprint 3, R-075 now unblocks this):** shipped the **"loud email + banner
  on pause"** half — the worst symptom (a business phone going dead silently). New
  `lib/billing/pauseNotifications.ts#notifyWorkspacePaused` emails the owner on the **active→paused
  transition** (detected in `pauseOrgBilling`, so once per pause event; covers hard_cap + past_due),
  reusing R-008's verified `denku.io` sender + a shared recipient resolver
  (`lib/notifications/recipient.ts`); never throws; **staged OFF behind `BILLING_NOTIFICATIONS_ENABLED`**.
  Template `lib/email/templates/workspacePaused.ts`. Added a dashboard-wide `PausedBanner`
  (`components/dashboard/PausedBanner.tsx`, mounted in `dashboard/layout.tsx`) that loudly shows a
  paused line with a Manage-billing CTA. Staged behind `BILLING_NOTIFICATIONS_ENABLED`.
- **PARTIAL cont'd — proactive 50/75/90% warnings done 2026-07-23:** an **isolated daily cron**
  `api/billing/cron/usage-alerts` (CRON_SECRET-gated; `vercel.json` entry `0 8 * * *`) reads the
  baselined billing view `org_monthly_overages` (billable vs included minutes, R-075), and emails the
  **highest newly-crossed** threshold per org (never re-sending; lower thresholds suppressed).
  Deliberately NOT in the Vapi webhook hot path. Idempotent via new table `billing_usage_alerts`
  (migration `20260723120000`, service-role RLS). Pure `crossedThresholds` + template unit-tested
  (110 total green); build green; staged behind `BILLING_NOTIFICATIONS_ENABLED`. Reuses the shared
  recipient/sender. **Still OPEN (only remaining piece):** the **configurable hard-cap policy** (pause
  vs keep-billing) — needs the **owner product decision** (current behavior = pause, preserved).
  Operator: apply migrations `20260723120000` + register the cron; set `BILLING_NOTIFICATIONS_ENABLED=true`.
- **COMPLETED — owner policy decision (2026-07-23): default = PAUSE at the cap** (trust + money
  integrity over silent overage billing). Final flow, all shipped: **50/75/90% warning emails** →
  at **100% of included minutes, PAUSE** the AI line (the usage cron calls `pauseOrgBilling` for any
  active org at 100%, which unbinds telephony and fires the **owner pause notification**) → the
  **dashboard `PausedBanner`** explains the cause ("you've used all your plan's included minutes") and
  the path to resume (**"Upgrade your plan or raise your usage limit"** + Manage-billing CTA); the
  pause email carries the same guidance. `shouldPauseForUsage` is pure + unit-tested (118 total green).
  No keep-billing escape hatch was built (the owner deprioritized silent overage). Whole flow staged
  behind `BILLING_NOTIFICATIONS_ENABLED`. **Follow-on (optional, not blocking):** tighter real-time
  pause (the daily cron can lag ≤24h behind 100%); a future keep-billing opt-in if ever wanted.

### R-010 — Member invites are broken (admin namespace collision)
**Priority:** Critical · **Status:** ✅ Completed 2026-07-24 (Sprint 6 L4) · **Effort:** S–M · **Related audit:** 00, 01 (C7)
> Fixed: new session-authed `/api/members/invite` (customer-reachable, not `/api/admin/*`), additive
> RLS-locked `org_invites`, real invite email (Resend), and signup **acceptance** (invited email joins
> the inviting org instead of creating a new one). Dead Potemkin `/api/admin/members/invite` removed;
> pending invites shown. The `org_invites` migration is operator-apply (runbook Phase 3); the route
> degrades honestly if unmigrated.
- **Business impact:** A visible team feature that 401s reads as abandonware; blocks multi-user
  adoption (retention driver).
- **Technical impact:** `InviteMemberForm` → `/api/admin/members/invite` intercepted by Basic-Auth
  middleware. Root cause: platform-admin vs workspace-admin share `/api/admin/*`.
- **Dependencies:** None.
- **Recommended solution:** Move to `/api/workspace/members/invite` with session auth +
  `profiles.role` check; establish rule (already in CLAUDE.md): customer code never calls `/api/admin/*`.

### R-011 — No forgot-password flow (and the login link dead-loops)
**Priority:** Critical · **Status:** Completed (2026-07-23, code; live reset test operator-gated) · **Effort:** M · **Related audit:** 00, 01 (C7), 02 (Persona 2)
- **Business impact:** Locked-out paying customers churn silently. Audit 02: it's worse than
  absent — login shows a "Forgot Password?" link pointing to `/login?forgot=1`, which nothing
  handles; the page reloads. A visibly broken promise at the moment of maximum frustration.
- **Technical impact:** Template exists (`lib/email/templates.ts#getPasswordResetEmailHtml`);
  needs page + action using Supabase reset flow + `/auth/callback` handling; dead link at
  `app/(auth)/login/page.tsx:92`.
- **Dependencies:** None.
- **Recommended solution:** `/forgot-password` page → Supabase `resetPasswordForEmail` → reset
  form; repoint the login link (or remove it until the flow ships — never a dead loop).
- **Completed 2026-07-23 (Sprint 2, code):** Built the full flow on Supabase Auth's **built-in
  (default, link-based) recovery email** — chosen over the repo's custom `sendPasswordResetEmail`
  because that path sends from the stale **sandbox** `SENDER` (`onboarding@resend.dev`, R-080) which
  would fail to reach customers, and because Supabase built-in matches the existing "Supabase emails
  are source of truth" auth architecture (signup verification works the same way). A custom
  Denku-branded reset email is possible later once R-080 fixes `SENDER` to `denku.io`.
  New files: `app/(auth)/forgot-password/{page.tsx,requestPasswordResetAction.ts}` (enumeration-safe
  — always returns ok for a well-formed email), `app/auth/reset-callback/route.ts` (a **dedicated**
  recovery code-exchange route, kept separate from the shared signup `/auth/callback` for zero
  signup regression risk), `app/(auth)/reset-password/{page.tsx,updatePasswordAction.ts}` (mirrors
  the proven `setPassword` shape: requires the recovery session, then `updateUser({password})`).
  Extracted the password rule into pure, unit-tested `lib/auth/passwordPolicy.ts` (5 tests; 63 total
  green). Repointed the dead `login/page.tsx` link `/login?forgot=1` → `/forgot-password`.
  **Operator-gated (NOT done, do not assume):** `${baseUrl}/auth/reset-callback` must be added to
  the Supabase Auth **Redirect URLs allowlist** (same place `/auth/callback` is listed) or Supabase
  falls back to Site URL and the link never reaches the reset form; then a real end-to-end reset
  test. Custom Denku-branded recovery email (Supabase template change) is optional future polish.

### R-012 — Placeholder pages reachable in production
**Priority:** Critical · **Status:** Completed (2026-07-08) · **Effort:** S · **Related audit:** 01 (C7), 02 (Persona 3)
- **Business impact:** "Risk & Compliance → Placeholder page." kills enterprise evaluations;
  five dead ends signal unfinished product.
- **Technical impact:** `dashboard/{knowledge,tools,risk,activity,billing}/page.tsx` stubs.
  (The settings keys/integrations screens are NOT mere placeholders — they show fabricated data;
  tracked separately as R-046.)
- **Dependencies:** Decide per page: delete route vs "coming soon" with substance.
- **Recommended solution:** Remove routes not in the 8-item sidebar; for Knowledge (future R-013+)
  ship a real "what's coming + notify me" page instead of a stub.
- **Completed 2026-07-08 (Sprint 1 Task 7):** deleted the stub routes `dashboard/{knowledge,tools,
  risk,activity,billing}` (incl. the `knowledge/[sourceId]` and `tools/[toolId]` stub sub-routes) —
  all rendered "Placeholder page." and none are in the 8-item sidebar. Also deleted the orphaned
  `(app)/QuickActionsCard.tsx` (its only purpose was linking to the now-deleted knowledge/tools/risk
  stubs; it was already unrendered). No dead links remain (grep-verified). A real Knowledge surface
  is future work (R-013+); `dashboard/usage` (a redirect to settings usage) and the real
  `settings/workspace/billing` are untouched.

### R-046 — Potemkin screens in the paid product: fake API keys + fabricated integration health
**Priority:** Critical · **Status:** Completed (2026-07-08) · **Effort:** S · **Related audit:** 02 (Persona 3)
- **Business impact:** In-product deception — worse than marketing fiction because paying
  customers rely on it. Settings → API keys renders hardcoded fake credentials
  (`pk_live_1234567890abcdef` / `sk_live_abcdef1234567890`) masked to look real with a disabled
  "Rotate keys" button; a customer who copies them gets silent failure, one who recognizes them
  never trusts a screen again. Settings → Integrations shows hardcoded "Voice infrastructure:
  Connected" / "Webhooks: Healthy" statuses checking nothing — during a real incident this screen
  will say "Healthy."
- **Technical impact:** `settings/workspace/keys/page.tsx` (hardcoded key strings),
  `settings/integrations/page.tsx` (hardcoded status strings). Removal is trivial; real API keys
  are a separate future feature (R-045 territory).
- **Dependencies:** Decision: remove screens vs honest "coming soon" (integrations page's own
  CRM/Calendar cards already model the honest pattern).
- **Recommended solution:** Delete the fake keys screen (or replace with an honest "API access is
  coming — join the waitlist"); make integration statuses either real (trivial Vapi ping) or
  remove the status chips. Pair with the R-004 truth pass.
- **Completed 2026-07-08 (Sprint 1 Task 7):** deleted `settings/workspace/keys/page.tsx` (the
  hardcoded `pk_live_…`/`sk_live_…` fake credentials + disabled "Rotate keys" button; the route was
  unlinked from any nav). Removed the two fabricated health cards from
  `settings/integrations/page.tsx` ("Voice infrastructure: Connected" / "Webhooks: Healthy" — they
  checked nothing) and dropped the "monitor infrastructure health" claim from the subtitle; kept
  the two honest "Coming soon" CRM/Calendar cards. Real API keys remain future work (R-045).

### R-050 — The AI's tools are missing on most lines, and silently stripped from the rest
**Priority:** Critical · **Status:** Completed (2026-07-08; existing assistants need reconcile run) · **Effort:** M · **Related audit:** 03 (headline)
- **Business impact:** The core promise ("book every appointment", tickets filed live on the
  call) is broken on most realistic configurations: (a) dashboard-purchased phone lines get
  assistants with NO create_ticket/create_appointment tools; (b) the Main Line loses its tools
  the first time a customer personalizes the agent in Settings. The prompt still instructs the
  AI to use the tools, so it verbally confirms actions it cannot perform; the deterministic
  post-call fallback masks the failure with generic tickets. Mid-call booking is effectively
  impossible on affected lines (compounds R-019). Analytics skew: `toolUsed` always false →
  healthy calls marked "partial" (feeds R-018).
- **Technical impact:** `api/phone-lines/purchase/route.ts` (no toolIds merge at all);
  `settings/_actions/agents.ts#syncAgentToVapi` (blind `model` PATCH without toolIds — violates
  CLAUDE.md landmine #6's GET→merge→PATCH rule that `runActivation` follows correctly).
- **Dependencies:** None to fix; R-019 needed for the appointment path to work end-to-end.
- **Recommended solution:** One shared "assistant config assembly" helper used by BOTH creation
  paths and the settings sync: always GET current assistant, merge (never replace) `model` with
  `toolIds` guaranteed present; add a reconciliation pass for existing orgs' assistants. Preserve
  the deterministic fallback untouched — it's the safety net, not the bug.
- **Live-state verified (2026-07-07, Sprint 1 Task 1, read-only API):** both purchase-path
  assistants (`PL …`) are live on active numbers with `toolIds: null` — part (a) is production
  fact. Every tool-bearing assistant got its tools from `runActivation`'s merge (updated ~2s after
  creation); the only manually-modified assistant is bound to no number, so **no working manual
  config is at risk — the fix is unblocked**. The settings-sync strip (b) has not fired on any
  live assistant yet; fix before customers personalize. Both hardcoded tool IDs exist in the
  account (`apiRequest` tools POSTing to prod `/api/tools/*`). Verification also surfaced R-077.
- **Completed 2026-07-08 (Sprint 1 Task 6).** One shared config-assembly helper
  `web/src/lib/vapi/assistantConfig.ts` (`buildAssistantConfigPatch` pure + `ensureAssistantConfig`
  I/O + `DENKU_TOOL_IDS`) always GET→merge→PATCH with `model.toolIds` **merged, never replaced**.
  Wired into all three paths: `runActivation`, the phone-line purchase route (attached NO tools —
  R-050a), and `syncAgentToVapi` (wiped tools on personalization — R-050b). Pure merge logic
  unit-tested (12 tests incl. the "personalize must not drop tools" regression). Deterministic
  fallback untouched; the hardcoded tool IDs are now centralized in the helper (was landmine #5).
  **Remaining (external):** existing pre-fix assistants need the reconciliation pass — `POST
  /api/internal/reconcile-vapi-assistants` (Basic Auth, idempotent) — and end-to-end confirmation
  needs a live test call (Audit 03 protocol 1–2). R-051/R-052 can extend this same helper.

### R-077 — Live assistants' serverUrl points at localhost (env-coupled creation)
**Priority:** Critical · **Status:** Completed (2026-07-08; existing assistants need reconcile run) · **Effort:** S–M · **Related audit:** 03 (filed during Sprint 1 Task 1 live-state verification, 2026-07-07)
- **Business impact:** Every app-created live assistant (all bound Main Lines + both purchase-path
  lines) carries `serverUrl: http://localhost:3000/api/tools` — an unreachable host and the wrong
  path for webhook events. Unless an org-level Server URL is configured in the Vapi dashboard
  (not readable via API — `GET /org` returns 401 for this key), Vapi has nowhere valid to deliver
  end-of-call reports for customer lines — i.e. call ingestion for paying customers may be
  silently dead (no calls, no tickets, no billing minutes). Even best-case, live config is wrong
  and env-coupled. The dashboard-managed demo line is unaffected (its number carries the prod
  webhook URL).
- **Technical impact:** `runActivation` and `api/phone-lines/purchase` set
  `serverUrl = ${getBaseUrl()}/api/tools` at creation, freezing the *creating machine's* base URL
  into live config. Two distinct defects: (a) base URL captured from the creation environment;
  (b) `/api/tools` is not the webhook route (`/api/webhooks/vapi`). Mid-call tool execution is
  UNAFFECTED — the two tools are account-level `apiRequest` tools carrying their own absolute
  prod URLs.
- **Dependencies:** Verify actual event delivery first (org-level dashboard Server URL + a live
  test call) — folded into Sprint 1 Task 2 (R-001 reachability). Fix belongs in the R-050 shared
  config-assembly helper.
- **Recommended solution:** The shared helper sets `serverUrl` to the canonical webhook URL from
  explicit env (never request-derived); the R-050 reconciliation pass re-PATCHes existing
  assistants; verify ingestion end-to-end with a test call.
- **Verified & downgraded from "possibly-active" to LATENT (2026-07-07, Sprint 1 Task 2):** the
  Vapi account has **zero call history** (`GET /call` → 0 calls), and is plainly a test/staging
  account (test-data org names, all `321` numbers). So the localhost `serverUrl` is **not
  currently dropping any live traffic — there is none to drop.** It remains Critical because it
  will break the first real customer call, but it is a latent defect, not an active incident.
  The prod DB could **not** be inspected: the local env's Supabase project
  (`kebqwsdguxxjsijahrox`) no longer resolves (DNS ENOTFOUND); prod serves marketing/login and
  bounces `/dashboard`→`/login`, so it runs on separate live Vercel env not available here. The
  two open sub-questions — is an org-level Vapi Server URL configured, and which Supabase project
  does prod use — remain for whoever has dashboard/Vercel access. **Decision (2026-07-07, user):**
  do **not** emergency-remediate via ad-hoc Vapi PATCH; fix through the Task 6 shared config helper
  + reconciliation pass, verified with a live test call. (Sprint 1 Task 2 outcome.)
- **Completed 2026-07-08 (Sprint 1 Task 6).** The shared helper `assistantConfig.ts` now sets
  `server.url` to the canonical webhook (`/api/webhooks/vapi`, not `/api/tools`) from **explicit
  env** — `getVapiWebhookServerUrl` reads `VAPI_WEBHOOK_BASE_URL` → `NEXT_PUBLIC_SITE_URL` and
  **refuses localhost/`VERCEL_URL`** (returns "" → skips `server`, never freezing a dev URL). Both
  defects fixed: (a) no more creation-env capture; (b) correct webhook path. When `VAPI_WEBHOOK_SECRET`
  is set it also attaches the `x-vapi-secret` header (Task 5 enforcement cross-dep). All new
  assistants get this on create; unit-tested (localhost-rejection + URL assembly). **Remaining
  (external):** set `VAPI_WEBHOOK_BASE_URL` in Vercel to the canonical prod origin, run `POST
  /api/internal/reconcile-vapi-assistants` to fix existing assistants, and verify ingestion with a
  live test call.

## HIGH

### R-013 — Agent knows nothing about the customer's business
**Priority:** High · **Status:** Completed (2026-07-23, Sprint 4; usable via Settings — onboarding-step capture folded into Sprint 4.5's onboarding rework) · **Effort:** M · **Related audit:** 01 (H8), 03
(Audit 03: the entire Main Line brain is ~5 generic lines; purchase-path assistants are thinner
still — "You are a helpful customer support voice assistant." The prompt-derivation chassis
(presets, emphasis points, mandatory fallback line) is sound and is the right place to inject
business context.)
- **Business impact:** First test-call meets a generic bot → the single biggest churn driver.
- **Technical impact:** Add 3 onboarding fields (hours, offerings, top caller questions) →
  persist on org/agent → inject into prompt derivation (`prompt-derivation.ts`) + Main Line
  creation in `runActivation`.
- **Dependencies:** None (full knowledge base is a later, separate effort).
- **Recommended solution:** Business-context step in onboarding; same fields editable in
  Settings → Agents; template them into the system prompt.
- **Completed 2026-07-23 (Sprint 4):** 8 owner-approved fields (business name, services, opening
  hours, service area, FAQs, booking policy, cancellation policy, tone) persisted as JSONB
  `agents.business_context` (migration `20260723130000`). Pure `buildBusinessContextBlock` injects a
  **concise, deterministic** "About the business" block (only non-empty fields) into
  `deriveEffectivePrompt`, preserving the mandatory fallback line (5 unit tests). **Editable in
  Settings → Agents** (`AgentConfigurePage.tsx`, 8 fields), zod-validated + persisted (non-wiping).
  **Main-Line wiring:** the Settings save re-derives the prompt WITH context and pushes it to the live
  Vapi assistant via `syncAgentToVapi` (`agents.ts:226`), so business context reaches the actual call.
  130 tests green; build green. → **Fully usable from the product today.** **Onboarding-step capture**
  (collect during first-run so it's applied at activation) is **folded into Sprint 4.5** (which reworks
  onboarding/IA) rather than adding a step now that 4.5 will redesign.

### R-014 — Go-live magic moment is un-orchestrated
**Priority:** High · **Status:** Open · **Effort:** M–L · **Related audit:** 01 (H9)
- **Business impact:** Activation ends on empty charts instead of the product's proof moment.
- **Technical impact:** Post-activation screen with the provisioned number, live call/transcript
  polling (calls table), first-ticket reveal.
- **Dependencies:** R-013 (the call should be impressive first).
- **Recommended solution:** Full-screen "Call your number now" step with streaming transcript and
  "your first ticket was created" close; add a go-live checklist card on first dashboard visits.

### R-015 — No product taste before the paywall
**Priority:** High · **Status:** Open · **Effort:** L · **Related audit:** 01 (H10)
- **Business impact:** First value moment costs $149 → activation/conversion ceiling.
- **Technical impact:** Pre-purchase in-browser web call against the user's configured (temp)
  assistant, with strict limits; or trial plumbing in billing.
- **Dependencies:** R-013 (context makes the taste compelling); guardrails exist for webcalls.
- **Recommended solution:** After the goal/business step, "Talk to YOUR agent" in-browser before
  the plan step; fall back to 14-day card trial if abuse risk proves high.

### R-016 — No call recording playback
**Priority:** High · **Status:** Completed (2026-07-23, Sprint 4) · **Effort:** M · **Related audit:** 01 (H11)
- **Business impact:** Voice product without audio = trust and coaching gap; table stakes.
- **Technical impact:** Vapi end-of-call payloads carry recording URLs in `raw_payload`; surface
  on `dashboard/calls/[callId]` with an audio player; consider retention/consent copy.
- **Dependencies:** Verify recording availability/format per Vapi config.
- **Recommended solution:** Extract + store recording URL on `calls`, add player to call detail,
  note state consent requirements in settings copy.
- **Completed 2026-07-23 (Sprint 4):** the player already existed (`findRecordingUrl` extracts the
  URL from `raw_payload` across Vapi's shapes; `<audio controls>` on `calls/[callId]`). This pass
  added (owner scope: **display only, no retention engine**): an **Available / Not available** badge,
  a clean empty state, and a **retention + consent info line** ("recordings retained per your voice
  provider's policy; Denku applies no extra limit; recording-consent laws vary by state/country").
  Build green. **Operator-gated:** verify playback against a real Vapi recording payload (test call).
  A configurable retention engine is a deliberate later effort (R-073 data-lifecycle).

### R-017 — No weekly value digest
**Priority:** High · **Status:** Open · **Effort:** M · **Related audit:** 01 (H12)
- **Business impact:** Retention heartbeat; the shareable "look what it did" artifact.
- **Technical impact:** Weekly cron (Vercel) aggregating per-org calls/tickets/appointments +
  savings estimate → Resend template.
- **Dependencies:** R-008 email infra; R-018 (honest savings number).
- **Recommended solution:** Monday digest email with week-over-week deltas and deep links.

### R-018 — Dashboard data honesty pass
**Priority:** High · **Status:** Completed (2026-07-23; display-layer honesty — source-skew R-050/R-053 still separate) · **Effort:** S–M · **Related audit:** 01 (H13), 03
(Audit 03: completion-state analytics are additionally skewed at the source — `toolUsed` is
always false where tools are missing (R-050), and guardrail misfires (R-053) force healthy calls
to "partial". Fix the sources alongside the display.) Audit 06: the "Active Agents" widget label
also violates the "AI not agent" rule — fix with the R-065 terminology sweep.
- **Business impact:** Fabricated denominators and unexplained "Est. Savings" undermine every
  honest number; "Error" status on 70–90% answer rate confuses; "Active Agents" violates naming.
- **Technical impact:** `DashboardClient.tsx` mapping logic; `getDashboardOverview` metrics.
- **Dependencies:** None.
- **Recommended solution:** Methodology tooltip for savings; real totals from data (not derived
  from answer rate); status labels Healthy/Attention/Low; rename to "Active AI lines".
- **Completed 2026-07-23 (Sprint 2, code):** Display-layer honesty pass on the real dashboard
  (`lib/dashboard/getDashboardOverview.ts` + `DashboardClient.tsx`): (1) **fabricated denominator
  removed** — `agent_performance` now carries the server-computed `total_calls` (real
  `m.totalCalls`), and the client uses it directly instead of back-computing `handled/rate×100`;
  (2) **"Est. Savings" gets a methodology tooltip** (new `Widget` `info` prop) stating it's
  AI-handled call-time × $25/hr, illustrative; (3) **status labels de-jargoned** — the
  `AgentComplexTable` no longer shows an amber **"Error"** icon on healthy 70–90% calls; it renders
  honest **Healthy / Attention / Low** text badges; (4) **"Active Agents" → "Active AI lines"**
  ("AI not agent" rule, part of R-065). Build green, 73 tests green. **Also removed 2 confirmed-dead
  files** feeding a Potemkin version of this data (see R-034): the unused duplicate
  `app/(app)/dashboard/getDashboardOverview.ts` and `app/(app)/OperationalOverviewCard.tsx` (the
  latter hardcoded fake trends like "+12% vs last week" / "Stable" — no importers). **Not in scope
  (still open):** the *source-level* skew — `toolUsed`-always-false (R-050) and guardrail misfire
  (R-053) — which mislabel completion state upstream of the display.

### R-019 — Intent detection is a stub (everything becomes a ticket)
**Priority:** High · **Status:** Completed (2026-07-23, Sprint 4; code — live booking-call verify operator-gated) · **Effort:** M–L · **Related audit:** 00, 01 (H14), 03
(Audit 03: combined with R-050, booking currently has NO working path on most lines — the
deterministic appointment guarantee is dead code, and the mid-call tool is usually absent.)
- **Business impact:** The "booking" promise silently doesn't happen; appointment artifacts
  effectively unreachable without an explicit LLM tool call.
- **Technical impact:** `detectCallIntent` in the Vapi webhook returns `"other"` always; the
  deterministic-appointment path and persona selection depend on it.
- **Dependencies:** None; unblocks R-020.
- **Recommended solution:** Classify on final transcript (keyword/regex first, LLM classify
  later); wire `ensureAppointmentForCall` for appointment intent; log `[INTENT_DETECTED]` truthfully.
- **Completed 2026-07-23 (Sprint 4; owner chose AI-primary):** new `lib/intent/classifyCallIntent.ts`
  — **AI-primary** (OpenAI `gpt-4o-mini`, structured JSON `{intent, confidence, booking_details}`,
  `response_format: json_object`, temp 0, `maxRetries:0` + an **8s hard timeout** via `Promise.race`),
  with a **conservative regex fallback** (no transcript / no `OPENAI_API_KEY` / low confidence / any
  error). **Never throws.** Key insight: the old `detectCallIntent` ran at CALL START (no transcript)
  so it was structurally stuck on "other"; the real classification now runs at **end-of-call** on the
  final transcript, **updates `calls.intent`**, drives the appointment-vs-ticket routing (so
  `ensureAppointmentForCall` finally fires for booking calls — the promise works), and logs
  `[INTENT_DETECTED]` **truthfully** (source llm|regex|none + confidence). Installed the `openai` SDK.
  9 unit tests (LLM mocked; fallback/timeout/no-key/bad-JSON/never-throws), 139 total green; build
  green. **Operator-gated:** set `OPENAI_API_KEY` (without it, regex-only — safe) + verify a booking
  call creates an **appointment** (test-call protocol). Threading `booking_details` into structured
  appointment fields (vs the transcript notes) and an LLM-summarized subject are follow-ons.

### R-020 — No calendar integration for appointments
**Priority:** High · **Status:** Open · **Effort:** XL · **Related audit:** 01 (H14)
- **Business impact:** Appointments are inert rows; delivering real bookings is the
  "replaces a hire" upgrade.
- **Technical impact:** OAuth (Google first), availability lookup during calls (tool), event
  creation + caller confirmation.
- **Dependencies:** R-019; settings/integrations page (currently shell).
- **Recommended solution:** Google Calendar connect → availability tool for the agent →
  confirmed bookings with email/SMS confirmation to the caller.

### R-051 — Voice and language settings are decorative (never sent to Vapi)
**Priority:** High · **Status:** Completed (2026-07-23, Sprint 4; code — live test-call verify operator-gated) · **Effort:** M · **Related audit:** 03
- **Business impact:** The onboarding language step and the Settings voice/language pickers do
  not affect the actual call: no `voice` object is ever sent to Vapi (`"jennifer"` exists only in
  the DB), no `transcriber` is configured, and language reaches the call only as prompt text. A
  Spanish-configured agent listens through a default transcriber and speaks a default voice —
  the in-product sibling of R-004's "20+ languages" claim.
- **Technical impact:** Assistant creation payloads (`runActivation`, purchase route) and
  `syncAgentToVapi` omit `voice`/`transcriber` entirely (the sync's own comment concedes it).
- **Dependencies:** R-050's shared config-assembly helper is the natural home; voice preview UX
  is R-038.
- **Recommended solution:** Extend the shared assistant-config helper to set voice + transcriber
  (language) from agent settings on create AND sync; verify with test-call protocol scenario 7.
- **Confirmed live (2026-07-07, Sprint 1 Task 1):** every customer assistant has `voice: none`,
  `transcriber: none` (read-only API check).
- **Completed 2026-07-23 (Sprint 4, code):** extended the shared `buildAssistantConfigPatch`
  (`lib/vapi/assistantConfig.ts`) to always send a real **`voice`** (OpenAI TTS) + **`transcriber`**
  (Deepgram nova-2) driven by the agent **language** — launch **EN + ES** (`resolveLanguage` /
  `resolveVoice` / `resolveTranscriber`, pure + unit-tested). Wired `syncAgentToVapi` (passes
  `agent.language`) and `runActivation` (passes `settings.onboarding_language`); all paths inherit it
  via the R-050 helper. Non-fatal on failure. Per-agent voice PICKER remains R-038. 125 tests green.
  **Operator-gated:** verify on a live test call (voice + a Spanish line converses in Spanish); run
  `POST /api/internal/reconcile-vapi-assistants` to apply to existing assistants.

### R-021 — Raw upstream error strings shown to users
**Priority:** High · **Status:** Completed (2026-07-23, Sprint 3) · **Effort:** S–M · **Related audit:** 00
- **Business impact:** Supabase/Vapi errors verbatim in UI look broken and leak internals.
- **Technical impact:** Calls page, AddPhoneNumberModal, onboarding activation error paths.
- **Dependencies:** None.
- **Recommended solution:** Central `safeErrorMessage()` mapping; log detail server-side only
  (convention already in CLAUDE.md).
- **Completed 2026-07-23 (Sprint 3):** added pure, unit-tested `lib/errors/safeErrorMessage.ts` —
  maps a few clearly-safe categories (network/timeout, rate-limit, auth/session, permission) and
  otherwise returns a **generic fallback**, never the raw provider string. Applied to the three named
  leak points: `dashboard/calls/page.tsx` (was rendering raw Supabase `error.message`),
  `AddPhoneNumberModal` (was surfacing raw `data.error`), and `onboarding/page.tsx` (was showing raw
  `error.message` in the "Setup required" card) — each now logs full detail server/console-side and
  shows the safe message. 7 unit tests incl. a "never leaks a DB constraint string" guard (85 total
  green); build passing. **Follow-on (not this pass):** server actions that return `result.error`
  passthroughs (onboarding step handlers) should curate at the source; use `safeErrorMessage` at any
  future raw-error display site.

### R-022 — Landing redesign (hybrid dark SaaS) — approved, not built
**Priority:** High · **Status:** Open · **Effort:** XL · **Related audit:** 01 (context); spec `web/LANDING_REDESIGN_SPEC.md`
- **Business impact:** Repositioning + conversion lift; currently the active workstream.
- **Technical impact:** Rebuild `(marketing)` composition per spec; keep Spline hero; delete
  duplicate legacy marketing components while in there (part of R-034).
- **Dependencies:** R-004/R-007 honesty fixes land first (don't redesign a dishonest funnel).
- **Recommended solution:** Execute the spec (Magic MCP + ui-ux-pro-max per spec §0); scope-guard:
  dark system is landing-only.

### R-066 — Zero conversion instrumentation (the funnel is unmeasured)
**Priority:** High · **Status:** Open · **Effort:** M · **Related audit:** 07
- **Business impact:** No analytics of any kind exist, so no funnel stage can be measured
  (landing→demo→signup→verify→onboarding→paid→activated), no A/B test is possible, and the impact
  of every other roadmap fix is unquantifiable. Every growth hypothesis is untestable until this
  exists — the single highest-leverage growth investment.
- **Technical impact:** No PostHog/GA/Segment/Plausible/Mixpanel/Vercel-Analytics anywhere in
  `web/src`. Needs a client+server analytics layer and a defined event schema.
- **Dependencies:** Choose a provider (privacy posture matters — call transcripts are PII).
- **Recommended solution:** Add product analytics with a funnel event schema (page_view,
  demo_started/completed, signup_started/verified, onboarding_step_n, checkout_started,
  plan_activated, first_call_handled); dashboard the funnel before optimizing.

### R-067 — No SEO foundation (organic discovery near-zero)
**Priority:** High · **Status:** Completed (2026-07-23, Sprint 3) · **Effort:** M · **Related audit:** 07
- **Business impact:** Good marketing content (pricing, security, docs, use-cases, company) is
  undiscoverable: no robots/sitemap, every page shares one site-level title/description, no
  per-page OG/Twitter cards, no canonical tags, no JSON-LD. The entire organic channel for
  high-intent searches ("AI receptionist", "AI answering service for [trade]") is left on the table.
- **Technical impact:** Only `(marketing)/layout.tsx` + root `layout.tsx` set metadata (from
  `siteConfig`); no `robots.ts`/`sitemap.ts`/`manifest`; no per-page `generateMetadata`.
- **Dependencies:** Pairs with R-042 (changelog page as an indexable asset); coordinate with the
  landing redesign (R-022).
- **Recommended solution:** Per-page `generateMetadata` (title/description/OG/canonical),
  `robots.ts` + `sitemap.ts`, unique OG images, Organization/Product/FAQ JSON-LD.
- **Completed 2026-07-23 (Sprint 3):** added `app/robots.ts` (allow public, disallow app/admin/api;
  points to sitemap) and `app/sitemap.ts` (11 marketing routes with priorities). Enriched the **root**
  metadata with `metadataBase`, default `openGraph` + `twitter` cards, `robots: index/follow`, and a
  root canonical — so every page now emits proper social cards. Removed the redundant `(marketing)`
  layout title override so the `%s | Denku` template applies, and added **Organization + WebSite
  JSON-LD** to the marketing layout. Added **per-page `metadata`** (unique title/description +
  `alternates.canonical`) to pricing (via a route `layout.tsx`, since the page is a client component),
  security, use-cases, docs, support, about, and company. Build emits `/robots.txt` + `/sitemap.xml`;
  86 tests green. **Note:** all URLs derive from `siteConfig.url`, set to the canonical
  `https://www.denku.io` (owner decision 2026-07-23, resolving the denku.io/denku.ai inconsistency) —
  a single source for canonicals/sitemap/OG. **Follow-on:** unique per-page OG images and Product/FAQ
  JSON-LD (needs real content/assets).

### R-072 — Audit log covers system events, not user/security actions
**Priority:** High · **Status:** Open · **Effort:** M · **Related audit:** 10 (see R-057)
- **Business impact:** A procurement/SOC-2 blocker: the `audit_log` records billing/vapi/pause
  events but not logins, member add/remove/role-change, data access/export, or user-initiated
  plan/settings changes with actor attribution. Because platform admin is one shared credential
  (R-057), admin actions can't be tied to a person at all.
- **Technical impact:** `lib/audit/log.ts` + call sites cover ~12 system actions; needs
  user/security event coverage + actor attribution + export + tamper-evidence.
- **Dependencies:** R-057 (per-operator admin identity for real attribution).
- **Recommended solution:** Expand audit coverage to security-relevant user actions; make it
  exportable; attribute to individual users/admins.

### R-073 — No data lifecycle: export, deletion, or retention controls
**Priority:** High · **Status:** Open · **Effort:** L · **Related audit:** 10 (see R-049, R-004)
- **Business impact:** Denku stores call-transcript PII with no customer data export, no account/
  data deletion (the "Disable workspace" control is a no-op, R-049), and no configurable retention
  (marketing claims 30/90/custom retention that doesn't exist, R-004). Fails GDPR/CCPA data-subject
  rights and enterprise data-handling review.
- **Technical impact:** No export endpoint, no deletion flow (with Vapi/Stripe teardown), no
  retention/purge job; would also cap `webhook_debug`/`raw_payload` growth (R-032/R-068).
- **Dependencies:** R-049 (real disable/delete), R-004 (stop over-claiming retention).
- **Recommended solution:** Self-serve export (calls/tickets/transcripts), real deletion (hard-delete
  + external teardown + confirmation), configurable retention with automatic purge.

### R-075 — Billing computation lives in an unversioned DB object and is untestable
**Priority:** High · **Status:** Completed (2026-07-23, Sprint 3; math baselined + golden-mastered — `estimated_*` rename + finalize-from-source are follow-on) · **Effort:** M · **Related audit:** 12 (see R-031, R-037)
- **Business impact:** The most revenue-critical logic — usage → billable minutes → overage →
  total, i.e. exactly what customers are charged — runs in a DB view/RPC that is NOT in the repo, so
  it can't be reviewed or tested. A field named `estimated_overage_cost_usd`/`estimated_total_due_usd`
  is what gets billed via Stripe. Not proven wrong — but currently impossible to prove right, which
  for a usage-billed product is itself the risk (over-charge = trust-fatal; under-charge = margin
  leak).
- **Technical impact:** `close-month` / `create-draft-invoice` / `overage/collect-now` read the
  preview object; minute-derivation + rounding + netting are invisible (base schema/views not in
  repo — R-031).
- **Dependencies:** R-031 (baseline schema into repo), R-037 (tests).
- **Recommended solution:** Pull the preview view/RPC into `supabase/migrations`, document minute/
  rounding rules, add golden-master tests over boundary usage, and add a finalize-from-source step;
  rename `estimated_*` billed fields.
- **Completed 2026-07-23 (Sprint 3, via live read-only Supabase access):** read the actual prod
  billing chain with `pg_get_viewdef` and **baselined all 8 views** into
  `supabase/migrations/20260723100000_baseline_billing_usage_views.sql` (documentation baseline —
  NOT applied to prod; the views already exist there). Chain, bottom-up:
  `org_daily_concurrency_peak` → `org_daily_usage` → `org_monthly_usage` → (`plan_pricing`,
  `org_plan_limits`) → `org_monthly_overages` → `org_monthly_concurrency_compliance` →
  `org_monthly_invoice_preview`. **The rounding rule is now documented and proven:** `billable_minutes
  = Σ ceil(duration_seconds/60)` computed **per call** (every call rounds UP to a whole minute; only
  `ended_at IS NOT NULL` calls count); `estimated_overage_cost_usd = round(max(billable−included,0)×
  rate, 2)`; `estimated_total_due_usd = round(monthly_fee + overage_cost, 2)`. Plan constants are
  hardcoded in `plan_pricing`/`org_plan_limits` (149/400/0.22/1 · 399/1200/0.18/4 · 899/3600/0.13/10)
  — matches the CLAUDE.md non-negotiables. Added a pure **golden-master** `web/src/lib/billing/usageMath.ts`
  mirroring the SQL + 15 boundary tests (`billing-usage-math.test.ts`, incl. the per-call-ceil proof:
  three 10s calls bill 3 min, not 1). 101 tests green. Documented in `skills/database-schema.md`.
- **Follow-on (still open, not blocking):** (a) rename the billed `estimated_*` columns (a breaking
  prod change — code reads them); (b) a finalize-from-source step so month-close snapshots the math;
  (c) **R-076** COGS-vs-revenue reconciliation (now unblocked — the billed figure is in-repo). The
  base TABLES the views read are R-031 (full-schema baseline).

### R-056 — No HTTP security headers (CSP / HSTS / X-Frame-Options / etc.)
**Priority:** High · **Status:** Completed (2026-07-08; CSP report-only, enforce is follow-up) · **Effort:** S · **Related audit:** 04
- **Business impact:** Baseline miss that fails any customer/enterprise security review; dashboard
  is clickjackable, no TLS-downgrade protection, and any XSS has maximum blast radius on a product
  holding call-transcript PII.
- **Technical impact:** `next.config.ts`/`middleware.ts` set no `Content-Security-Policy`,
  `Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`.
- **Dependencies:** CSP needs an inventory of allowed origins (Spline, Vapi, Supabase, Stripe,
  fonts) — start report-only.
- **Recommended solution:** Add a headers policy (Next `headers()` or middleware); ship CSP in
  report-only first, then enforce.
- **Completed 2026-07-08 (Sprint 1 Task 8).** Added `headers()` to `web/next.config.ts` (applies
  to all routes, unlike the scoped middleware). **Enforced now:** `Strict-Transport-Security`
  (2y + includeSubDomains), `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(),
  microphone=(self), geolocation=()` (mic kept for the in-page Vapi/Daily demo call). **CSP shipped
  REPORT-ONLY** (`Content-Security-Policy-Report-Only`) so it never blocks — allowlist built from
  the origins the app actually loads (Google Fonts, Spline `prod.spline.design`, Vapi `api.vapi.ai`
  + Daily `*.daily.co` wss, Supabase `*.supabase.co` wss; Stripe included defensively though it's
  server-only today). Violations post to a new `POST /api/csp-report` collector (public, no DB,
  204). Verified locally: all six headers present on `/` and `/login`; report endpoint returns 204.
  **Remaining (follow-up, not this task):** watch `[CSP][REPORT_ONLY][VIOLATION]` logs on real
  traffic, tune the allowlist, then switch the header key to enforcing `Content-Security-Policy`
  (ideally with a per-request nonce to drop `'unsafe-inline'`).

### R-057 — Platform admin is a single shared, MFA-less Basic-Auth credential
**Priority:** High · **Status:** Open · **Effort:** M–L · **Related audit:** 04
- **Business impact:** One `ADMIN_USER`/`ADMIN_PASS` pair guards `/admin`, `/api/admin/*`, and the
  `/api/internal/*` repair endpoints with no per-operator identity, MFA, rotation, or attribution
  — admin actions can't be tied to a human in the audit log. Brute-forceable (R-030) and
  discoverable (R-002); also key-person/insider risk an acquirer prices in.
- **Technical impact:** `middleware.ts` Basic Auth + per-route backstops keyed on the same env pair.
- **Dependencies:** Pairs with R-045 (enterprise auth) and R-002 (stop leaking the username).
- **Recommended solution:** Move platform admin behind real per-operator auth (SSO or Supabase
  admin org + role) with MFA and attributed audit logging; retire the shared credential.
- **Owner decision (2026-07-23):** **Supabase Auth as the canonical IdP — NO SSO — built around
  organization membership, with MFA readiness.** So: platform operators are Supabase users; admin
  authorization derives from an org-membership/role model; structure for `aal2` (MFA) enforcement
  without requiring it day one.
- **BLOCKED for safe implementation (2026-07-23) — needs a staging env, not a decision.** The gate
  is `middleware.ts:13` Basic Auth (`ADMIN_USER`/`ADMIN_PASS`) over `/admin` + `/api/admin` (matcher),
  plus per-route `/api/internal/*` backstops. Swapping it to Supabase-session + platform-admin check
  is a **critical edge-middleware change that cannot be verified under read-only prod + no staging**:
  a bug locks out all operators or opens the admin surface, and there's a chicken-and-egg (an admin
  must be provisioned in the new model, via a prod-applied migration, BEFORE the flip). Not shipping
  blind. **Recommended safe rollout when a staging/preview env exists:** (1) migration for the
  platform-admin membership model + an `isPlatformAdmin(userId)` helper; (2) make middleware accept
  **either** Basic Auth **or** a Supabase-session platform-admin (additive, reversible) and verify on
  staging; (3) provision operators + enroll MFA; (4) require `aal2` for admin; (5) remove Basic Auth.
  Also attribute admin actions in the audit log (R-072). Left unbuilt to avoid half-wired auth.

### R-060 — Tenant isolation has no defense-in-depth (RLS not the enforcement layer)
**Priority:** High · **Status:** Open — **PARTIAL (2026-07-23): 7/10 tables locked via migration; anon-read 3 + query-helper remain** · **Effort:** L · **Related audit:** 04 (see also R-037)
- **Business impact:** The single largest *systemic* risk: correctness of tenant isolation rests
  entirely on a hand-written `.eq("org_id", …)` in every service-role query. One omitted filter in
  any future query = immediate cross-tenant breach, and no RLS or test (R-037) would catch it.
- **Technical impact:** Service-role client (`lib/supabase/admin.ts`) bypasses RLS everywhere;
  RLS policies exist on only a few tables. Distinct fix from R-037 (tests): add RLS + a
  can't-forget-to-scope query helper.
- **Dependencies:** Coordinate with R-037 (tests prove the policies); R-033 (client convergence).
- **Recommended solution:** Add RLS safety-net policies on tenant tables that can afford it; adopt
  a scoped-query helper (`orgScoped(table, orgId)`) so an unscoped query is hard to write; keep
  service-role only where genuinely needed.
- **Confirmed live (2026-07-08, via Supabase MCP against the prod DB):** Supabase's own advisor
  flags **10 public tables with RLS DISABLED** — fully exposed to the anon/authenticated
  PostgREST roles (anyone with the public anon key can read/write every row):
  `orgs`, `webhook_debug`, `audit_log_changes`, `personas`, `persona_tools`, `org_plan_overrides`,
  `billing_stripe_customers`, `billing_stripe_prices`, `billing_invoice_runs`,
  `onboarding_activation_lock`. `orgs` being open is a direct cross-tenant read/write exposure;
  `webhook_debug` being open contradicts what `skills/database-schema.md` claimed. **This is the
  concrete, worse-than-inferred form of R-060.** ⚠ Enable-only is not the fix (blocks the app) —
  needs enable **+ policies**. Deferred by owner to a dedicated security sprint; the new Instagram
  tables are, by contrast, correctly RLS-locked.
- **PARTIAL — done 2026-07-23 (Sprint 3, via live read-only inspection):** classified all 10 tables
  by client access (grep) + view dependency (`pg_depend`), and wrote
  `supabase/migrations/20260723110000_rls_backstop_service_role_tables.sql` enabling RLS + deny-all
  (⇒ service-role-only) on the **7 that are service-role-only and referenced by no view**:
  `webhook_debug`, `personas`, `persona_tools`, `onboarding_activation_lock`,
  `billing_stripe_customers`, `billing_stripe_prices`, `billing_invoice_runs`. Zero app impact
  (service_role bypasses RLS). **NOT applied to prod** (read-only access — operator applies + verifies;
  reversible). **Still OPEN — the hard part:** the **3 anon-read/view-backed tables** need *tested*
  SELECT policies: `orgs` (dashboard reads it via the anon client + feeds org_plan_limits/organizations
  views), `audit_log_changes` (audit viewer reads via anon), `org_plan_overrides` (feeds org_plan_limits;
  verify view security_invoker). Plus the `orgScoped(table, orgId)` query helper. Those need a
  branch/staging test (a wrong `orgs` policy blanks the dashboard) — not doable under read-only prod
  access. Migration ships policy sketches inline.

## MEDIUM

### R-023 — List ergonomics: pagination, search, export
**Priority:** Medium · **Status:** Open · **Effort:** L · **Related audit:** 01 (M15), 05, 08
(Audit 08: the pagination fix must not regress into fetch-everything — see R-068 for the
anti-pattern to avoid.)
- **Business impact:** Busy orgs hit the invisible 200-call cap in week one; no CSV for owners.
  Audit 05: there is ALSO no global/cross-entity search anywhere (no command palette) — findability
  collapses past a few hundred rows even within a single list.
- **Technical impact:** Server-side pagination on calls/tickets/leads; export endpoint; a
  cross-entity search surface (cmdk is already a dependency).
- **Dependencies:** None.
- **Recommended solution:** Cursor pagination + per-list search on calls & tickets; CSV export per
  filter; later, a global command-palette search across calls/tickets/leads.

### R-024 — Billing self-service depth
**Priority:** Medium · **Status:** Open · **Effort:** L · **Related audit:** 01 (M16)
- **Business impact:** Bill-shock complaints and support load; invisible cancel path erodes trust.
- **Technical impact:** Billing settings page (already 1,432 lines — extract, see R-043) +
  invoice history from `billing_invoice_runs`/Stripe; proration preview needs R-035.
- **Dependencies:** R-035 for proration; Stripe portal route exists for cancel.
- **Recommended solution:** Invoice history list, visible "Manage/cancel subscription" via Stripe
  portal, usage meter with threshold markers, plan-change preview.

### R-025 — Onboarding activation polish
**Priority:** Medium · **Status:** Open · **Effort:** M · **Related audit:** 01 (M17)
- **Business impact:** Provisioning hiccups currently surface raw errors at the highest-stakes moment.
- **Technical impact:** `runActivation` stages exist (assistant → tools → number → verify) — surface
  them; retry affordances already resume-safe.
- **Dependencies:** R-021 (error sanitization).
- **Recommended solution:** Staged progress UI + human recovery copy + support handoff on repeat failure.

### R-026 — Empty states as onboarding
**Priority:** Medium · **Status:** Open · **Effort:** S–M · **Related audit:** 01 (M18), 05
- **Business impact:** Empty dashboards waste the highest-intent moments. Audit 05: empty states
  are also *inconsistent* — tickets/appointments/calls use the shared `EmptyState`; leads uses a
  bare `<p>No leads found</p>`.
- **Technical impact:** `EmptyStatePanel` / `ui-horizon/empty` exist; apply uniformly with CTAs
  (fix the leads bare state).
- **Dependencies:** None.
- **Recommended solution:** Every list's empty state uses the shared component, teaches the next
  action, and shows the org's Denku number.

### R-027 — Dashboard Horizon-template ghost cleanup
**Priority:** Medium · **Status:** Open · **Effort:** M · **Related audit:** 01 (M19), 06
- **Business impact:** "Bought-not-built" perception (repurposed revenue charts, template statuses).
  Audit 06: same cohesion family as R-064 (settings vs dashboard visual split) — fix together for
  one intentional-looking authenticated app.
- **Technical impact:** Rename/re-skin `TotalSpent`/`WeeklyRevenue`/`AgentComplexTable` widgets.
- **Dependencies:** Pairs with R-018, R-064.
- **Recommended solution:** One pass to rename components/labels around call outcomes.

### R-028 — Mobile audit of the dashboard
**Priority:** Medium · **Status:** Open · **Effort:** M · **Related audit:** 01 (M20)
- **Business impact:** Owners live on phones; unknown state today.
- **Technical impact:** Audit calls list, ticket detail, paused banner, modals at 375px.
- **Dependencies:** None.
- **Recommended solution:** Fix top offenders; add mobile check to QA checklist template.

### R-029 — Demo call end-of-call UX
**Priority:** Medium · **Status:** Open · **Effort:** S · **Related audit:** 01 (M21)
- **Business impact:** 5-minute silent cutoff wastes a hot lead.
- **Technical impact:** `DemoCallButton` end handling.
- **Dependencies:** None.
- **Recommended solution:** Graceful spoken close + "Want this on your own number?" CTA on end.

### R-030 — Real rate limiting
**Priority:** Medium · **Status:** Open · **Effort:** M · **Related audit:** 00, 04
- **Business impact:** Demo abuse and endpoint hammering are uncapped in practice. Audit 04 made
  the security consequences concrete: **login has no throttle or lockout** (credential stuffing),
  the public contact form has no bot protection (spam), and demo-call minutes can be farmed
  (`webcall/event` is the only route that calls the no-op limiter).
- **Technical impact:** `lib/rateLimit.ts` in-memory Map is per-invocation on Vercel.
- **Dependencies:** Choose a store (Upstash Redis / Vercel KV) — new infra dependency.
- **Recommended solution:** KV-backed limiter for login (with lockout), demo start, tools routes,
  and the contact form (+ bot/captcha on public forms).

### R-031 — Database schema baseline + drift reconciliation
**Priority:** Medium · **Status:** Open · **Effort:** M · **Related audit:** 00, 12
(Audit 12: this now blocks R-075 — the billing computation lives in an unversioned DB view that
must be baselined here before the money math can be reviewed or tested.)
- **Business impact:** Environment cannot be rebuilt from the repo; onboarding new envs/devs is blocked.
- **Technical impact:** Snapshot live schema into a baseline migration; capture prod-only RPCs
  (`reconcile_call_cost`, TABLE-returning lease RPC); number all migration files.
- **Dependencies:** Access to the live Supabase project (note: workspace MCP points at the wrong
  project — see `skills/database-schema.md`).
- **Recommended solution:** `supabase db dump` → baseline; adopt timestamp naming rule (already in
  skills doc).

### R-032 — Strip debug artifacts from production paths
**Priority:** Medium · **Status:** Open · **Effort:** S–M · **Related audit:** 00, 08
- **Business impact:** Log noise buries real incidents; double debug-writes add latency/cost.
  Audit 08 (performance): the webhook inserts `webhook_debug` twice per event AND stores the full
  `raw_payload` on both `webhook_debug` and `calls` → write amplification + unbounded storage
  growth (no retention); the stored blob is what R-068 later re-fetches. Add a retention policy.
- **Technical impact:** Webhook double `webhook_debug` insert, `### HIT ROUTE ###`, `TEMP DEBUG`,
  `DEBUG time filter`, verbose console.logs.
- **Dependencies:** None.
- **Recommended solution:** Single debug insert behind an env flag; sweep TEMP DEBUG logs; add
  `webhook_debug` retention job.

### R-033 — Converge duplicate Supabase admin clients
**Priority:** Medium · **Status:** Completed (2026-07-23, Sprint 3) · **Effort:** S · **Related audit:** 00
- **Business impact:** Indirect — inconsistent fail-fast behavior risks silent misconfig.
- **Technical impact:** Migrate ~10 `@/lib/supabaseAdmin` imports (incl. middleware) to
  `@/lib/supabase/admin`; delete the old module.
- **Dependencies:** None.
- **Recommended solution:** Mechanical migration + delete; rule already in CLAUDE.md.
- **Completed 2026-07-23 (Sprint 3):** migrated all **10** importers (verified: all server-side, no
  client components) from `@/lib/supabaseAdmin` → `@/lib/supabase/admin` and **deleted the old
  module** (`lib/supabaseAdmin.ts`). Middleware included — build confirms it compiles on the
  `server-only` fail-fast client with no edge-runtime issue. 78 tests green; build passing. CLAUDE.md
  landmine #4 note updated (single admin client; don't reintroduce a second).

### R-034 — Delete dead weight from the repo
**Priority:** Medium · **Status:** Completed (2026-07-23, Sprint 3; marketing-dedupe folded into R-022) · **Effort:** S · **Related audit:** 00
- **Business impact:** Confuses every new contributor/session; repo bloat.
- **Technical impact:** Root `src/` legacy MVP, `vercel_diff_report_*.txt`, `tsconfig.tsbuildinfo`,
  duplicate legacy marketing components (coordinate with R-022).
- **Dependencies:** Confirm nothing references root `src/` (nothing does).
- **Recommended solution:** Remove; add `tsconfig.tsbuildinfo` to `.gitignore`.
- **Partial progress (2026-07-23, Sprint 2 during R-018):** removed 2 confirmed-dead files (no
  importers, grep-verified): `web/src/app/(app)/dashboard/getDashboardOverview.ts` (unused duplicate
  of the live `lib/dashboard/getDashboardOverview.ts`) and `web/src/app/(app)/OperationalOverviewCard.tsx`
  (a Potemkin card with hardcoded fake trends). Root `src/` legacy MVP + the other items remain.
- **Completed 2026-07-23 (Sprint 3):** deleted the repo-root **legacy MVP `src/`** (13 tracked files —
  old admin panel + tool routes; confirmed dead: no root `package.json`, `web/` is self-contained,
  nothing references it) and the 164KB `vercel_diff_report_2026-01-08_13-48.txt`. `*.tsbuildinfo` was
  already gitignored + untracked (no change needed). 78 tests green. **Remaining, folded into R-022:**
  the "duplicate legacy marketing components" are NOT dead yet (the marketing site still renders them);
  they're removed during the landing redesign, not here — deleting them now would break live pages.

### R-035 — Migrate Stripe checkout to catalog Prices
**Priority:** Medium · **Status:** Open · **Effort:** M–L · **Related audit:** 00
- **Business impact:** Prerequisite for annual billing (R-005), sane proration (R-024), coupons.
- **Technical impact:** Create Products/Prices (incl. annual), switch checkout + plan-change to
  price IDs / lookup_keys; map in `billing_plan_catalog`.
- **Dependencies:** Stripe dashboard setup.
- **Recommended solution:** Add `stripe_price_id`(+annual) columns to `billing_plan_catalog`;
  keep `price_data` fallback during migration.

### R-036 — Finish the orgs / organizations_legacy migration
**Priority:** Medium · **Status:** Open · **Effort:** M · **Related audit:** 00
- **Business impact:** Indirect — dual-writes are a standing source of subtle bugs.
- **Technical impact:** Repoint `organization_settings.org_id` FK to `orgs`, drop dual-writes,
  then drop legacy table + VIEW; also unify the two org-creation paths.
- **Dependencies:** R-031 (schema in repo first).
- **Recommended solution:** FK migration → remove legacy writes from signup/ensureDefaultOrg →
  drop legacy artifacts.

### R-037 — Test suite foundation + CI
**Priority:** Medium · **Status:** Completed (2026-07-07) · **Effort:** L · **Related audit:** 00, 04, 11, 12
- **Business impact:** Tenant isolation is discipline-only today; one missed org filter is a
  cross-tenant leak with no safety net. Audit 04: pair this with R-060 (RLS backstop) — tests
  prove the policies and catch unscoped queries; neither alone is sufficient. Audit 11: tests are
  step 1 of the refactor-sequencing plan (characterization tests before touching monster files).
  Audit 12: golden-master tests over the billing math (R-075) are how "estimated" charges get
  proven correct.
- **Technical impact:** No tests, no CI. Add vitest + a CI workflow (build, lint, test).
- **Dependencies:** None.
- **Recommended solution:** First three suites: org-scoping on API routes, Vapi webhook
  idempotency (same `vapi_call_id` twice), lease acquire/release at limit.
- **Completed 2026-07-07 (Sprint 1 Task 3):** vitest added to `web/` (`npm run test`), config at
  `web/vitest.config.ts` (node env, `@`/`server-only` aliases, all Supabase access mocked — no
  live DB). Three seed suites under `web/test/` (19 tests, green): `concurrency-leases.test.ts`
  (acquire at limit / paused / rpc_no_row / fallback; idempotent release),
  `webhook-idempotency.test.ts` (the deterministic-artifact check-then-insert path via
  `checkCallGuardrails` — repeated event ⇒ no duplicate ticket; determinism; never-throw; plus an
  R-053-misfire characterization), `org-scoping.test.ts` (read/write/update all carry
  `.eq("org_id", …)`). CI at `.github/workflows/ci.yml` runs the suite on every push/PR (blocking);
  lint runs non-blocking (216 pre-existing errors = tracked debt); **Vercel remains the build
  gate.** *Honest scope:* org-scoping is verified on representative importable lib functions (not
  every API route), and the calls-table upsert-on-`vapi_call_id` idempotency is verified
  structurally but not yet integration-tested — a route-level webhook test awaits testability
  refactor (R-043/R-074). Foundation to expand suite-by-suite as those land.

### R-058 — Unauthenticated state-changing endpoint: `billing/checkout/complete`
**Priority:** Medium · **Status:** Open · **Effort:** S · **Related audit:** 04
- **Business impact:** An org-mutating endpoint (activates a plan) with no session auth — trusts a
  client-supplied `session_id` and the Stripe metadata it resolves. Exploitability is bounded (a
  valid `cs_...` id is required and only a genuinely-paid plan activates), so not critical, but
  it's an unauth state change and doubles the activation surface (duplicates onboarding-page logic).
- **Technical impact:** `api/billing/checkout/complete/route.ts` reads `session_id` from body,
  no `auth.getUser()`.
- **Dependencies:** None.
- **Recommended solution:** Require session auth and verify the session's org matches the caller's
  org; or remove the route and rely on the (already idempotent) onboarding-page fallback + webhook.

### R-059 — Tool routes use a static, unrotatable secret and route by attacker-influenced input
**Priority:** Medium · **Status:** Open · **Effort:** M · **Related audit:** 04
- **Business impact:** `x-denku-secret` is a single shared value with no rotation/per-caller scope;
  the org a ticket lands in is derived from call-payload `to_phone`/contact lookups. With R-001
  open, anyone forging webhook events (or holding the static secret) can write into arbitrary orgs.
- **Technical impact:** `api/tools/*` `checkAuth` (static env compare) + `deriveOrgIdFromContact`.
- **Dependencies:** R-001 (removes the primary forge vector).
- **Recommended solution:** Rotatable/scoped tool credentials; bind org to the authenticated call
  context rather than trusting `to_phone`; fix R-001.

### R-047 — Dashboard support is a dead end (Help → marketing contact form)
**Priority:** Medium · **Status:** ✅ Completed 2026-07-24 (Sprint 6 L4) · **Effort:** S–M · **Related audit:** 02 (Persona 3)
> Fixed: dashboard "Help / Support" is now a working `mailto:` to `NEXT_PUBLIC_SUPPORT_EMAIL`
> (default support@denku.io — set a monitored inbox; preflight warns until set); the `/contact` form's
> silent no-op submit now actually emails the team; misleading "MVP-ready" copy removed. `lib/support.ts`.
- **Business impact:** At $149–899/mo, "Help / Support" dropping a logged-in customer onto the
  public marketing contact form (`ProfileDropdown` → `/contact`) is below the floor — no in-app
  help, no docs from the dashboard, and the support tiers promised on the marketing site (R-004)
  route nowhere. Support experience is a top-3 churn/renewal factor for SMB SaaS.
- **Technical impact:** `components/horizon-shell/ProfileDropdown.tsx` link target; no support
  surface exists in `(app)`.
- **Dependencies:** R-004 decides what support tiers are honestly promised.
- **Recommended solution:** Minimum: an in-dashboard support page (contact form that includes
  org/plan context + response-time expectation) and a real help link; later: plan-tiered routing.

### R-048 — Loading states are unpolished; one is a shipped debug leftover
**Priority:** Medium · **Status:** Completed (2026-07-23, Sprint 3; loading skeletons — sterile error.tsx boundaries left to a live-verified pass) · **Effort:** S–M · **Related audit:** 02 (Persona 3)
- **Business impact:** Perceived quality — data-heavy pages flash bare spinners; phone-lines shows
  a literal unstyled `Loading…` div (comment: "Temporarily sterile for debugging route hang
  issues"). Premium products load with structure-preserving skeletons.
- **Technical impact:** `dashboard/phone-lines/loading.tsx` (debug leftover),
  `dashboard/loading.tsx` and siblings (spinner-only); no skeleton components in use despite
  Horizon patterns supporting them.
- **Dependencies:** None.
- **Recommended solution:** Replace the debug leftover; adopt one skeleton pattern for list/detail
  pages (cards + table rows), spinner only for sub-second actions.
- **Completed 2026-07-23 (Sprint 3):** added reusable `components/ui/Skeleton.tsx` (`Skeleton`,
  `TableSkeleton`, `StatCardsSkeleton` — `animate-pulse`, `role="status"`/`sr-only` for AT). Replaced
  the sterile phone-lines `Loading…` debug leftover with a `TableSkeleton`; upgraded the spinner-only
  `dashboard/loading.tsx` (stat-cards + table skeleton mirroring the real layout) and
  `appointments/loading.tsx` (table skeleton). Confirmed imports in `loading.tsx` are safe (the other
  loaders already import + work — the "NO IMPORTS / route hang" caution was stale). Build green.
  **Left out (intentional):** the sterile `phone-lines/error.tsx` boundaries — deleting them so they
  inherit the new shared boundary (R-061) is a live-behavior change (their comment cited a route
  hang); do it with a real prod check, not blind.
**Priority:** Medium · **Status:** Completed (2026-07-08) · **Effort:** S (remove) / M (implement) · **Related audit:** 02 (Persona 3)
- **Business impact:** A safety-critical control that's theater: the customer types DISABLE,
  confirms, and receives "Workspace disable is not yet available in MVP." Same trust family as
  R-046. Also: no account/data deletion path exists at all (enterprise/GDPR side tracked in
  R-045).
- **Technical impact:** `settings/workspace/general/_components/DangerZoneCard.tsx` — handler is a
  TODO that surfaces an error string.
- **Dependencies:** Real implementation would use the existing pause machinery
  (`enforceTelephonyPause`) + Stripe subscription cancel.
- **Recommended solution:** Short term: remove the card (never ship a fake destructive control).
  Later: implement disable = pause + cancel + export offer, with the existing typed-confirmation UX.
- **Completed 2026-07-08 (Sprint 1 Task 7):** deleted `DangerZoneCard.tsx`. Note discovered while
  fixing: the component was already **orphaned** — not rendered by the general settings page (which
  renders the *real* `WorkspaceControlsCard` pause/resume), so the fake "not yet available in MVP"
  control wasn't actually reachable; the file is now gone so it can't be re-wired. Real
  disable/delete (pause + Stripe cancel + data export) remains future work — see R-073.

### R-052 — No duration/silence/abuse caps on paid-line calls
**Priority:** Medium · **Status:** Completed (2026-07-23, Sprint 4; code — live verify operator-gated) · **Effort:** S–M · **Related audit:** 03
- **Business impact:** A prank, pocket-dial, or hostile caller can burn unbounded billable
  minutes toward a customer's overage (and toward the hard-cap pause, R-009). Compounding
  technical effect: the concurrency lease TTL is 15 minutes, so calls longer than that silently
  stop counting against the org's concurrency limit while still accruing minutes.
- **Technical impact:** Assistants are created with no `maxDurationSeconds`, silence timeout, or
  closing behavior — Vapi defaults, uncapped. Lease TTL interplay in `lib/concurrency/leases.ts`.
- **Dependencies:** R-050's shared config helper (same payload); product decision on the cap
  (e.g. 15 min default, configurable).
- **Recommended solution:** Set sane per-assistant duration/silence caps with a graceful spoken
  closing; align lease TTL with the max duration; expose the cap in agent settings later.
- **Confirmed live (2026-07-07, Sprint 1 Task 1):** `maxDurationSeconds` and
  `silenceTimeoutSeconds` are unset on every live assistant (read-only API check).
- **Completed 2026-07-23 (Sprint 4, code):** `buildAssistantConfigPatch` now **always** sets
  `maxDurationSeconds: 900` (15-min hard cap) + `silenceTimeoutSeconds: 30` on every config path
  (`CALL_MAX_DURATION_SECONDS`/`CALL_SILENCE_TIMEOUT_SECONDS`), so no line is uncapped. Unit-tested.
  The 15-min cap intentionally matches the concurrency lease TTL (the interplay noted above). Existing
  assistants pick it up via the reconcile pass. Exposing the cap in agent settings is a later option.
  **Operator-gated:** verify a call closes at the cap / after 30s silence (test-call protocol).
**Priority:** Medium · **Status:** Completed (2026-07-23, Sprint 3) · **Effort:** S · **Related audit:** 03
- **Business impact:** GR-1 ("repeat slot") counts phone/email vocabulary across the WHOLE
  transcript — both speakers — so a normal exchange ("What's your phone number?" / "My phone
  number is…") triggers it: healthy calls get force-marked "partial" with forced tickets,
  polluting completion analytics (feeds R-018). The demo off-topic list includes "how to make",
  flagging callers who ask "how to make an appointment" as demo abuse.
- **Technical impact:** `lib/guardrails/call-guardrails.ts#detectRepeatSlotRequest` (transcript-
  wide regex counting); `hasOffTopicContent` keyword list in the Vapi webhook.
- **Dependencies:** None.
- **Recommended solution:** Count slot-asks on AI-attributed lines only (require 2+ *agent*
  asks); remove/narrow the "how to make" keyword. Keep the guardrail philosophy (deterministic,
  idempotent, never-throw) intact.
- **Completed 2026-07-23 (Sprint 3):** rewrote `detectRepeatSlotRequest` to **split the transcript
  into speaker segments** (by `AI:`/`Assistant:`/`Agent:`/`User:`/… labels, robust to inline or
  newline turns) and count phone/email **asks in AGENT segments only**, triggering on 2+ separate
  agent asks. A caller volunteering their number no longer counts. Removed `'how to make'` from
  `hasOffTopicContent` (it flagged "how to make an appointment"). Philosophy preserved
  (deterministic/idempotent/never-throw). The prior R-053 **characterization** test (which locked the
  buggy both-speaker behavior) was replaced on purpose with two regression tests: healthy 1-ask call
  → no trigger; genuine 2-agent-ask loop → still triggers. 86 tests green; build passing. This also
  de-skews completion analytics at the source (was feeding R-018's display).

### R-054 — No business-hours awareness or after-hours behavior
**Priority:** Medium · **Status:** Open · **Effort:** M–L · **Related audit:** 03
- **Business impact:** "24/7" is the marquee pitch, but the agent doesn't know it's 2 AM: no
  hours config, no after-hours greeting, no voicemail-style capture framing, no "we'll call you
  back when we open." For SMBs, night/weekend handling is the headline use case.
- **Technical impact:** `isOutsideBusinessHours` in the Vapi webhook is a stub returning "inside
  hours" always; no config structure exists.
- **Dependencies:** R-013 (business-context onboarding is where hours get collected); timezone
  already stored per agent.
- **Recommended solution:** Collect hours in onboarding/settings; vary greeting + prompt behavior
  after hours; tag after-hours calls for the dashboard and digest (R-017).

### R-055 — Call artifacts read like debug logs, not work items
**Priority:** Medium · **Status:** Open · **Effort:** S–M · **Related audit:** 03, 06
(Audit 06: the `[Agent]` header also violates the "AI not agent" rule — fold into the R-065
terminology sweep.)
- **Business impact:** The ticket is the screen a business reads every day, and it opens with
  internal jargon — `[Agent] support_en`, `[Vapi] <call-id>` (also violating the "AI, not agent"
  naming rule) — under one of four crude subjects ("Support Request" for a gas-leak call), over a
  raw transcript dump. The artifacts' reliability (a genuine strength) is squandered by their
  readability.
- **Technical impact:** `buildTicketSubject` / `buildTicketDescription` in the Vapi webhook;
  display in tickets pages.
- **Dependencies:** None for the rewrite; a later LLM-summarized subject/summary would depend on
  R-019's classification pass.
- **Recommended solution:** Human-first format: caller + reason as subject, structured summary
  (name/number/need/urgency) above the transcript, internal IDs moved to collapsed metadata
  (the calls detail page already has that pattern).

### R-070 — Accessibility: operable/structural gaps (skip link, ARIA, focus)
**Priority:** Medium · **Status:** Completed (2026-07-23, Sprint 3; structural core — modal focus-trap sweep is follow-on) · **Effort:** M · **Related audit:** 09
- **Business impact:** No skip-to-content link, ~27 `aria-*` across ~250 files, unverified modal
  focus management, some unlabeled icon-only controls → keyboard/screen-reader users are second-
  class; also a VPAT/enterprise-procurement gap (R-045/Audit 10).
- **Technical impact:** Layouts lack skip links; custom tabs/dropdowns/toggles lack roles/states;
  bespoke modals (AddPhoneNumberModal, LiveAgentModal, demo overlay) need focus-trap/return verify.
- **Dependencies:** None.
- **Recommended solution:** Skip link + verified landmarks; ARIA roles/states on interactive
  components; standardized modal focus handling. Preserve the existing `prefers-reduced-motion` win.
- **Completed 2026-07-23 (Sprint 3) — structural core:** added a **skip-to-content link** as the
  first focusable element in `HorizonShell` (visible only on keyboard focus) targeting the main
  region, which now has `id="main-content"` + `tabIndex={-1}` (proper `<main>` landmark + focus
  target). Fixed a non-semantic icon control: the mobile sidebar close was a `<span onClick>` (not
  keyboard-operable, unlabeled) → now a `<button type="button" aria-label="Close menu">`. The R-062
  toast region also ships an `aria-live="polite"` landmark so status/errors are announced. Build
  green. **Follow-on (still open, tracked here):** a standardized modal focus-trap/return for the
  bespoke modals (AddPhoneNumberModal, LiveAgentModal, demo overlay) and a fuller ARIA
  roles/states sweep on custom tabs/dropdowns/toggles — larger, warrants dedicated a11y verification
  (measured contrast is R-071).

### R-071 — Accessibility: perceivable gaps + unmeasured contrast
**Priority:** Medium · **Status:** Open · **Effort:** M · **Related audit:** 09
- **Business impact:** Bone/teal + Horizon palettes have low-contrast secondary text (unmeasured
  against AA); some inputs use placeholder-as-label; charts have no text alternative; toasts/banners
  aren't announced (`aria-live`). Excludes AT users from analytics and confirmations.
- **Technical impact:** Contrast tokens (`#6B7888` on bone, navy-on-white); filter/search inputs;
  ApexCharts canvas; bespoke toasts (R-062).
- **Dependencies:** R-062 (toast system) for the live-region fix.
- **Recommended solution:** Measure + fix contrast to AA; persistent labels; chart data-table
  alternatives; `aria-live` on status messages.

### R-074 — Type safety eroded on the critical path (`any` in the webhook)
**Priority:** Medium · **Status:** Open · **Effort:** M · **Related audit:** 11 (see R-060, R-037)
- **Business impact:** The 3,141-line Vapi webhook — which processes money, artifacts, and tenancy —
  has ~30 `any`/`as any` usages; TypeScript gives near-zero protection on the one path where a wrong
  field/shape causes silent cross-tenant or billing errors. Compounds R-060 (no isolation backstop)
  and R-037 (no tests): the critical path has neither types, tests, nor RLS.
- **Technical impact:** `api/webhooks/vapi/route.ts` threads `any` payloads through extraction/merge/
  DB writes.
- **Dependencies:** Enables the safe extraction in R-043 (sequence: types before refactor).
- **Recommended solution:** zod-parse the Vapi payload at the boundary, thread typed models inward;
  lint-forbid `any` in `api/webhooks/**` and `lib/billing/**` once landed.

### R-076 — No reconciliation between Vapi cost (COGS) and customer minute-billing (revenue)
**Priority:** Medium · **Status:** Completed (2026-07-23, Sprint 3; ops email/dashboard surfacing is follow-on) · **Effort:** M · **Related audit:** 12
- **Business impact:** Denku pays Vapi per `calls.cost_usd` but bills customers per `billable_minutes
  × rate` — two independent numbers with nothing reconciling them or checking summed billed minutes
  against Vapi-reported durations. Margin can erode silently; a minutes-derivation bug (R-075) is
  invisible with no cross-check against known-good cost.
- **Technical impact:** No job compares Σ`cost_usd` vs billed revenue, or Σ`duration_seconds` vs
  Σ`billable_minutes`.
- **Dependencies:** R-075 (the billed figure must be in-repo to reconcile against).
- **Recommended solution:** Monthly reconciliation (COGS vs revenue, durations vs billed minutes)
  with a variance-threshold alert to ops.
- **Completed 2026-07-23 (Sprint 3, unblocked by R-075):** `lib/billing/reconciliation.ts` reads the
  baselined `org_monthly_invoice_preview` view and, per org-month, computes **margin = revenue
  (`estimated_total_due_usd`) − COGS (`total_cost_usd`)** + margin %, classifying `negative` / `thin`
  (< 25%) / `ok`. A monthly cron `api/billing/cron/reconcile` (CRON_SECRET; `vercel.json` `30 1 1 * *`)
  logs structured `[BILLING][RECONCILE][…]` events (WARN on negative/thin, plus a SUMMARY). Pure
  `computeMargin`/`classifyMargin` unit-tested (116 total green); build green. (Duration-vs-billed is
  a definitional identity in the current schema — `billable = Σceil(sec/60)` — so the meaningful
  cross-check is the COGS↔revenue margin.) **Follow-on:** surface alerts to an ops email/dashboard
  (currently structured logs only) once an ops recipient exists.

### R-068 — Analytics over-fetches (full `raw_payload` per call, no cap, in-memory aggregation)
**Priority:** Medium (grows to High) · **Status:** Open · **Effort:** M · **Related audit:** 08
- **Business impact:** The most-used report gets slower and more expensive the more a customer uses
  the product — the worst possible scaling shape. Multi-MB transfer + proportional server
  memory/time per analytics load on busy orgs; Supabase egress cost scales with the blob, not the
  metric.
- **Technical impact:** `lib/analytics/queries.ts#fetchCalls` selects `raw_payload` (entire Vapi
  report) for every call in range with no `.limit()`; the analytics page reduces current + compare
  periods in JS. Compounds R-032 (the same blob is stored twice, then re-fetched here).
- **Dependencies:** None.
- **Recommended solution:** Select only aggregation columns (drop `raw_payload`); push counts/sums
  to SQL (RPC/aggregate); cap or pre-aggregate long ranges (rollups).

### R-069 — Client bundle weight (Spline WebGL + two animation libs + ApexCharts)
**Priority:** Medium · **Status:** Open · **Effort:** M · **Related audit:** 08
- **Business impact:** The landing — the first-impression, highest-traffic page the Growth audit
  needs to convert — carries a multi-MB Spline WebGL runtime as its LCP element plus **both** gsap
  and framer-motion (redundant). Slower LCP + mobile data cost directly tax conversion.
- **Technical impact:** `@splinetool/react-spline` on the hero; `gsap` AND `framer-motion` both in
  deps and imported; `apexcharts` heavy on dashboard (dynamic). `@next/bundle-analyzer` already
  wired (`ANALYZE=true`).
- **Dependencies:** None.
- **Recommended solution:** Defer/gate Spline with a poster fallback; consolidate to one animation
  library; confirm per-chart code-split; verify with bundle analyzer.

### R-061 — Runtime errors unhandled on almost every dashboard route
**Priority:** Medium · **Status:** Completed (2026-07-23, Sprint 3) · **Effort:** S–M · **Related audit:** 05
- **Business impact:** Only the phone-lines area has error boundaries; calls/tickets/leads/
  appointments/analytics/usage/settings have none, so a thrown error shows the raw Next.js error
  screen mid-dashboard — a trust event for software a business runs its phone line on. Compounds
  R-021 (raw error strings).
- **Technical impact:** Missing `error.tsx` across dashboard routes; only `phone-lines/error.tsx`
  + `phone-lines/[lineId]/error.tsx` exist.
- **Dependencies:** None.
- **Recommended solution:** One shared error boundary at the dashboard layout level with calm
  recovery (retry / contact support); every route inherits it.
- **Completed 2026-07-23 (Sprint 3):** added `web/src/app/(app)/dashboard/error.tsx` — a shared,
  on-brand (Horizon) client error boundary inherited by every dashboard segment lacking its own
  (calls/tickets/leads/appointments/analytics/usage/settings). Calm card: "Something went wrong",
  Try-again (`reset()`) + Back-to-dashboard, **no raw error message shown** (logs full detail to
  `[DASHBOARD][ERROR_BOUNDARY]`, surfaces only the `digest` as a support reference — R-021 aligned).
  Build green. Note: the pre-existing `phone-lines/error.tsx` is a sterile debug leftover — its
  cleanup stays under R-048.

### R-062 — No consistent feedback/confirmation model for actions
**Priority:** Medium · **Status:** Completed (2026-07-23, Sprint 3; primitive shipped + first adoption, blanket rollout incremental) · **Effort:** M · **Related audit:** 05
- **Business impact:** "Did my action work?" is answered differently on every screen — bespoke
  local toasts (`PhoneLinesClient`), `window.location.reload()` (invite form, jarring), or silence.
  Destructive actions inconsistently guarded. Reads as unpolished; premium tools have one feedback
  language.
- **Technical impact:** No shared toast/notification primitive; per-page ad-hoc state.
- **Dependencies:** Pairs with R-021 (error half).
- **Recommended solution:** Adopt one toast/confirmation primitive; standardize success/failure +
  destructive-confirm across all mutations.
- **Completed 2026-07-23 (Sprint 3):** built a dependency-free toast primitive
  `components/ui/toast/ToastProvider.tsx` (`useToast()` → `toast/success/error`; auto-dismiss;
  portal; **`aria-live="polite"` region** so screen readers announce results — also closes part of
  R-070/R-071's live-region gap). Mounted once in `dashboard/layout.tsx` so every dashboard mutation
  can use it. Converted the named jarring site — `InviteMemberForm` — from `window.location.reload()`
  to `toast.success(...)` + `router.refresh()`, routing its error path through `safeErrorMessage`
  (R-021). Build green, 85 tests. **Incremental follow-on (tracked here, not blocking):** migrate the
  remaining ad-hoc mutation feedback (e.g. `PhoneLinesClient` bespoke toasts) to this primitive as
  those files are touched; add a shared destructive-confirm on top of it. NB: the invite endpoint
  itself is still broken (Basic-Auth namespace collision, **R-010**) — unchanged here.

### R-063 — "Agents" managed in two disconnected places
**Priority:** Medium · **Status:** Open · **Effort:** M · **Related audit:** 05
- **Business impact:** The central object (the AI) can be managed at both `/dashboard/agents` and
  `/dashboard/settings/agents` — two page trees, two UIs, neither in the sidebar. Customers can't
  form a stable "where do I manage my AI" model; discoverability suffers.
- **Technical impact:** Duplicated agent page trees; the config they edit is what silently strips
  tools (R-050) and carries the naming inconsistency (R-065).
- **Dependencies:** Coordinate with R-050 (config assembly) and R-065 (naming).
- **Recommended solution:** One canonical AI-management home; redirect the other; surface it
  consistently (sidebar or a clear settings entry).

### R-064 — The authenticated app looks like two products (dashboard vs settings)
**Priority:** Medium · **Status:** Open · **Effort:** M–L · **Related audit:** 06
- **Business impact:** Dashboard/calls/tickets/analytics use Horizon (navy, `brand-500`,
  `background-100`); the settings tree uses shadcn/zinc (`rounded-2xl border-zinc-200`, zinc text).
  Crossing from Analytics into Settings changes card shape, borders, shadows, and type color with
  no transition — "assembled from parts," undercutting the premium perception the pricing demands.
- **Technical impact:** shadcn primitives (system #3) grew into full-page settings layouts they
  weren't meant to own; ~29 settings files use zinc styling vs ~25 dashboard files on Horizon.
- **Dependencies:** None; pairs with R-027 (Horizon ghosts).
- **Recommended solution:** One app chrome for the whole authenticated product (Horizon, the
  intended dashboard system); reskin settings pages to it; keep shadcn for form controls only.

### R-065 — Inconsistent product vocabulary in customer-facing UI
**Priority:** Medium · **Status:** Completed (2026-07-23, Sprint 3; `[Agent]` ticket-artifact headers remain under R-055) · **Effort:** S–M · **Related audit:** 06 (see R-018, R-055)
- **Business impact:** Denku's own rule is "AI, not agent" outside Settings/Advanced, yet the
  product speaks four dialects for one thing: "AI employee" (marketing), "agent" / "Active Agents"
  widget (dashboard, R-018), `[Agent]` ticket headers (R-055), "assistant" (settings/code). Reads
  as unpolished and makes the product hard to talk about.
- **Technical impact:** Copy across dashboard widgets, ticket builders, settings; needs a
  terminology sweep + a lint-able rule in `skills/design-system.md`.
- **Dependencies:** Ties to R-018 and R-055 (fix together).
- **Recommended solution:** Settle one customer-facing noun ("AI employee"), enforce everywhere
  outside the Settings/Advanced carve-out, document as a rule.
- **Completed 2026-07-23 (Sprint 3):** swept the customer-facing dashboard surfaces to "AI":
  call-detail `[callId]` ("Agent Context"→"AI Context", the metadata "Agent" label→"AI", transcript
  AI-speaker label "Agent"→"AI", derived insights "Agent asked…"→"AI asked…"), ticket-detail "Agent"
  label→"AI", and the dashboard widget "Agent Performance"→"AI Performance" with an "AI" column header
  (building on R-018's "Active AI lines"). Verified no `>Agent<` customer-facing text remains in those
  files; code identifiers (`agent_id`, `AgentComplexTable`, `/dashboard/agents`) and the Settings →
  Agents/Advanced carve-out are intentionally unchanged. Rule strengthened + made explicit in
  `skills/design-system.md`. Build green. **Remaining sibling:** the `[Agent]` prefix in
  webhook-built ticket subjects/descriptions is **R-055** (separate — it's artifact-format work).
**Priority:** Medium · **Status:** Open · **Effort:** S · **Related audit:** — (filed 2026-07-22, Sprint 1.5 closure)
- **Business impact:** If a user grants a subset of the requested Instagram permissions, Denku
  records the *configured* scope list as if fully granted. `subscribedFieldsForScopes` then tries to
  subscribe to a webhook field whose scope was not actually granted, failing the whole
  `/subscribed_apps` call — so the account silently receives no events, and the stored `scopes`
  misrepresent the connection.
- **Technical impact:** `api/instagram/oauth/callback/route.ts` sets
  `scopes = getInstagramConfig().scopes.split(...)` (the requested list). The short-lived token
  exchange already returns the **granted** `permissions` (`client.ts#exchangeCodeForToken` →
  `ShortLivedToken.permissions`), but it is unused.
- **Dependencies:** None.
- **Recommended solution:** Persist `short.permissions` (the granted scopes) when present, falling
  back to the configured list only if Meta omits them; add a test for the partial-grant case.

### R-080 — Transactional auth emails send from the stale Resend sandbox sender
**Priority:** Medium · **Status:** Completed (2026-07-23, Sprint 3 Task 1) · **Effort:** S · **Related audit:** — (filed 2026-07-23, Sprint 2)
- **Business impact:** The email-verification, OTP, and password-reset emails send `from` the shared
  **sandbox** address `onboarding@resend.dev`, which cannot deliver to arbitrary recipients — so in
  production those Resend sends likely fail (they are silently backstopped by Supabase's own auth
  emails, per the "allow Supabase emails to be the source of truth" fallbacks). Meanwhile the welcome
  email correctly uses the **verified** `hello@denku.io` sender. The result is an inconsistent, partly
  dead transactional-email layer and a live trap: any new feature that reuses the shared `SENDER`
  constant (e.g. a future custom password-reset or notification email) inherits the broken sender.
- **Technical impact:** `lib/email/resend.ts:5` `SENDER = "Denku <onboarding@resend.dev>"` (duplicated
  in `lib/email/templates.ts:7`), consumed by `send.ts#{sendVerificationEmail,sendOtpEmail,
  sendPasswordResetEmail}` and `sendVerifyEmail.ts`. The verified sender pattern already exists as
  `WELCOME_FROM = "Denku <hello@denku.io>"` (`send.ts:9`).
- **Dependencies:** None (domain already verified). Confirm the exact desired From addresses.
- **Recommended solution:** Point `SENDER` at a verified `@denku.io` address (e.g.
  `no-reply@denku.io`), de-duplicate the two `SENDER` constants into one, and verify the auth emails
  actually deliver in prod. Distinct from R-008 (which must use the verified sender regardless).
- **Completed 2026-07-23 (Sprint 3 Task 1):** New centralized, env-driven sender module
  `lib/email/senders.ts` — `resolveSender(kind)` resolves per stream `RESEND_FROM_<STREAM>` →
  `RESEND_FROM` → a **verified `denku.io` default**, and can never produce the sandbox address.
  Streams: `auth` → `no-reply@denku.io` (verify/OTP/password-reset), `notify` →
  `notifications@denku.io` (artifact notifications/digests), `welcome` → `hello@denku.io`. **Sandbox
  eliminated:** removed `SENDER` from `resend.ts` and the **dead duplicate** in `templates.ts` (+ its
  export), rewired `send.ts` (5 sends), `sendVerifyEmail.ts`, and `api/dev/test-welcome` to
  `resolveSender`. Removed the `WELCOME_FROM`/`NOTIFY_FROM`/`DEFAULT_FROM` literals. Added
  `web/.env.example` (with a `!.env.example` `.gitignore` exception so it's tracked) documenting the
  `RESEND_FROM*` vars; updated `skills/deployment-and-environments.md`. 5 unit tests
  (`email-senders.test.ts`) incl. a "never resolves to resend.dev" guard; **78 total green**, build
  passing, grep-verified zero remaining `onboarding@resend.dev` senders. **Operator (optional):** set
  `RESEND_FROM*` in Vercel to override defaults; verified `denku.io` delivery of the auth emails should
  be confirmed live (was silently failing → Supabase-backstopped before this).

## LOW

### R-038 — Voice picker with audio previews in onboarding
**Priority:** Low · **Status:** Open · **Effort:** M · **Related audit:** 01 (L22)
- **Business impact:** Emotional commitment moment currently skipped ("jennifer" silently assigned).
- **Technical impact:** Voice list + preview clips; wire into activation + agent settings.
- **Dependencies:** R-013/R-014 first (bigger activation wins).
- **Recommended solution:** 4–6 curated voices with 5-second previews at the goal step.

### R-039 — Real social proof on marketing
**Priority:** Low · **Status:** Open · **Effort:** M (content-bound) · **Related audit:** 01 (L23)
- **Business impact:** Unsubstantiated stats ("3× more leads booked") invite skepticism at $149+.
- **Technical impact:** Trivial; blocked on actual customer evidence.
- **Dependencies:** Real customers willing to be named.
- **Recommended solution:** One named case study; replace invented stats; optional live
  "calls answered" counter.

### R-040 — Dashboard dark mode: finish or strip
**Priority:** Low · **Status:** Open · **Effort:** M · **Related audit:** 01 (L24)
- **Business impact:** Half-wired `dark:` classes risk broken states if ever toggled.
- **Technical impact:** next-themes installed; tokens exist; no user-facing toggle.
- **Dependencies:** Design decision.
- **Recommended solution:** Decide; if "not now", ensure no code path enables `.dark`.

### R-041 — International numbers / non-English agents
**Priority:** Low · **Status:** Open · **Effort:** XL · **Related audit:** 01 (L25)
- **Business impact:** Market expansion; currently US-only, English-first.
- **Technical impact:** Vapi/telephony provider support, persona catalog per language
  (scaffolding exists: `support_<lang>` fallback chain), currency/pricing.
- **Dependencies:** R-004 (stop claiming "20+ languages" until real).
- **Recommended solution:** Sequence after core retention work; start with ES.

### R-042 — Public changelog / roadmap page
**Priority:** Low · **Status:** Open · **Effort:** S–M · **Related audit:** 01 (L26)
- **Business impact:** Converts "unfinished" perception into "watch us ship" momentum; landing
  spot for de-scoped pricing claims (R-004).
- **Technical impact:** Simple `(marketing)` page.
- **Dependencies:** R-004 decisions.
- **Recommended solution:** `/changelog` with shipped/next/later columns.

### R-043 — Monster-file refactors + internal self-call removal
**Priority:** Low (opportunistic) · **Status:** Open · **Effort:** L cumulative · **Related audit:** 00
- **Business impact:** Velocity tax and regression risk on the three biggest files.
- **Technical impact:** Vapi webhook (3,142), onboarding actions (1,948), billing page (1,432);
  replace internal HTTP self-calls (purchase→addons, webhook→tools) with shared functions.
- **Dependencies:** R-037 (tests before major surgery).
- **Recommended solution:** Extract modules when touching these files; never a big-bang rewrite.

### R-044 — Middleware performance (per-request DB queries)
**Priority:** Low · **Status:** Open · **Effort:** M · **Related audit:** 00, 08
- **Business impact:** Latency tax on every dashboard navigation.
- **Technical impact:** 2–3 queries per request (profile + settings) in `middleware.ts`.
- **Dependencies:** R-033 (client convergence) first.
- **Recommended solution:** Cache onboarding gate in a signed cookie/JWT claim with short TTL;
  keep fail-open semantics.

### R-045 — Enterprise readiness pack
**Priority:** Low (until sales pull) · **Status:** Open · **Effort:** XL · **Related audit:** 01 (scorecard F), 00, 10
(Audit 10 gave this procurement granularity and split out the separately-shippable pieces:
audit-log coverage → R-072, data lifecycle → R-073. This entry now covers the identity pack
specifically: SSO/SAML/OIDC, 2FA/MFA — incl. admin (R-057), SCIM, and granular/custom RBAC beyond
the coarse owner/admin/viewer roles. Marketing over-claims all of these — R-004.)
- **Business impact:** Scale tier ($899) is sold on enterprise promises; deals will die in
  security review today.
- **Technical impact:** 2FA/SSO, granular RBAC, audit-log coverage of user actions, data
  export/deletion, security page substance, status page, real SLA.
- **Dependencies:** R-004 (stop selling it first), R-010 (roles foundation), R-037.
- **Recommended solution:** Sequence only when enterprise pipeline is real; start with 2FA +
  audit-log coverage + data export.

### R-078 — Remove the TEMP Instagram webhook-subscribe button
**Priority:** Low · **Status:** Open · **Effort:** S · **Related audit:** — (filed 2026-07-22, Sprint 1.5 closure)
- **Business impact:** A user-facing dashboard control marked "Operator · temporary" is committed to
  `main` (`5e15d60`). It works and is org-scoped (owner/admin, own org only), but leaving temporary
  operator scaffolding in the customer product is the kind of "unfinished" surface Sprint 1 spent
  effort removing (R-012/R-046). Low urgency; do not forget it.
- **Technical impact:** `dashboard/instagram/_components/InstagramConnectionCard.tsx` (the amber
  "Operator · temporary" block) + `dashboard/instagram/_actions.ts#subscribeInstagramForCurrentOrgAction`.
  Both self-marked TEMPORARY for a clean revert. The Basic-Auth `POST /api/instagram/subscribe`
  backfill remains the permanent operator path.
- **Dependencies:** Do it after the Dev-Mode webhook verification (Sprint 1.5 closure §c) confirms
  the subscription path works — the button exists to enable that verification without a terminal.
- **Recommended solution:** Revert the two TEMP blocks; keep the Basic-Auth endpoint.
