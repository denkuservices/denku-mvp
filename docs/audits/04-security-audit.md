# Audit 04 — Security Audit

- **Date:** 2026-07-06 · **Findings current as of:** 2026-07-07
- **Lens:** offensive + appsec engineer. Question: *where can an attacker read/write another
  tenant's data, forge trusted input, escalate, or degrade availability?*
- **Method:** full sweep of all ~43 API route handlers for authentication + tenant scoping; review
  of `middleware.ts`, secret handling, webhook trust, debug/dev routes, and transport security.
- **Relationship to prior audits:** Audit 00 filed the headline perimeter issues (R-001/002/003)
  and the tenant-isolation-by-discipline risk (under R-037). This audit verifies them against every
  route, confirms scope, and adds the systemic controls that were missing (headers, admin identity,
  RLS backstop). Prior IDs are referenced, not re-filed.

> Living document (Rule 1). Canonical status: `docs/IMPLEMENTATION_ROADMAP.md`.

## Route authentication matrix (verified this audit)

Good news first: **every customer-facing state-changing route is session-authed and every
`[lineId]` route scopes by `.eq("org_id", orgId)` after resolving org from the session** — the
phone-line routes are a clean IDOR-free pattern worth copying. Stripe webhook verifies signatures;
tool routes require the shared secret; cron requires `CRON_SECRET`. The auth *pattern* is sound
where it's applied. The problems are the gaps and the missing systemic controls.

| Surface | Auth | Verdict |
|---|---|---|
| `/dashboard/*`, customer APIs (`phone-lines/*`, `billing/*`, `conversations/*`) | Session + manual org scope | ✅ Correct; IDOR-safe on the `[lineId]` routes checked |
| `/api/admin/*` | Middleware Basic Auth (+ in-route backstop on some) | ⚠ Works, but single shared credential — R-057 |
| `/api/webhooks/stripe` | HMAC signature (`constructEvent`) | ✅ Correct |
| `/api/tools/*` | Shared static header `x-denku-secret` | ⚠ Static, unrotatable, org derived from input — R-059 |
| `/api/billing/cron/close-month` | `Bearer CRON_SECRET` | ✅ Correct |
| **`/api/webhooks/vapi`** | **NONE** | 🔴 R-001 — **live-probe-confirmed unauth in prod (2026-07-07):** 200 with no/bogus secret alike |
| **`/api/debug/basic-auth`, `/api/debug/headers`** | Public; leak `ADMIN_USER` | 🔴 R-002 — ⚠ but both returned **404** on the 2026-07-07 prod probe; verify before assuming still live |
| **`/api/billing/checkout/complete`** | **NONE** (takes `session_id` from body) | 🟠 R-058 — unauth state change |
| `/api/vapi/start` | None; returns marketing assistant id | ✅ Acceptable (semi-public by design) |
| `/api/marketing/contact` | None (public form) | ⚠ No bot/rate protection — R-030 |
| `/api/dev/test-welcome` | None, but 404s in production | ✅ Acceptable |

## Findings

### Confirmed from prior audits (still open — re-verified, not re-filed)
- **[R-001] Vapi webhook unauthenticated.** Re-confirmed: the only secret references in the file
  are *outbound* (`x-denku-secret` when it calls the tool routes). Inbound is wide open.
  **Empirically confirmed on prod 2026-07-07 (Sprint 1 Task 2):** a benign `POST` (no call id)
  returns `200 {"ok":true,"ignored":"no_call_id"}` with no secret header and with a bogus
  `x-vapi-secret` alike — no 401, no edge/WAF shield. Note for the fix (Task 5/R-001): a
  `VAPI_WEBHOOK_SECRET` env var already exists but is never read in code — likely already
  configured on the Vapi side, so wiring a check should be low-friction. This is
  the master key to most cross-tenant writes below, because a forged event resolves an org by
  guessable assistant/phone-number IDs and then creates tickets/leads/appointments in it, burns
  concurrency leases (inbound DoS), and injects billable minutes/cost. **Highest severity in the
  product.**
- **[R-002] Public debug endpoints leak `ADMIN_USER` + env.** Directly enables R-057 (the leaked
  username is half of the single shared admin credential).
- **[R-003] Middleware sets `x-auth-user` / `x-auth-email` PII response headers.**
- **[R-030] Rate limiting is an in-memory no-op on Vercel.** Security consequence made concrete
  here: **login has no throttle or lockout** (credential stuffing/brute force), the public contact
  form has no bot protection (spam/abuse), and the demo-call limiter (`webcall/event`, the only
  route that calls `rateLimit`) is ineffective — demo minutes can be farmed.
- **[R-037] Tenant isolation is discipline-only, with no tests.** See R-060 for the defense-in-
  depth counterpart.

### New findings

- **[R-056 — NEW, High] No HTTP security headers anywhere.** `next.config.ts` and `middleware.ts`
  set no `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`,
  `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`. Consequences: the dashboard
  is clickjackable (no frame protection), no HSTS to prevent TLS downgrade, and any XSS has maximum
  blast radius (no CSP). For a product handling call transcripts (PII) this is a baseline miss and
  a guaranteed finding in any customer security review.

- **[R-057 — NEW, High] Platform admin is a single shared static Basic-Auth credential.**
  `/admin` + `/api/admin/*` gate on one `ADMIN_USER`/`ADMIN_PASS` pair (`middleware.ts` +
  in-route backstops). No per-operator identity, no MFA, no rotation, and no attribution — the
  audit log cannot record *which human* performed an admin action because they're all the same
  principal. Combined with R-002 (username leaked) and R-030 (no throttle), the admin surface is
  brute-forceable and unaccountable. This is also key-person/insider risk an acquirer prices in.

