# AI Employee Core — Architectural Audit (10-year horizon)

> **Question:** with Voice, Instagram, WhatsApp, Email, Telegram, SMS, Slack, Teams, Web Chat and
> future providers all real — what is *fundamentally* missing from today's architecture? Not bugs:
> **missing abstractions.**
> Audited 2026-07-24 against the live code after Sprints 1–7. Findings are `E-###`, mapped to `R-###`.

---

## 1. The central question: should Employees be the core?

**Verdict: yes — but that sentence is imprecise in a way that matters, and taking it literally would
produce a worse architecture.**

Denku has two planes, and they should never merge:

| | **Control plane** | **Data plane** |
|---|---|---|
| Answers | "What *is* this employee, and how should it behave?" | "What actually happened?" |
| Entities | Employee, Knowledge, Tools, Automations, Policies, Providers | Conversations, Messages, Contacts, Artifacts, Usage |
| Volume | ~hundreds per org | ~millions per org |
| Changes | deliberately, by humans, rarely | constantly, by machines |
| Needs | versioning, review, rollback, audit | throughput, retention, indexing, partitioning |

**Sprint 4.5 built a competent data plane.** Conversations/contacts/artifacts are genuinely
channel-agnostic and hold up at scale.

**Denku has no coherent control plane.** That's the real gap, and "Employee is the core" is the right
instinct pointing at it. So: **Employee is the core of the control plane.** Conversation remains the
core of the data plane. If we made Employee "the center of everything" and hung conversations off it,
we'd have re-created the voice-first mistake at a bigger scale — a million-conversation table
partitioned by a config entity.

**One correction to the framing:** channels do *not* stop mattering — they become **bindings on the
Employee** rather than peers of it. Sprint 7 already did this (Employees own Channels). Nothing to undo.

---

## 2. The single most important missing abstraction

Not the manifest's field list. It is this:

> **Employee configuration is mutable, materialized, and unversioned — so Denku cannot reconstruct
> what an employee *was* when it handled a conversation.**

Concretely, verified in code:
- `agents.effective_system_prompt` is a **materialized string** derived from `business_context` +
  persona + overrides. Editing business context re-derives it and PATCHes Vapi. **The previous value
  is gone.**
- `calls` records `vapi_assistant_id` and `persona_key` — pointers to *mutable* things, not a snapshot.
  **There is no way to answer "what prompt/knowledge/model handled this call last Tuesday?"**

Everything the owner listed — versioned knowledge, multiple personalities, provider switching, A/B
testing, long-term memory, marketplace employees — **requires this and cannot be retrofitted**, because
the history you didn't record is gone forever. This is the one abstraction where *every day of delay
has a permanent cost*. That, more than elegance, is why it should be next.

**The abstraction: desired state (versioned) → reconciliation → observed state.**
- **Manifest revision** — immutable, versioned desired state of an Employee.
- **Reconciler** — projects a revision onto providers (Vapi assistant, model params, tools).
  Denku already has an ad-hoc instance of this (`ensureAssistantConfig` + `vapi_sync_status`); it's
  just not versioned or general.
- **Provenance** — every conversation records the **revision id** that handled it.

That last line is what turns "the AI said something wrong" from unanswerable into a diff.

---

## 3. Challenging the proposed manifest

The instinct is right; the field list has **two structural errors** worth fixing before any code.

