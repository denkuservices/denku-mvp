# Denku Audit Program — Retrospective

> Institutional knowledge about *how* the 13-audit program (00–12) was conducted, what it could
> and could not see, and how much to trust its output. Read this before acting on
> `docs/IMPLEMENTATION_ROADMAP.md` — it is the confidence layer over the findings. Written for
> future contributors (human and AI) so nobody mistakes a reasoned inference for a verified fact.

- **Program:** Audits 00–12 (technical, product ×2, voice/call, security, UX, UI, growth,
  performance, accessibility, enterprise, principal-engineer, billing), 76 findings (R-001–R-076).
- **Method:** static code reading only. See the defining limitation below.

---

## 1. The defining limitation: the product was never run

Every finding was produced by reading the repository. Across the whole program, **no audit**:
placed a phone call, loaded a page in a browser, logged in, completed onboarding, queried the live
database, measured a color-contrast ratio, or ran Lighthouse / a bundle analyzer / `npm audit`.

Consequence: a large share of findings are *"what the code implies will happen,"* not *"what was
observed to happen."* Individual audits flagged this locally (the Audit 03 Live Test-Call Protocol,
the Audit 08 budget marked "estimates," the Audit 09 "needs measurement" WCAG rows), but the
cumulative effect is easy to lose against a roadmap that reads with uniform confidence. Treat the
roadmap's confidence as **highest where it quotes literal code, lowest where it projects behavior,
scale, money, or law.**

## 2. Structural blind spots

- **The live database was invisible.** The base schema is not in the repo, the live DB has drifted
  past the migration files, and this workspace's Supabase MCP points at the **wrong project**
  (BondAI), so no Denku data was ever queried. `skills/database-schema.md` is reconstructed from
  calling code and may be wrong in specifics. Directly limits R-031, R-036, R-075.
  *(Reconfirmed 2026-07-07: the local env's Supabase project `kebqwsdguxxjsijahrox` no longer
  resolves via DNS — the DB is unreachable from this workspace entirely, so even a direct REST
  query is impossible; prod must run on separate live Vercel env not available here.)*
- **No production/runtime reality.** No visibility into the Vapi dashboard (actual assistant
  configs, tool attachment, webhook settings), the Stripe dashboard (real prices, configured
  events, live subscriptions), Vercel env vars (are secrets even set?), or logs/error-rates/
  incidents. Findings assume the code path equals live reality; it may not. Affects R-001, R-050,
  R-004/R-005/R-035, R-075.
- **No behavioral or business ground truth.** Audit 07 established there is *zero* analytics
  instrumentation (R-066) — so nobody, including this program, knows where users drop, whether the
  demo converts, or which plan is chosen. The product/growth conclusions (Audits 01, 02, 07) are
  therefore **hypotheses about human behavior**, not data. Real ARR, customer count, churn, and
  competitive position were also unknown.
- **Self-authored, self-anchored process.** The same author wrote `AUDIT_PLAYBOOK.md`, defined the
  audit register, and executed against it — so the program inherits that author's blind spots, and
  because the playbook (correctly) requires each audit to read prior findings first, later audits
  were anchored toward confirming the established "strong core, untrustworthy surfaces" narrative.
  That narrative may be true, but some of its apparent strength is self-reinforcement. **A skeptical
  reviewer who has NOT read the roadmap is the best check on it.**

## 3. Assumptions made (and their standing)

| Assumption | Standing / what it really is |
|---|---|
| The "$100M SaaS" severity bar | A role-play framing (assigned by the requester), not a claim about what *this* company at *its* stage should prioritize. Early-stage products rationally ship with some "Critical" items open. |
| "Legal exposure" of HIPAA/SLA claims (R-004) | A layperson's flag, **not legal advice**. Actual ToS, disclaimers, and contractual reality unknown — needs counsel. |
| Effort estimates (S/M/L/XL) | Guesses without knowledge of team velocity, hidden coupling, or true testability. Calibration, not measurement. |
| Priority ordering | This author's judgment; should be re-ranked against real data once R-066 exists. |
| Severity of volume-dependent findings (e.g. R-068) | Assumes data will grow; impact unconfirmed at current scale. |
| Design-system "split" (R-064) | Inferred from file-count / class-name patterns, not visual confirmation in a browser. |

## 4. Confidence levels (how much to trust what)

- **High — literal code, directly observed.** R-046 (hardcoded fake API keys), R-050
  (`syncAgentToVapi` omits `toolIds`; purchase route never attaches them), R-001 (no inbound auth
  on the webhook), R-002/R-003 (debug routes, PII headers), R-056 (no security headers), R-011
  (forgot-password link target), R-067 (no robots/sitemap/per-page metadata), R-037 (no tests),
  R-012/R-049 (placeholder/no-op screens). Act on these with normal engineering diligence.
- **Medium — strong code inference, needs confirmation of scale/reality.** R-068 (over-fetch;
  severity scales with data), R-069 (bundle weight; confirm with analyzer), R-013/R-051 (prompt/
  voice reaching Vapi — confirm live), R-064/R-065 (visual/vocabulary consistency).
