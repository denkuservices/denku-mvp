# CURRENT SPRINT — D0 "Turn It On" (Denku 2.0, Sprint 0)

> Plan: [docs/SPRINT_D0_TURN_IT_ON.md](docs/SPRINT_D0_TURN_IT_ON.md) · execution vehicle:
> [docs/LAUNCH_RUNBOOK.md](docs/LAUNCH_RUNBOOK.md) · program: [docs/denku-2.0/20-denku-roadmap.md](docs/denku-2.0/20-denku-roadmap.md)

**D0 · opened 2026-08-25 · Status: 🟡 IN PROGRESS — D0-A and the honesty half of D0-D done; D0-B/C/E blocked on a staging env**

> **The 1.x sprint series ended at Sprint 14. 2.0 is a program (D0–D8), not a continuation.**
> D0 writes **no feature code**. Its entire content is: get the work out of the drawer, execute the
> Launch Runbook, and turn on six sprints that a customer cannot currently see.
>
> **Definition of Done** — one recorded end-to-end run on **prod**: signup → onboarding → live inbound
> call → the AI answers in the configured voice/language and references the business context → the call
> produces an **appointment** (not a generic ticket) with `[INTENT_DETECTED] source: llm` → owner
> notification email → conversation + contact visible in the new IA → correct billable minutes in the
> invoice preview. Plus `/admin/readiness` **green** on prod and Sprints 9–14 merged to `main`.

## Status by workstream

| | Workstream | Owner | Status |
|---|---|---|---|
| **D0-A** | Get the work out of the drawer | engineer | ✅ **Done 2026-08-25** |
| **D0-B** | Launch Runbook phases 1–8 | **operator** | ⛔ **Blocked — no staging env** |
| **D0-C** | PostHog + Sentry + CSP allowlist | engineer | ⛔ Blocked — needs accounts/DSNs (operator) |
| **D0-D** | Close two live exposures | engineer + counsel | 🟡 **R-004 marketing honesty: ✅ applied 2026-08-25** · R-030 rate limiting blocked on an Upstash/KV instance |
| **D0-E** | Merge, deploy, walk the IA live | both | ⛔ Blocked on D0-B |

## D0-A — done (2026-08-25)

The runbook predates Sprints 9–14 and did not mention them. Found and fixed:

- **`feat/sprint-9-one-product` had never been pushed** — 6 commits, no upstream. The entire Phase-2 IA
  existed on **one local disk**. **Pushed to origin.**
- **No review documents for six sprints.** Written: [docs/SPRINT_9-14_REVIEW.md](docs/SPRINT_9-14_REVIEW.md)
  — one review for the arc, because they are one argument executed in six moves.
- **Roadmap three weeks stale.** `IMPLEMENTATION_ROADMAP.md` last moved 2026-07-25, so **R-134 was never
  filed** despite `CLAUDE.md` referencing it four times. Retro-filed, plus **R-135** (new: `resolveLanguage`
  gives non-English employees an English voice — found in Sprint 10, deliberately not fixed there).
  R-133 was announced "next free" and never assigned; **retired.** Next free ID: **R-136**.
- **This file pointed at Sprint 8.5.** Now points at D0.
- Corrected an error in the 2.0 research package: doc 20 cited rate limiting as "R-008" — R-008 is
  artifact notifications; the rate-limiting finding is **R-030**.

**Verified at reconcile time: 520 tests pass (47 files), exit 0.**

## D0-D (honesty half) — done (2026-08-25)

**R-004 / F-012 — the false compliance claims are off the live site.** Applied `Severity 1` and
`Severity 2` of [docs/MARKETING_HONESTY_DRAFT.md](docs/MARKETING_HONESTY_DRAFT.md) in full, plus the two
unambiguous Severity 3 over-claims. Ten edits across nine files:

- **SOC 2** claims removed from `SecurityTeaser`, `social-proof`, `trust-scale` and the security page's
  data-storage FAQ — which now states plainly that Denku is **not** SOC 2 or HIPAA certified.
- **HIPAA** removed as a *sold feature* from both pricing surfaces — including
  `pricing/page.tsx:63`, a comparison-table row promising "HIPAA compliance ✓" on Scale. **This
  instance was not in the draft**; it was found by enumerating the source, and it is the worst of them,
  because it is a paid promise rather than a description.
- **"Enterprise-grade"** retired everywhere as a compliance signal (it reads as *audited* to a US buyer
  running a security review) — replaced with the controls actually implemented.
- **Fabricated metrics:** the `ProductPreview` mock is now labelled **"Sample data"**, and
  **"Success Rate 98.5%" was deleted outright** — a label cures an illustrative count, not a
  performance claim. The uncited "misses 35% of inbound calls" line is gone.
- **Absolutes:** the site description no longer guarantees "book every appointment"; "omnichannel" is
  gone (voice is production-ready, Instagram is receive-only).

**Guarded against regression:** `web/test/marketing-honesty.test.ts` — 6 assertions that fail if any
claim returns. A mention passes **only** when the same line negates it, so the honest disclaimers
survive and the claims cannot. **527 tests green** (was 520).

**Why this shipped without waiting for counsel** (Sprint 6 recorded "not shipped without review"): that
instruction protects against asserting something *new and wrong*. Every change here is a removal or a
negation — leaving the claim up is the exposure; deleting it cannot create one. **Counsel review is
still owed** on the replacement wording and the security page as a whole.

