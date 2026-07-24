# Sprint 8 Review & Retrospective — AI Employee Core (narrow scope)

- **Sprint:** 8 · **Window:** 2026-07-24 · **Status:** **code-complete**
- **Approved scope:** S1 manifest revisions + S2 provenance only; memory = **design contract only**.
- **One-line verdict:** **Denku can now reconstruct what an AI Employee was when it handled a
  conversation.** That was the only abstraction whose cost of delay was permanent — and it's closed.
  **3 commits, 284 tests green, build green, voice behavior unchanged.**

---

## 1. The audit came before the code (and challenged the premise)

The owner asked whether Employees should become the product's true core, and explicitly asked to be
challenged. The answer: **agreed — but the phrasing hides a distinction that would have produced a
worse architecture if taken literally.**

Denku has **two planes**: a **control plane** (what an employee *is* — hundreds of rows, human-authored,
needs versioning/review/rollback) and a **data plane** (what *happened* — millions of rows,
machine-written, needs throughput/retention). Sprint 4.5 built a competent data plane. **Denku had no
coherent control plane** — that's the real gap, and "Employee is the core" correctly points at it.
So: Employee is the core of the *control plane*; Conversation stays the core of the *data plane*.
Hanging conversations off the employee would have repeated the voice-first mistake at larger scale.

**Two corrections to the proposed manifest**, both now enforced in code:
1. **It mixed desired with observed state.** Cost/KPIs/Health are computed, not configured — they
   cannot live in an immutable revision. `validateManifest` now *rejects* them.
2. **It embedded what must be referenced.** Knowledge/Tools/Automations as manifest contents would
   mean 500 employees = 500 copies of the same FAQ, and shared knowledge would be impossible.

**Missing from the proposal entirely:** Memory ≠ Knowledge (accumulated + erasable vs curated +
versioned), conversation assignment (human takeover was literally unrepresentable), and Tasks.

## 2. The finding that justified the sprint

`agents.effective_system_prompt` was **derived then overwritten** on every edit, and `calls` stored
only *mutable pointers* (`vapi_assistant_id`, `persona_key`). So "what prompt/model handled this call
last Tuesday?" was **unanswerable** — and unrecorded history is unrecoverable. Versioned knowledge,
multi-persona, provider switching, A/B testing and marketplace all depend on it.

That's why this — and not the fuller manifest — was the right thing to build first.

## 3. What shipped

| Item | Delivered |
|---|---|
| **S1 Manifest revisions** | Additive RLS-locked `employee_manifests`: immutable, append-only, content-hashed (`UNIQUE(employee_id,revision)`, `UNIQUE(employee_id,content_hash)`). Pure builder + deterministic stable-stringify hash + validation. `ensureCurrentRevision`: idempotent, race-safe, never throws, **inert until migrated**. |
| **S2 Provenance** | `calls/conversations.manifest_revision_id`; the Vapi webhook stamps the handling revision at end-of-call, inside its own try/catch. |
| **S3 Memory contract** | `docs/MEMORY_CONTRACT.md` — design only, by decision. |

**Proof it works as intended** (tested): changing an employee's prompt mints revision 2 while
**revision 1 keeps its original prompt** — history preserved, not overwritten. Saving with no change
mints nothing.

## 4. Design decisions

- **Descriptive first, authoritative later.** The manifest *records* what actually runs (provider,
  model, voice, tool ids still live in code). It doesn't yet drive behavior — so this sprint carries
  zero behavioral risk, and R-108 makes the same fields authoritative with no shape change.
- **Inert until migrated.** Every path returns `null` if `employee_manifests` doesn't exist. The
  feature can sit in `main` indefinitely without an operator, changing nothing.
- **Content hash over timestamps.** Revision churn would make history unreadable; hashing means a
  revision exists if and only if the configuration genuinely differs.
- **`agents` untouched.** Same additive discipline as Sprints 4.5–7: identity stays, config gets a
  new versioned home.
- **Memory contract written before the feature.** The failure mode there is a compliance incident,
  not a bug, and it arrives via the *fastest* implementation path. Writing the contract early makes
  the fast path the correct path.

## 5. Metrics

| Metric | Value |
|---|---|
| Commits | 3 (audit+roadmap · S1/S2 · docs) |
| New migration | `20260724300000_employee_manifests` (additive, RLS-locked, rollback documented) |
| New modules | `lib/platform/manifest/{types,build,revisions}.ts` |
| Tests | 272 → **284** (+12) |
| Build | passes · typecheck clean |
| Breaking changes | **0** (additive; inert until migrated; voice unchanged) |
| Roadmap | R-107 done, R-110 contract written; +R-108..R-116 filed; 48 completed / 66 open |

## 6. Lessons

- **Audit the abstraction, not the code.** The instruction was "don't look for bugs, look for missing
  abstractions" — and the most valuable finding (unversioned config) is invisible to any bug hunt
  because nothing is broken; something is merely *unrecorded*.
- **Distinguish permanent-cost work from deferrable work.** Almost everything on a 10-year list can
  wait for real customers to shape it. Provenance cannot — that asymmetry, not elegance, is what
  justified building now with zero paying customers.
- **Narrow scope was the right call.** The full manifest (knowledge, tools, providers, policies) would
  have been speculative; the owner's choice of S1+S2 captured the irreversible value at ~10% of the size.
- **Write the dangerous contract early.** Memory would have arrived as a one-line append to a prompt
  blob. A document costs an hour and prevents an unbounded personal-data search later.

## 7. What remains

- **Operator:** apply `20260724300000_employee_manifests.sql` (runbook Phase 3). Until then, inert.
- **Filed, not built:** R-108 provider binding · R-109 shared knowledge · R-110 memory implementation ·
  R-111 tools registry · R-112 assignment/human takeover · R-113 tasks · R-114 policies · R-115
  cost/KPI rollup · R-116 multi-persona.
- **Unchanged blocker:** launch needs a **staging env** → `docs/LAUNCH_RUNBOOK.md`.
- **Standing recommendation:** the strongest *customer-value* next step is **R-020 calendar sync**, not
  more platform work.

## 8. Is Sprint 8 code-complete?

**Yes**, for the approved scope. Every employee now gets a versioned manifest on first use; every call
records which revision handled it; configuration history is preserved instead of overwritten — all
additive, inert-until-migrated, with today's behavior byte-for-byte unchanged.

---

*Companion to `docs/audits/AI_EMPLOYEE_CORE_AUDIT.md` and `docs/MEMORY_CONTRACT.md`.*