- **[R-058 — NEW, Medium] `billing/checkout/complete` performs a state change with no session
  auth.** It accepts a `session_id` from the request body, retrieves the Stripe session, and
  activates the plan for the `org_id` in the session metadata. Exploitability is bounded (an
  attacker needs a valid `cs_...` id and can only activate a plan that was genuinely paid for), so
  it's not critical — but it's an unauthenticated, org-mutating endpoint that trusts client input
  and should be defense-in-depth hardened. It also duplicates the onboarding-page fallback
  activation logic, doubling the surface.

- **[R-059 — NEW, Medium] Tool routes rely on a single static, unrotatable secret and derive org
  from attacker-influenceable input.** `x-denku-secret` is one shared value with no rotation or
  per-caller scoping; `deriveOrgIdFromContact` / `to_phone` lookups mean the org a ticket lands in
  is chosen by call-payload data. Today the only legitimate caller is the (unauthenticated, R-001)
  Vapi webhook, so anyone who can forge webhook events — or who obtains the static secret — can
  write into arbitrary orgs. Fixing R-001 shrinks this, but the static-secret design remains
  brittle.

- **[R-060 — NEW, High] No defense-in-depth for tenant isolation (RLS is not the enforcement
  layer).** Nearly all reads/writes use the service-role client, which *bypasses* RLS, with
  correctness resting entirely on a hand-written `.eq("org_id", …)` in every query. RLS policies
  exist on only a handful of tables. There is no backstop: a single omitted filter in any future
  query is an immediate cross-tenant breach, and (R-037) no test would catch it. This is the
  single largest *systemic* risk in the product — distinct from R-037 (which is "add tests"); the
  fix here is "add RLS policies as a safety net so the service-role path isn't the only guard for
  the tables that can afford it, and adopt a scoped-query helper that makes an unscoped query hard
  to write."

## Risk Register (severity × likelihood)

| R-ID | Risk | Severity | Likelihood | Exploit sketch |
|---|---|---|---|---|
| R-001 | Forged Vapi webhook | **Critical** | High | POST crafted `end-of-call-report` with a guessed assistantId → tickets/leads in victim org, lease exhaustion, injected minutes |
| R-060 | Cross-tenant leak via missed `org_id` filter | **Critical** | Medium | One future query without `.eq(org_id)` on the service-role client → reads/writes across all tenants; no RLS/test catches it |
| R-002 | Admin creds/env disclosure | High | High | GET `/api/debug/headers` → `ADMIN_USER` + env booleans |
| R-057 | Shared admin credential compromise | High | Medium | Leaked/brute-forced single Basic-Auth pair → full platform admin, unattributable |
| R-056 | Clickjacking / XSS amplification / TLS downgrade | High | Medium | Frame the dashboard for UI-redress; any XSS runs unconstrained (no CSP) |
| R-030 | Credential stuffing / demo-minute farming / contact spam | Medium | High | Automated login attempts (no lockout); scripted demo calls; form spam |
| R-059 | Cross-org tool writes via static secret / forged caller | Medium | Medium | With R-001 open, forge webhook → tool route writes to org chosen by `to_phone` |
| R-058 | Unauth plan-activation endpoint | Medium | Low | Replay a known `session_id` to (re)activate a paid plan; bounded impact |
| R-003 | PII header disclosure | Medium | Medium | Any proxy/log between edge and client captures user id/email |

## Executive Summary

Denku's applied auth is better than its reputation: customer routes are session-authed and cleanly
org-scoped, Stripe is signature-verified, and the phone-line routes are an IDOR-free template. The
danger is concentrated in **one open door and a set of missing systemic controls**. The open door
is the unauthenticated Vapi webhook (R-001), which is effectively a write primitive into any tenant
and the enabler for R-059 — it must be closed first and is a one-day fix. The systemic gaps are
that **tenant isolation has no backstop** (service-role everywhere, RLS not enforcing — R-060),
**no HTTP security headers exist** (R-056), and **platform admin is one shared, leakable, MFA-less
credential** (R-057, worsened by R-002/R-030). None of these require large projects: R-001, R-002,
R-003, and R-056 are day-scale; R-057 and R-060 are week-scale but high-leverage. Until R-060 is
addressed, every new query is a potential breach and no test would catch it — so the durable move
is a scoped-query helper plus RLS safety-net policies, done alongside the R-037 test foundation.

## Action Items

| # | Action | R-ID | Priority |
|---|---|---|---|
| 1 | Authenticate the Vapi webhook (secret/HMAC); reject unsigned | R-001 | Critical |
| 2 | Delete/protect `/api/debug/*` and rotate `ADMIN_USER`/`ADMIN_PASS` after | R-002 | Critical |
| 3 | Add RLS backstop + scoped-query helper for tenant isolation | R-060 | High |
| 4 | Add security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer/Permissions-Policy) | R-056 | High |
| 5 | Per-operator admin identity + MFA (replace shared Basic Auth) | R-057 | High |
| 6 | Remove `x-auth-*` PII response headers | R-003 | Critical |
| 7 | Real, shared-store rate limiting incl. login lockout + contact-form bot protection | R-030 | Medium |
| 8 | Session-auth (or fully remove/merge) `billing/checkout/complete` | R-058 | Medium |
| 9 | Rotatable/scoped tool auth; stop trusting `to_phone` for org routing | R-059 | Medium |