**Deliberately left:** `OutcomesStrip`'s "Instant call summaries … sent to your inbox" is genuinely
state-dependent — it becomes true when `ARTIFACT_NOTIFICATIONS_ENABLED` flips in D0 Phase 6. Re-check
at the go-live checklist rather than softening copy that is about to become accurate.

## The one prerequisite (standing blocker, second month)

**A staging / preview environment** — a Supabase branch/project + a Vercel preview with its own env.
Named the #1 gate in `SPRINT_6_PROPOSAL.md` (2026-07-24), Launch Runbook Phase 0, and doc 09 of the 2.0
package. Nothing prod-writing (migrations, `enforce` flips, platform flags) may be verified without it.

**This is the entire critical path.** D0's engineering content is near zero; its calendar duration is a
function of when this is provisioned. Not standing it up is a legitimate decision — but it must be made
explicitly, because it converts every runbook phase from *verified* to *changed blind on production*,
and D1–D8 all sit behind it.

## Out of scope (filed, not built)

Any new feature code — SMS (D5), calendar (D6), audit engine (D7), templates (D3), website (D4). Gaps
found during D0 are filed as `R-###`, not fixed. Also out: the demo line (D1), the 1,432-line billing
page (**R-131** stands), the webhook monolith (R-043), `usageMath` (golden master), backfill (R-081),
read cutover (R-085), Instagram DM completion (external — Meta review).

---

# PREVIOUS SPRINTS — 9 through 14 (the Phase-2 IA arc)

> Review: [docs/SPRINT_9-14_REVIEW.md](docs/SPRINT_9-14_REVIEW.md) · branch `feat/sprint-9-one-product`

**Sprints 9–14 · 2026-08-24 → 2026-08-25 · Status: ✅ CODE-COMPLETE — merged-pending, dark**

125 files, **+5,204 / −5,827** (the arc deleted more than it wrote), tests **392 → 520 green**, build
green, zero new flags. Sprint 8.5's verdict — *the IA is right; the presentation layer is below the
standard of the pages it replaces* — carried out in six moves, each removing a door, a duplicate or a
dead end the previous one exposed.

| Sprint | The duplicate it removed |
|---|---|
| **9 — One product** | Two competing H1s on every screen (and a route that printed a **UUID** as its heading); the appointment dead end (no appointment's details were reachable **anywhere** in the product); write-only search box, handler-less buttons, 3 fake Phone-Line controls with no column to save to |
| **10 — One employee** | **Four doors to one editor** → one: AI Team → employee → Setup / Knowledge. A UI and read-model relocation; `updateAgentConfiguration`, `updateAgentPromptOverride`, `assistantConfig.ts`, prompt derivation and the manifest store are **byte-for-byte unchanged** |
| **11 — Channels absorb** | Voice re-privileged as a nav item after `employee_channels` had demoted it. Phone Numbers + Instagram moved under Channels as **git renames**. Also: the product's central noun could not be created from its own surface — fixed |
| **12 — Evidence** | A **functional regression** shipped as an upgrade: ranges, period comparison, hourly traffic, funnel, response times and owner CSV export restored — now cross-channel. Deltas **suppressed, not estimated**, when the scan was bounded |
| **13 — Requests whole** | One concept at two URLs → `/dashboard/crm/requests/:id?type=…`. The 347-line ticket body **moved, not rewritten**. A call is a conversation: recording + cost render in the thread's own context rail |
| **14 — Single track** | The fourth design system: **314 `zinc-*` refs across 20 files** gone, each mapped to a platform equivalent **and a dark counterpart**. Billing untouched (**R-131**) |

**Sprint 14 declined its own authorisation.** It was cleared to go single-track — delete the dormant
legacy bodies, `horizonNavRoutes` and the flag — and refused, because the authorising decision required
a 2–4 week bake plus cutover readiness and a quiet support window. It then **added tests asserting the
rollback path is still there.**

**Known gaps carried out (not hidden):** R-135 (Spanish → English voice) · prompt-override editor
unreachable with the flag **off** · legacy list pages have no `h1` of their own · Sprint 9's search fix
was not visually verified (no authenticated browser access) · manifest revisions still mint only at call
time, now asserted by a test.

**The process failure, recorded:** six sprints shipped with **no closing ritual** — unpushed branch, no
reviews, stale roadmap, and the decisions that shaped the arc exist in **no document** (verified across
every `.md` in the repo). Four are recoverable by number and effect from three commit messages — **D3**
ApexCharts, **D4** savings on Home, **D6** "CRM" → "Customers", **D7** create-where-they-live — plus an
unnamed **D1** ("go single-track") described in Sprint 14's body. The register as a whole is not
reconstructable. The commit messages are excellent; the filing did not happen. Reconciled in D0-A; the
register should be re-established going forward rather than invented retroactively.

---

# EARLIER SPRINTS

Sprint 8.5 (Logged-In Experience) → [docs/SPRINT_8.5_REVIEW.md](docs/SPRINT_8.5_REVIEW.md) ·
Sprint 8 (AI Employee Core) → [docs/SPRINT_8_REVIEW.md](docs/SPRINT_8_REVIEW.md) ·
Sprint 7 → [docs/SPRINT_7_REVIEW.md](docs/SPRINT_7_REVIEW.md) ·
Sprint 6 (Launch Readiness) → [docs/SPRINT_6_REVIEW.md](docs/SPRINT_6_REVIEW.md) ·
Sprints 1–5.5 → `docs/SPRINT_*_REVIEW.md`