- **Lower — projection about behavior, money, or external state.** Audits 01/02/07 activation/
  retention/funnel claims (no analytics), R-075/R-076 (billing math is *unversioned* — existence
  and behavior inferred from field names), anything schema-level (R-031/R-036), and all legal
  framings (R-004).

## 5. Limits of static code analysis (what this method cannot establish)

1. **Whether code equals production** — deploy state, env config, and manual dashboard settings
   (Vapi/Stripe) can diverge from the repo.
2. **Anything computed outside the repo** — the billing preview view/RPC (R-075) is the sharpest
   case: its math was inferred, never read.
3. **Runtime behavior** — latency, error rates, race conditions under load, and real failure modes.
4. **Human behavior** — conversion, activation, retention, comprehension (no instrumentation, R-066).
5. **Perceptual/measured facts** — contrast ratios, screen-reader output, actual bundle sizes.
6. **Legal/regulatory correctness** — claims, consent, residency, unit-economics viability.

## 6. Categories no audit covered (candidate future audits)

The register reflects the author's chosen lenses; these were not examined and are genuine gaps:

- **Reliability / incident readiness** — retries, dead-letter handling, alerting, on-call when
  Vapi/Supabase/Stripe are down (idempotency was audited; operational resilience was not).
- **Telephony law** — call-recording two-party-consent states, TCPA, data residency (only grazed by
  R-073). Real risk for a product that records customer calls.
- **Unit economics** — does each plan margin against Vapi + GPT-4o + carrier cost? (R-076 flags the
  *missing reconciliation*, not model viability.)
- **Non-billing data correctness** — the webhook's heuristic intent/completion/dedup logic.
- **Supply-chain security, email deliverability (SPF/DKIM/DMARC), real AT testing** — none done.

## 7. Human-verification checklist (ordered by cost of being wrong)

1. **R-050 — ✅ VERIFIED 2026-07-07 (Sprint 1 Task 1, read-only API).** No manual dashboard tool
   config exists to wipe: every tool-bearing assistant got its tools from `runActivation`'s merge,
   and the only manually-modified assistant is bound to no number. Both purchase-path lines are
   live with `toolIds: null` (R-050(a) is production fact); the settings-sync strip (b) has not
   fired on any live assistant yet. The fix is unblocked. Verification also surfaced **R-077**
   (live assistants' `serverUrl` = localhost) — its event-delivery question moved into item 2.
2. **R-001 — ✅ CONFIRMED unauthenticated in prod 2026-07-07 (Sprint 1 Task 2, benign probe).**
   `POST /api/webhooks/vapi` processes with no secret and with a bogus secret alike (`200
   ignored:no_call_id`) — no 401, no WAF/edge shield. Stage the fix (Task 5) so it never drops
   live ingestion; an unused `VAPI_WEBHOOK_SECRET` already exists in env. **R-077 sub-question
   partly answered:** Vapi has zero call history (test/staging), so nothing is dropped today; but
   whether an org-level Server URL is set, and which Supabase project prod uses, stay open — the
   local env's DB project no longer resolves, so the live DB remained invisible again (see §2).
3. **R-075 — pull the real invoice-preview view and reconcile against an actual Stripe invoice
   before touching billing code.** Do not refactor the money path on inference.
4. **R-031 / R-036 — validate against the real database;** the reconstructed schema and the
   wrong-project MCP make repo-only reasoning unreliable here.
5. **Audits 01/02/07 product priorities — instrument first (R-066), then let funnel data re-rank.**
6. **R-004 — have counsel review the compliance/marketing claims** before treating "legal exposure"
   as fact (or as merely cosmetic).

## 8. Lessons learned (for the next audit cycle)

- **Static analysis is excellent at "is this code correct/honest?" and poor at "does this product
  work / convert / bill correctly?"** Pair every behavioral or money finding with a runtime or data
  verification step before it drives spend.
- **Unversioned truth is a systemic hazard, not a one-off.** The single most repeated root cause was
  "the real thing lives outside the repo" — schema, billing math, Vapi/Stripe config. Baselining
  these into the repo (R-031) is upstream of trustworthy analysis of everything they touch.
- **You cannot optimize what you cannot measure.** No instrumentation (R-066) meant the entire
  product-audit layer had to reason without data. Instrumentation should precede product
  optimization, not follow it.
- **Auditing has sharply diminishing returns vs. execution here.** 76 findings with heavy overlap
  and clear top priorities already exist; further audits mostly re-confirm the narrative. The
  highest-value next move is *executing* the do-first shortlist, not producing Audit 13.
- **Separate "found by reading" from "confirmed by running" in every future finding.** This
  retrospective exists because that separation was implicit; make it explicit going forward.

---

*Living document. If a future contributor verifies (or refutes) an assumption here, update this
file AND the affected roadmap entry — an assumption that becomes a confirmed fact should graduate
out of §3/§7, and a refuted finding should be marked in the roadmap.*
