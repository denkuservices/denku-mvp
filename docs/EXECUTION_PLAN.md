# Denku — Execution Strategy

> How to turn 76 audited findings into safe work. This plan sorts findings by **what has to be true
> before you can act**, per `docs/RETROSPECTIVE.md`. Read the retrospective first — it defines the
> confidence levels this plan relies on. Canonical finding detail lives in
> `docs/IMPLEMENTATION_ROADMAP.md`; this file is the *sequencing and dependency* layer.
>
> **The core rule:** never implement a finding whose evidence was "found by reading" when acting on
> it changes external state — verify the live state first (see Category B/C and Retrospective §7).

## The three categories

- **Category A — Implement now.** High-confidence, code-only, self-contained, non-destructive. Safe
  for any contributor (human or AI) to pick up. These are where the roadmap is most trustworthy
  (Retrospective §4, "High").
- **Category B — Decide first.** Blocked on a human decision (product, pricing, legal, or
  architecture) — the *implementation* may be trivial, but shipping without the decision is wrong.
- **Category C — External dependency.** Requires touching or confirming a system outside the repo
  (Vapi, Stripe, Supabase/live DB, Vercel env, or a new third-party). These carry the highest
  "code ≠ production" risk (Retrospective §5).

A finding can be in two categories (e.g. R-050 needs both live verification *and* touches Vapi). It
is listed under its **binding constraint** — the thing that must happen first.

---

## Category A — Implement now (code-only, high confidence)

Recommended in waves; **Wave A0 is the foundation that de-risks everything after it** (per the
Audit 11 refactor-sequencing plan).

### Wave A0 — Foundations (do first)
| R-ID | Work | Note |
|---|---|---|
| R-037 | Test harness + CI; first suites: webhook idempotency, lease limits, org-scoping | Prerequisite for safely touching anything large |
| R-034 | Delete dead code (root `src/`, diff report, tsbuildinfo, dup marketing comps) | Mechanical, shrinks surface |
| R-033 | Converge to one supabase-admin client | Mechanical |

### Wave A1 — Security & trust quick wins (code-only parts)
| R-ID | Work | Note |
|---|---|---|
| R-002 | Delete `/api/debug/*` routes | Route deletion is code-only; **credential rotation is Category C** |
| R-003 | Remove `x-auth-*` PII response headers | Code-only |
| R-056 | Add security headers (start CSP report-only) | Code-only; full CSP enforce later |
| R-046 | Remove fake API-keys screen + fabricated integration statuses | Code-only |
| R-049 | Remove no-op "Disable workspace" control | Code-only (real disable is Category C) |
| R-012 | Remove placeholder pages from reach | Code-only |

### Wave A2 — Product-honesty & funnel (code parts; copy decisions are Category B)
| R-ID | Work | Note |
|---|---|---|
| R-007 | Make demo the primary CTA; remove "Get started free" / "Book a demo" mislabels | Copy/link edits |
| R-067 | SEO foundation: `robots.ts`, `sitemap.ts`, per-page `generateMetadata`, OG, JSON-LD | Code-only |
| R-011 | Remove the dead forgot-password link now | Full reset flow is Category C (Supabase) |

### Wave A3 — UX / UI cohesion & resilience
| R-ID | Work |
|---|---|
| R-061 | Shared dashboard error boundary + recovery UI |
| R-062 | One feedback/confirmation (toast) system across mutations |
| R-021 | Central `safeErrorMessage()`; stop leaking raw upstream errors |
| R-048 | Skeleton loading states; remove the phone-lines debug `Loading…` leftover |
| R-063 | Consolidate AI management to one canonical location |
| R-064 | Reskin settings to the Horizon system (one app chrome) |
| R-065 | Terminology sweep ("AI" not "agent"); fold in R-018 widget + R-055 header |
| R-027 | Replace Horizon template-ghost widgets |
| R-026 | Consistent, teaching empty states (fix the bare leads state) |
| R-070 | A11y structural: skip link, ARIA, modal focus (contrast is Category B/measurement) |

### Wave A4 — Code health (sequence-gated: after A0 tests)
| R-ID | Work | Note |
|---|---|---|
| R-074 | Type the Vapi/billing boundary (zod), remove `any` threading | Enables safe extraction |
| R-043 | Extract monster files, webhook first | Do after R-037 tests + R-074 types |
| R-032 | Single gated `webhook_debug` write; strip debug artifacts | Retention job is Category C |
| R-069 | Drop one animation lib; defer Spline | Confirm with bundle analyzer |
| R-068 | Analytics: select minimal columns, aggregate in SQL | SQL RPC may make this Category C |

---

## Category B — Decide first (human validation gates implementation)

| R-ID | Decision required | Who | Then implementation is |
|---|---|---|---|
| **R-050** | **Verify live Vapi assistant tool state before any fix** — a code re-PATCH could wipe a working manual config (Retrospective §7.1) | Eng + Vapi owner | Then Category C (touches Vapi) |
| R-004 | Which compliance/feature claims are honest? (product + **legal** review — the "legal exposure" call is not mine to make) | Founder + counsel | Trivial copy edits across 4 pages |
| R-006 | Is "1 phone included" or the catalog (1/2/5) correct? | Product | One-line copy/catalog fix |
| R-005 | Ship annual billing, or remove the toggle? | Product | Remove = code-only; ship = Category C (Stripe) |
| R-015 | Trial model: pre-paywall web call vs 14-day trial vs shared number? | Product/Growth | Then build |
| R-009 | At hard cap: pause vs keep-billing — what's the customer-facing policy? | Product | Then Category C (Stripe/billing) |
| R-013 | Which 3–5 business-context fields feed the agent prompt? | Product | Then implement (also Vapi, Category C) |
| R-057 | Admin identity model (SSO vs Supabase admin-org + MFA) | Architecture | Then build |
| R-045, R-041, R-020(scope) | Enterprise pack / i18n / calendar scope — gated on strategy & sales pull | Leadership | Deferred until pulled |
| Product priorities (Audits 01/02/07) | Re-rank against real funnel data **after** R-066 lands | Growth | Data-driven |

