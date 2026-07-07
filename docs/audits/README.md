# Denku Audit System

This directory is the **institutional memory** of every audit performed on Denku. Together with
`docs/IMPLEMENTATION_ROADMAP.md`, it lets any future session (human or AI) understand the current
product, past findings, decisions, and implementation status **without re-auditing the codebase**.

> **The full official standard is [`docs/AUDIT_PLAYBOOK.md`](../AUDIT_PLAYBOOK.md)** — audit
> philosophy, workflow, roadmap rules, audit categories, finding template, and the completion
> checklist. This README is the condensed reference; where they disagree, the playbook wins.

## How the system fits together

```
docs/PROJECT_VISION.md        ← north star — what Denku believes (beliefs, not build)
docs/PROJECT_CHARTER.md       ← operating principles — how we decide, ship, measure
CLAUDE.md                     ← stable engineering memory (architecture, rules, landmines)
CURRENT_SPRINT.md             ← the active implementation sprint (what's being built right now)
skills/*.md                   ← subsystem deep-dives (how things work)
docs/IMPLEMENTATION_ROADMAP.md← MASTER FINDINGS TRACKER — single source of truth for issues
docs/EXECUTION_PLAN.md        ← how to act on findings safely (implement/decide/external)
docs/RETROSPECTIVE.md         ← confidence layer — blind spots, assumptions, verify-first
docs/audits/NN-*.md           ← audit narratives — the WHY and evidence behind each finding
```

**The roadmap is the single source of truth for issue status.** Audits provide narrative,
evidence, and context; the roadmap tracks priority, effort, dependencies, and status. An issue
lives in exactly ONE roadmap entry, no matter how many audits observe it.

## Finding IDs

- Every finding gets a permanent roadmap ID: **`R-###`** (sequential, never reused, never renumbered).
- Audits reference findings by ID (`R-004`). If a new audit rediscovers a known issue, it
  **references the existing ID** and adds its perspective to that roadmap entry — it does NOT
  create a new entry (Rule 2).
- Within an audit, findings may also carry local labels (e.g. `C1`, `H8`) for readability, but the
  R-ID is canonical.

## Audit file conventions

- Filename: `NN-short-slug.md`, NN = two-digit sequence (`00-technical-architecture-audit.md`,
  `01-ceo-product-audit.md`, next: `02-…`).
- Required header block: audit date, auditor/lens, scope, and a **living-document status line**
  (e.g. "Findings current as of YYYY-MM-DD").
- Required footer (Rule 7): an **Executive Summary** and an **Action Items** list that maps each
  action to its `R-###` ID.
- Findings must cite evidence (file paths, screens, flows) so future readers can re-verify.

## The rules (binding for every future audit)

1. **Every audit is a living document.** When reality changes, update the audit in place and bump
   its "current as of" date. Do not append "UPDATE:" logs — rewrite the affected finding.
2. **Never create duplicate findings.** Before writing a finding, search
   `IMPLEMENTATION_ROADMAP.md` for an existing `R-###`. Match found → reference it.
3. **Resolved issues get updated, not re-copied.** Mark the roadmap entry `Completed` (with date +
   how), and update the originating audit's finding to note resolution. Never delete the finding —
   the record of what was wrong and how it was fixed IS the institutional memory.
4. **Every audit updates the roadmap in the same change.** New findings → new `R-###` entries
   (with all fields: Title, Priority, Business Impact, Technical Impact, Estimated Effort,
   Dependencies, Status, Related Audit, Recommended Solution). No audit is "done" until the
   roadmap reflects it.
5. **Cross-reference between audits.** When findings interact (e.g. a product gap caused by a
   technical stub), link both audit sections and both R-IDs to each other.
6. **Documentation reflects the CURRENT state, not history.** If a finding's severity changes, or
   a screen is redesigned, update the text. Git history is the archive; the docs are the present.
7. **Each audit ends with an Executive Summary and Action Items.**

## Workflow for a future audit session

1. Read `CLAUDE.md` → `CURRENT_SPRINT.md` → `docs/IMPLEMENTATION_ROADMAP.md` → prior audits here.
2. Perform the audit through its lens (security, performance, accessibility, SEO, pricing, …).
3. For each finding: dedupe against the roadmap (Rule 2), then write it in the audit with evidence
   and an R-ID (existing or newly allocated — next free number).
4. Update `IMPLEMENTATION_ROADMAP.md`: add new entries, adjust priorities/status of touched ones,
   refresh the summary table at the top.
5. Finish the audit doc with Executive Summary + Action Items.
6. If the audit changes engineering guidance, also update `CLAUDE.md` / `skills/*` (same change).

## Statuses

`Open` → `In Progress` → `Completed` (with date). Use `Won't Fix` (with reasoning) for consciously
rejected findings — never silently delete them.

## Audit index (completed audits)

| # | Audit | Lens | Date | Findings current as of |
|---|---|---|---|---|
| 00 | [Technical architecture audit](00-technical-architecture-audit.md) | Full-stack engineering review | 2026-07-06 | 2026-07-06 |
| 01 | [CEO / Product audit](01-ceo-product-audit.md) | CEO/CPO product & growth review | 2026-07-06 | 2026-07-06 |
| 02 | [CEO / Product — Premium Experience](02-ceo-product-audit.md) | 4-persona premium-experience review (CEO/Founder/CPO/Head of CX) | 2026-07-06 | 2026-07-06 |
| 03 | [Voice Agent / Call Experience](03-voice-agent-call-experience-audit.md) | The call itself: prompts, tools, guardrails, artifacts + live test-call protocol | 2026-07-06 | 2026-07-06 |
| 04 | [Security](04-security-audit.md) | Route auth matrix, tenant isolation, secrets, headers + risk register | 2026-07-06 | 2026-07-06 |
| 05 | [UX](05-ux-audit.md) | Task flows, IA, feedback, error/empty/loading resilience | 2026-07-06 | 2026-07-06 |
| 06 | [UI / Design](06-ui-design-audit.md) | Four-system adherence, dashboard/settings cohesion, vocabulary | 2026-07-06 | 2026-07-06 |
| 07 | [Growth](07-growth-audit.md) | Funnel map, conversion instrumentation, SEO/discovery, CTA integrity | 2026-07-06 | 2026-07-06 |
| 08 | [Performance](08-performance-audit.md) | Bundle weight, query/fetch efficiency, write amplification + budget table | 2026-07-06 | 2026-07-06 |
| 09 | [Accessibility](09-accessibility-audit.md) | WCAG 2.2 AA: landmarks, ARIA, focus, contrast, alternatives | 2026-07-06 | 2026-07-06 |
| 10 | [Enterprise Readiness](10-enterprise-readiness-audit.md) | Identity, audit-log coverage, data lifecycle, procurement blockers | 2026-07-06 | 2026-07-06 |
| 11 | [Principal Engineer](11-principal-engineer-audit.md) | Craftsmanship, type safety, refactor sequencing | 2026-07-06 | 2026-07-06 |
| 12 | [Billing Correctness](12-billing-correctness-audit.md) | The money math: usage→minutes→overage→invoice + reconciliation | 2026-07-06 | 2026-07-06 |

*(Add new rows here as audits complete — this index is part of Rule 4.)*

**The full pipeline (which number is which lens, including planned audits) lives in the Audit
Register in [`../AUDIT_PLAYBOOK.md`](../AUDIT_PLAYBOOK.md).** To start the next one, a session needs
only the instruction **`Begin Audit XX`** — the playbook resolves the rest.
