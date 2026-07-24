# AI Employee Memory — Design Contract (R-110)

> **Status: DESIGN ONLY. Nothing is implemented, and nothing should be until this contract is
> satisfied.** Written in Sprint 8 deliberately *before* the feature is wanted, because the failure
> mode here is not a bug — it's a compliance incident, and it arrives silently.
>
> **The rule this document exists to enforce:**
> **Memory must never be written into an employee's prompt/knowledge blob.**

## 1. Why this is written early

The pattern is predictable: someone needs "the AI should remember this caller," the fastest path is
appending to `agents.business_context` or the effective prompt, and now personal data about named
individuals is (a) duplicated into every conversation's context, (b) unversioned, (c) impossible to
locate, and (d) impossible to erase on request. By then it's in provider logs too.

Writing the contract first makes the fast path the correct path.

## 2. Memory ≠ Knowledge (the distinction the audit found missing)

| | **Knowledge** (R-109) | **Memory** (R-110) |
|---|---|---|
| Origin | **Curated** — authored by the business | **Accumulated** — inferred from conversations |
| Subject | The business (hours, services, policies) | Usually a **person** (contact) |
| Lifecycle | Versioned, reviewed, deliberate | Decaying, probabilistic, automatic |
| Sharing | Shared across employees by design | Scoped; sharing is a **privacy decision** |
| On request to delete | N/A | **Must be erasable — legal obligation** |
| Correctness | Authoritative | *Believed*, may be wrong |
| Belongs in a manifest? | By reference | **Never** |

They are opposites in every row that matters. One field name for both would be a design error.

## 3. Required properties (all mandatory before any implementation)

1. **Separate store.** A dedicated table (e.g. `employee_memories`), never a column on `agents` and
   never inside a manifest revision. Manifests are immutable; memory is not.
2. **Explicit scope.** Every memory row declares its subject and visibility:
   - `contact` — about one person (the common case)
   - `employee` — an employee's operating notes, no personal subject
   - `org` — organisation-wide learned facts
   Cross-scope reads must be explicit, never implicit.
3. **Provenance.** Every memory records **where it came from** (conversation id, message id) and
   **when**. A memory that cannot be traced to a source cannot be defended, corrected, or audited.
4. **Confidence + decay.** Memories are beliefs, not facts. Each carries a confidence and a
   `last_confirmed_at`; stale memories decay out of retrieval rather than persisting forever.
5. **Retention (TTL).** A default maximum age, org-configurable, enforced by a sweep job — not by
   hoping someone deletes it.
6. **Erasure — the hard requirement.** Deleting a **Contact** must delete that contact's memories,
   and a per-contact "forget" must exist as a first-class operation with an audit record. Because
   memory is a separate store keyed by subject, erasure is a `DELETE … WHERE contact_id = …` rather
   than an unbounded search through prompt text. **This property alone justifies the whole design.**
7. **Redaction before egress.** Memory injected into a provider prompt must pass a redaction step;
   what is sent to a third-party model is a disclosure and must be minimizable.
8. **Tenant isolation.** `org_id` on every row, RLS-locked, service-role only — the house rule.
9. **Inspectable + correctable by the customer.** A business must be able to see and delete what an
   employee "remembers" about a contact. Invisible memory is unacceptable.
10. **Off by default.** Ships behind a flag; no memory is collected until a customer opts in.

## 4. Explicit non-goals

- **Not** a vector database or RAG pipeline (that's Knowledge retrieval — a different problem).
- **Not** cross-**tenant** learning. Ever. One org's conversations must never inform another's.
- **Not** model fine-tuning on customer data.
- **Not** silent inference of sensitive attributes (health, finances, protected characteristics).

## 5. Preconditions before building

- **Knowledge (R-109) lands first.** Without a curated store, memory becomes the dumping ground for
  everything — the exact conflation this document prevents.
- **Conversations are long-lived** (chat channels in real use), so memory has a job to do.
- **A real customer need**, not a hypothetical. Memory designed against imagined usage will be wrong.
- **Legal review** of retention + erasure defaults (GDPR/CCPA), like the R-004 marketing pass.

## 6. Acceptance criteria (definition of done, when it is eventually built)

- [ ] Memory lives in its own store; **zero** memory text in manifests, prompts-at-rest, or `agents`.
- [ ] Every row: `org_id`, subject scope, source conversation, created/confirmed timestamps, confidence.
- [ ] Deleting a contact provably deletes its memories (tested).
- [ ] Per-contact "forget" exists, is audited, and is reachable in the UI.
- [ ] Retention sweep runs and is verified.
- [ ] Redaction applies before any provider call.
- [ ] Feature-flagged, default OFF; documented in the launch runbook.

---

*Filed as R-110. Referenced by `docs/audits/AI_EMPLOYEE_CORE_AUDIT.md` (E-004). Do not implement
memory without revisiting this document first.*
