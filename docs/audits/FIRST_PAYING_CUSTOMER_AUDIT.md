# First Paying Customer — Repository-Wide Audit

> Audited 2026-07-25 against **production reality**, not the repo's aspirations. One question:
> *"If I were paying for Denku today, what would feel unfinished, inconsistent, confusing,
> untrustworthy, or surprisingly unpolished?"* Findings are `F-###`, severity-ordered.
> Roadmap and sprint boundaries deliberately ignored.

---

## 0. The finding that dwarfs everything else

I queried the **live production database**. Here is what is actually deployed:

| Sprint | Feature | Table/column | In production? |
|---|---|---|---|
| 4 | **AI knows the business** (R-013) | `agents.business_context` | ❌ **NO** |
| 6 | **Member invites** (R-010) | `org_invites` | ❌ **NO** |
| 3 | **Usage alerts / pause at cap** (R-009) | `billing_usage_alerts` | ❌ **NO** |
| 4.5 | Platform model | `employee_channels`, `contacts` | ❌ **NO** |
| 8 | Manifest + provenance | `employee_manifests` | ❌ **NO** |
| 3 | Billing math views | `org_monthly_overages` | ✅ yes |

**10 of 11 migrations are unapplied. Both platform flags (`PLATFORM_MODEL_ENABLED`,
`PLATFORM_UX_ENABLED`) default OFF.**

### What that means for someone paying today

- **The AI does not know their business.** The Settings UI to enter business name, hours, services
  and policies exists and renders — but `agents.business_context` **does not exist in the database**.
  This is the core promise of Sprint 4, and it is the difference between "a competent receptionist"
  and "a generic bot." *(F-001)*
- **Inviting a teammate fails.** The route returns *"Member invites aren't enabled yet"* because
  `org_invites` isn't there. A paying business adding their receptionist hits a wall. *(F-002)*
- **Nobody is warned before they're billed for overage.** No `billing_usage_alerts` → no 50/75/90%
  warnings, no pause at 100%. The owner's explicit decision ("pause at the cap — trust over silent
  overage") is **not in effect**. *(F-003)*
- **Everything from Sprints 4.5–8.5 is invisible.** Conversations, Contacts, Channels, Requests, the
  control-center Settings, the action-first dashboard — all behind a flag that is off. The customer
  sees the voice-first CRUD panel: Phone Lines, Calls, Tickets, Appointments, Usage. *(F-004)*
- **The webhook may still accept forged requests** (R-001, unverifiable from here).

> **The blunt version: we have spent five sprints building a product that no customer can use.**
> The gap between this repo and a sellable product is **not more code — it is roughly two days of
> deployment work.** Every additional sprint of building widens the gap rather than closing it.

---

## 1. Severity-ordered findings

### F-001 · **Critical** · The AI doesn't know the business
`agents.business_context` absent in prod; UI at `settings/agents/[agentId]` writes to a column that
doesn't exist. **Evidence:** live `information_schema` query returns 0.
**Impact:** the product's central claim fails on the first call. **Fix:** apply
`20260723130000_agent_business_context.sql`. **Effort: minutes.**

### F-002 · **Critical** · Member invites fail
`org_invites` absent. **Evidence:** live query returns 0; `api/members/invite` returns `not_enabled`.
**Impact:** a paying business can't add staff — a day-one action. **Fix:** apply
`20260724200000_org_invites.sql`. **Effort: minutes.**

### F-003 · **Critical** · Silent overage; no spend protection
`billing_usage_alerts` absent, `BILLING_NOTIFICATIONS_ENABLED` unset. **Impact:** a customer can run
past their included minutes with **no warning and no pause** — then receive a surprise invoice. This
is the single most trust-destroying failure mode a SaaS has. **Fix:** apply migration + register cron
+ set flag. **Effort: ~1 hour.**

### F-004 · **Critical** · The entire modern product is switched off
Both flags default OFF. **Impact:** customers see a CRUD admin panel (one nav item per DB table)
while a coherent AI-Employee product sits unused in the same deploy. **Fix:** apply the 4.5
migrations, flip `PLATFORM_MODEL_ENABLED`, verify, then `PLATFORM_UX_ENABLED`. **Blocked on: staging.**

### F-005 · **High** · Onboarding has no loading or error states
`src/app/(app)/onboarding/` contains **no `loading.tsx`, no `error.tsx`** — verified. This flow takes
payment and provisions a phone number. A slow step looks frozen; a failure shows Next's default error
page. **This is the first ten minutes of the paying relationship.** **Effort: S.**