### Error 1 — it mixes desired state with observed state
`Cost`, `KPIs`, and `Health` are **not configuration**. They're computed from the data plane. Putting
them *in* the manifest conflates "what I asked for" with "what happened" — the exact confusion that
makes systems unversionable (you can't have an immutable revision containing a changing cost).

> **Keep in the manifest:** Identity, Personality, Channels (bindings), Capabilities, Tools,
> Automations, Working Hours, Languages, Permissions, Escalation Rules, Goals, Provider, Version.
> **Move out (observed/derived):** Cost, KPIs, Health — computed per employee *from* conversations,
> usage, and connection health. Health already works this way (Sprint 7) and is better for it.

### Error 2 — it embeds what must be referenced
`Knowledge`, `Memory`, `Tools`, `Automations` listed as manifest *contents* implies each employee owns
a copy. At 500 employees per org that means 500 copies of the same FAQ, and versioned knowledge becomes
unmanageable (fix a typo → 500 edits). It also makes "employees share knowledge" impossible.

> **These are org-scoped, independently-versioned entities that a manifest *references* by id.**
> Employee = identity + policy + **references** + bindings.

### What's missing from the list entirely
- **Memory ≠ Knowledge.** Knowledge is *curated* (authored, versioned, reviewable). Memory is
  *accumulated* (learned from conversations, per-contact, decaying, and **erasable on request** —
  GDPR/CCPA). Same field name, opposite lifecycle, opposite legal treatment. Conflating them is a
  compliance incident waiting to happen.
- **Assignment / human takeover.** A conversation has no owner. "A human temporarily takes over" has
  nowhere to be recorded — no assignee, no state, no audit of who said what.
- **Tasks** (pending work: follow up tomorrow, call back, escalate if no reply in 2h). Artifacts are
  *outputs*; there is no unit of *pending intent*. Automations and escalation both need it.

---

## 4. Findings

### E-001 (Critical) — No versioned Employee manifest; configuration is unreconstructable
`effective_system_prompt` is materialized and overwritten; no revision history; conversations record no
config provenance. Blocks: rollback, A/B, audit, debugging, provider migration, marketplace.
**Cannot be retrofitted for past data.** → **R-107**

### E-002 (High) — AI provider is hardcoded in code, not bound as data
`classifyCallIntent` imports `OpenAI` and pins `gpt-4o-mini` inline; voice model/voice/transcriber are
literals in `assistantConfig`. "If OpenAI disappears tomorrow" is currently a **code change + redeploy**
for every path. It should be a manifest field + a provider registry (the same pattern the channel
registry proved in Sprint 7). → **R-108**

### E-003 (High) — Knowledge is a per-employee JSONB blob, not a shared versioned entity
`agents.business_context` is voice-prompt-shaped and employee-local. No sharing, no versioning, no
review, no reuse across employees or channels. (Supersedes/absorbs R-105.) → **R-109**

### E-004 (High) — No Memory abstraction (and no erasure path)
Nothing persists what an employee learned about a contact across conversations. When it's added
naively it will land in the prompt blob and become legally radioactive (no scope, no TTL, no redaction).
Needs to be designed *before* it's needed: scope (contact/employee/org), retention, and erasure. → **R-110**

### E-005 (High) — Tools are hardcoded provider UUIDs
`DENKU_TOOL_IDS = ["6c9b0279-…", "5373add8-…"]` — environment-coupled literals (a known landmine).
Tools should be a registry with per-employee grants, exactly like channels. This is also the seam for
a future marketplace/third-party tools. → **R-111**

### E-006 (Medium) — Conversations have no assignee; human takeover is unmodelled
No owner, no takeover state, no audit of human vs AI turns beyond `role`. Human+AI collaboration,
escalation, and "who handled this?" analytics all need it. → **R-112**

### E-007 (Medium) — No Task abstraction for pending work
Follow-ups, callbacks, and time-based escalation have nowhere to live. Automations (R-106) will invent
a private version of this if it isn't modelled. → **R-113**

### E-008 (Medium) — Policies (working hours, escalation, permissions) are absent or ad-hoc
Working hours exists only as a stub (R-054); escalation rules and per-employee permissions don't exist.
These belong in the manifest as declarative policy, not as code branches. → **R-114**

### E-009 (Medium) — No per-employee cost/KPI rollup
`cost_usd` lives on `calls`; there's no employee-level cost or outcome attribution — and with multi-
channel employees, "what does this employee cost and deliver?" is the question customers will ask.
Pairs with multi-dimensional billing (R-086). → **R-115**

### E-010 (Low) — Personality is one flat string; multiple personas are half-modelled
`router_persona_key`/`default_persona_key` + a `personas` table hint at multi-persona but aren't
coherently modelled or surfaced. Becomes real once manifests are versioned. → **R-116**

---

## 5. Stress tests ("what breaks first?")

| Scenario | What breaks today | Fixed by |
|---|---|---|
| **1M employees** | Reconciliation is O(n) synchronous PATCHes; no revision → no way to know which need syncing | E-001 (revisions + drift detection) |
| **OpenAI disappears** | Code change in every AI path | E-002 |
| **WhatsApp disappears** | Nothing structural — Sprint 7 handled it (registry + adapter) ✅ | — |
| **500 employees / org** | 500 copies of the same knowledge; every edit ×500 | E-003 |
| **Employee on 8 channels** | Works structurally (Sprint 7) ✅ — but one flat prompt for all channels is wrong (email ≠ voice) | E-001 + E-003 |
| **Two employees collaborate** | No handoff concept; no shared conversation ownership | E-006 + E-007 |
| **Human takes over** | Unrepresentable | E-006 |
| **Long-term memory** | No scope, no TTL, no erasure → compliance risk | E-004 |
| **Versioned knowledge** | Impossible (JSONB blob) | E-003 |
| **Reusable automations** | No entity; would be per-employee copies | E-007 + R-106 |
| **Shared knowledge** | Impossible | E-003 |
| **Multiple personalities** | Half-modelled | E-010 (needs E-001) |
| **Change LLM provider** | Code change; and no record of what old calls used | E-002 + E-001 |

The pattern: **Sprint 7 fixed the channel axis. Every remaining structural failure is on the
employee-configuration axis.** That's the honest justification for the owner's instinct.

---

## 6. What I am NOT recommending (guarding against impressive-but-wrong)

- **Not** an agent framework/DSL. Denku's moat is deterministic outcomes, not orchestration cleverness.
- **Not** a marketplace yet. It's a consequence of versioned manifests + tool registry — build the
  substrate, not the storefront.
- **Not** multi-agent collaboration. Needs assignment + tasks first; premature otherwise.
- **Not** rewriting `agents`. The manifest must be **additive**, with `agents` remaining the identity
  row — same discipline that made Sprints 4.5–7 non-breaking.
- **Not** memory implementation yet — design the scope/retention/erasure contract, implement when
  conversations are long-lived (E-004 is High as a *design* obligation, not a build-now item).

---

## 7. Recommended Sprint 8 — "Employee Manifest & Provider Binding" (control plane core)

**Thesis: build the smallest substrate that (a) cannot be retrofitted later, and (b) makes every other
item on the 10-year list a normal feature rather than a migration.**

- **S1 — Employee Manifest revisions (E-001/R-107).** Additive `employee_manifests` (immutable,
  versioned, org-scoped) holding identity + personality + policy + **references** + provider binding.
  `agents` stays the identity row; the current config becomes revision 1. Pure builder + validator.
- **S2 — Provenance (E-001).** Conversations/calls record the **manifest revision id** that handled
  them. *This is the piece with a permanent cost per day of delay.*
- **S3 — Provider binding as data (E-002/R-108).** A provider registry (llm/tts/stt) + manifest
  fields; `classifyCallIntent` and `assistantConfig` resolve from it instead of literals. Default
  bindings reproduce today's behavior exactly.
- **S4 — Knowledge as a referenced, versioned entity (E-003/R-109).** Org-scoped knowledge items
  referenced by manifests (business_context becomes revision 1 of a knowledge item). Shared across
  employees by construction.
- **S5 — Reconciliation + drift.** Generalize `ensureAssistantConfig` into "apply revision N to
  providers"; record observed state; expose drift (which employees aren't running their current
  revision) — the scale answer for 1M employees.