## Category C — External-system dependency (confirm/configure outside the repo)

Each needs the listed external prerequisite; several also need **staging verification that code ==
production** before shipping.

### Vapi
| R-ID | External prerequisite |
|---|---|
| **R-001** | Configure a webhook secret in Vapi; **confirm the endpoint is actually reachable/unauth in prod** and stage so live call ingestion never drops |
| **R-050** | Read current live assistant `toolIds` before fixing (see B); the fix PATCHes Vapi assistants |
| R-051 | Vapi `voice` + `transcriber` config schema |
| R-052 | Vapi `maxDurationSeconds` / silence-timeout config; align lease TTL |
| R-054 | Business-hours behavior + Vapi greeting variation |
| R-016 | Confirm Vapi recording URLs/format + consent posture |

### Stripe
| R-ID | External prerequisite |
|---|---|
| R-035 | Create catalog Products/Prices (unblocks R-005 annual, R-024 proration) |
| R-024 | Stripe portal/proration config |
| R-058 | Rework/remove using Stripe session context |

### Supabase / live database
| R-ID | External prerequisite |
|---|---|
| **R-031** | Access the **correct** live project (MCP points at the wrong one — Retrospective §2); baseline schema + prod-only RPCs into `supabase/migrations` |
| **R-075** | Pull the real invoice-preview view; **reconcile against an actual Stripe invoice before touching billing code** |
| R-076 | Requires R-075 baselined; build COGS-vs-revenue reconciliation job |
| R-036 | Live-DB FK migration (finish orgs/legacy) — after R-031 |
| R-060 | Add RLS backstop policies on the live DB (pair with R-037 tests) |
| R-072 | Audit-log coverage (code) + attribution needs R-057 |
| R-073 | Data export/deletion (+ Vapi/Stripe teardown) + retention purge job |

### Infra / third-party / env
| R-ID | External prerequisite |
|---|---|
| R-066 | Choose + integrate a product-analytics provider (privacy posture matters — transcripts are PII) |
| R-008, R-017 | Verify Resend sending domain (`denku.io` vs `denku.ai` mismatch); cron for digest |
| R-030 | Provision a shared-store limiter (Upstash/Vercel KV) |
| R-002 (rotation) | Rotate `ADMIN_USER`/`ADMIN_PASS` in Vercel after deleting debug routes |
| R-059 | Rotatable/scoped tool-secret mechanism |

---

## Recommended cross-category sequencing

> **Progress note (2026-07-08 — Sprint 1 closed).** Steps 1–3 below are **done in code** (R-050
> verify, R-001 reachability, Wave A0 R-037/tests, Wave A1 R-002/R-003/R-056/R-046/R-049/R-012,
> and the R-001/R-050/R-077 externals). What remains before those are *operationally* closed is the
> **operator handoff** (rotate creds, set `VAPI_WEBHOOK_BASE_URL` + run the reconcile endpoint, live
> test call, flip webhook `enforce`, enforce CSP) — see `docs/SPRINT_1_REVIEW.md` §3. The live front
> now starts at **step 4** (R-004 truth pass). Wave A0's R-034/R-033 (dead-code delete, client
> converge) were **not** taken this sprint and remain open.

Reality interleaves the categories. A sane order:

1. ✅ **Done (Sprint 1).** Verify the two dangerous unknowns: R-050 live Vapi state, R-001 prod
   reachability. Both confirmed; the verification also surfaced R-077.
2. ✅ **Done (Sprint 1) for the security slice.** Wave A0 R-037 (tests + CI) and Wave A1
   (R-002/R-003/R-056/R-046/R-049/R-012) shipped. *Still open in A0:* R-034 (dead code), R-033
   (client converge).
3. ⏳ **Code done, operator-gated.** R-001 (webhook auth — staged, needs `enforce` flip) and
   R-050/R-077 (tool attachment + serverUrl — needs `VAPI_WEBHOOK_BASE_URL` + reconcile run + a live
   test call). See the review's handoff.
4. **← LIVE FRONT: Run the R-004 truth-pass decision** (with counsel) and ship the copy across A2 +
   the Category B copy items — stops the trust bleed at the funnel.
5. **Land R-066 (analytics)** so every subsequent product bet is measurable, then re-rank Audits
   01/02/07 priorities against real data.
6. **Billing verifiability:** R-031 → R-075 → R-076, in that order (schema in repo → prove the math
   → reconcile) — do **not** reorder; each depends on the prior.
7. **Everything else** (A3/A4 polish, remaining Category C) as capacity allows, tests (R-037) always
   preceding monster-file refactors (R-043).

## Guardrails for whoever executes this

- Preserve the "do not regress" list (Audit 00 / `AUDIT_PLAYBOOK.md` philosophy #4): deterministic
  artifacts, compensation flows, concurrency leases, pause enforcement, idempotent month-close.
- For any Category C item, verify **live state before write** and stage the change.
- Update the roadmap entry to `In Progress`/`Completed` (date + how) as you go, and — per the
  Retrospective's closing note — graduate any assumption you confirm out of Retrospective §3/§7.