### F-006 · **High** · Customer-facing terminology still says "agent"
**174** occurrences across the agent pages a customer actually sees. `CLAUDE.md` mandates
customer-facing "AI", never "agent". The platform surfaces say "AI Employee"; the shipping ones say
"agent". **Two vocabularies for the same thing.** **Effort: S–M.**

### F-007 · **High** · Billing is not explainable
`workspace/billing` is **1,432 lines**, and neither it nor Usage explains the rule customers dispute:
**every call rounds up to the next minute individually** (`Σ ceil(sec/60)`) — a 20-second call bills
one minute. If an owner can't reconcile their invoice, they don't trust it. **Effort: M.** *(R-123)*

### F-008 · **High** · Legacy surfaces have no loading/error states
Only `phone-lines` and `appointments` have them among legacy routes. **13 of 15 routes** lack an error
boundary. On the pages customers *actually use today*. **Effort: S.**

### F-009 · **Medium** · 15 files render raw `<table>`
Mobile overflow. A business owner checks this between jobs, on a phone. **Effort: M.**

### F-010 · **Medium** · Settings is a fourth design system
**529 `zinc-*`** references; foreign to the dashboard it lives in. Only visible once F-004 is fixed.
**Effort: M.** *(R-129)*

### F-011 · **Medium** · Accessibility is thin
31 `aria-label`s total across the app; icon-only controls largely unlabelled. (Images are fine —
0 missing `alt`.) Not a launch blocker for an SMB customer; is one for enterprise. **Effort: M.**

### F-012 · **Medium** · Marketing claims certifications we don't hold
SOC 2 / HIPAA copy still live (R-004 draft written, not shipped). **Legal exposure**, not just
polish. **Effort: S** (+ counsel review).

---

## 2. Challenging my own work as hard as the legacy

- **I optimised the wrong variable for five sprints.** Sprint 6 correctly identified that launch was
  the bottleneck — then Sprints 7, 8 and 8.5 built more platform anyway. Each was individually
  defensible ("cost of delay is permanent", "the flip needs these fixes"); collectively they were
  **avoidance of the unglamorous work that actually unblocks revenue.**
- **I shipped features that cannot function.** Sprint 4's business context, Sprint 6's invites and
  Sprint 8's manifests all have complete, tested code paths against **tables that don't exist in
  production**. "Code-complete" was technically true and practically meaningless. I should have
  weighted "is it *live*?" far more heavily in every review I wrote.
- **My "inert until migrated" pattern is good engineering and bad product.** It made every feature
  safe to merge — and equally safe to *forget*. Nothing in the product tells anyone these features
  are dormant. The preflight (R-098) reports readiness but nobody has run it.
- **I under-tested the customer's actual path.** I have never verified a real signup → onboarding →
  first call. Every audit I've written examined code, not the journey.

---

## 3. The shortest path to a sellable product

Ordered by *customer value per hour*, not by roadmap tidiness. **Phase 1 is not code.**

### Phase 1 — Deployment (~2 days, mostly operator) — *unblocks more value than all remaining code*
1. **Provision staging** (the standing P0 — everything else is gated on it).
2. **Apply the 10 pending migrations** (start with `agent_business_context`, `org_invites`,
   `billing_usage_alerts` — F-001/F-002/F-003).
3. **Set env + reconcile assistants**, then flip **webhook `enforce`** (R-001) and `CSP_MODE`.
4. **Enable `BILLING_NOTIFICATIONS_ENABLED`** + register crons (F-003 — spend protection).
5. **Run the live test-call acceptance** (Sprint 4 §3) — the first end-to-end proof the product works.
6. **Run `/admin/readiness`** until green.
→ Guide: `docs/LAUNCH_RUNBOOK.md`. **After this, the product a customer pays for actually functions.**

### Phase 2 — Turn on the modern product (~half a day, after Phase 1 verifies)
7. Flip `PLATFORM_MODEL_ENABLED`, verify dual-writes; then `PLATFORM_UX_ENABLED`, walk the IA.

### Phase 3 — The polish that matters (~3–5 days of code, in this order)
8. **F-005** onboarding loading/error states — first ten minutes.
9. **F-006** terminology sweep → "AI Employee" everywhere.
10. **F-007** billing explainability — the trust surface.
11. **F-008** loading/error on remaining routes.
12. **F-012** marketing honesty (needs counsel).

### Phase 4 — After the first customer
F-009 mobile tables · F-010 settings re-skin · F-011 accessibility · R-020 calendar sync ·
R-131 billing page refactor.

---

## 4. The one-sentence answer

**If I were paying for Denku today: the AI wouldn't know my business, I couldn't invite my
receptionist, I'd get no warning before overage, and I'd be using a CRUD admin panel — not because
those things aren't built, but because they were never turned on.**
