# CURRENT SPRINT — AI Employee Core (Sprint 8, narrow scope)

> Audit: `docs/audits/AI_EMPLOYEE_CORE_AUDIT.md` · model: `skills/platform-architecture.md`
> ("Control plane vs data plane") · memory: `docs/MEMORY_CONTRACT.md` · review: `docs/SPRINT_8_REVIEW.md`.

**Sprint 8 · 2026-07-24 · Status: ✅ CODE-COMPLETE**

> A 10-year architectural audit preceded any code. The owner approved a **deliberately narrow scope**:
> only the abstractions whose **cost of delay is permanent**. 284 tests green; build green; voice
> behavior unchanged.

## The architectural verdict (recorded)

**"Employee is the core" — agreed, with a distinction that changes the design.** Denku has two planes:

- **Control plane — Employee.** What an employee *is*. Hundreds of rows, human-authored, needs
  versioning/review/rollback/audit. **Denku had none of this.**
- **Data plane — Conversation.** What *happened*. Millions of rows, machine-written, needs
  throughput/retention. **Sprint 4.5 built this well.**

Employee is the core of the **control plane**; Conversation stays the core of the **data plane**.
Merging them would repeat the voice-first mistake at larger scale.

**Two corrections to the proposed manifest**, now encoded in the type:
1. **Desired state only** — cost/KPIs/health are *computed*, not configuration; a revision must be
   immutable. `validateManifest` actively rejects them.
2. **Reference, never embed** — knowledge/tools/automations are `*Refs`; embedding would mean 500
   employees = 500 copies of the same FAQ.

## What shipped

### S1 — Employee manifest revisions (R-107)  ·  ✅
Additive, RLS-locked `employee_manifests`: **immutable, append-only, content-hashed** revisions
(`UNIQUE(employee_id,revision)` + `UNIQUE(employee_id,content_hash)`). `agents` remains the identity
row — nothing renamed. Pure builder + deterministic hash (a no-op save cannot mint a revision) +
validation. `ensureCurrentRevision` is idempotent, race-safe, never throws, and **inert until migrated**.

### S2 — Provenance (R-107)  ·  ✅
`calls.manifest_revision_id` / `conversations.manifest_revision_id`; the Vapi webhook stamps the
handling revision at end-of-call inside its own try/catch. **"What prompt/model ran last Tuesday?" is
now answerable** — the piece that could never have been retrofitted.

### S3 — Memory contract (R-110)  ·  ✅ DESIGN ONLY
`docs/MEMORY_CONTRACT.md`: memory ≠ knowledge; separate store; explicit scope, provenance, confidence,
TTL; **mandatory erasure**; redaction before provider egress; off by default. Written *before* the
feature is wanted so the fast path is the correct path. **Nothing implemented, by decision.**

## Definition of done — met
Every employee gets a versioned manifest on first use; each call records which revision handled it;
config history is preserved rather than overwritten. Additive, inert-until-migrated, zero regression.

## Explicitly OUT of scope (filed, not built)
R-108 provider binding · R-109 shared versioned knowledge · R-110 memory *implementation* ·
R-111 tools registry · R-112 assignment/human takeover · R-113 tasks · R-114 policies ·
R-115 cost/KPI rollup · R-116 multi-persona · marketplace · multi-agent collaboration.

## Operator note
The manifest feature is **inert until `20260724300000_employee_manifests.sql` is applied** (add it to
`docs/LAUNCH_RUNBOOK.md` Phase 3). Until then everything behaves exactly as before.

## Next
Owner decision. Standing blocker for launch: **a staging env** → `docs/LAUNCH_RUNBOOK.md`.
Strongest customer-value candidate: **R-020 calendar sync**.