**Deliberately deferred:** Memory *implementation* (E-004 — design contract only), Tools registry
(E-005/R-111), assignment/human takeover (E-006), Tasks (E-007), policies beyond schema (E-008),
cost rollups (E-009), multi-persona (E-010), marketplace, multi-agent.

**Definition of done:** every employee has a versioned manifest; every new conversation records which
revision handled it; swapping LLM provider or model is a config change, not a code change; knowledge is
shared and versioned — all additive, flag-gated, with today's behavior byte-for-byte unchanged.

---

## 8. The honest counter-argument

This is the **third consecutive platform sprint** while the product has **zero paying customers** and
remains unlaunched (blocked on an operator-provisioned staging env). Sprint 6 argued — correctly — that
scaffolding before validation is negative leverage. I hold that view, with one exception that applies
here: **provenance and versioning are the only abstractions whose cost of delay is permanent.** Every
conversation handled without a recorded revision is history that can never be reconstructed. Knowledge,
memory, tools, tasks and marketplace can all wait for real customers to shape them. **Versioning cannot.**

If the owner would rather spend this cycle on customer-facing value instead, the honest alternative is
**R-020 (calendar sync)** — the last mile of "books appointments for real" — and I'd support that
choice. But if we build platform, this is the right platform to build, and S1+S2 alone (the
permanent-cost items) would be a defensible, much smaller sprint.
