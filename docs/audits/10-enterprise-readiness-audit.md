# Audit 10 — Enterprise Readiness Audit

- **Date:** 2026-07-06 · **Findings current as of:** 2026-07-06
- **Lens:** buyer-side CISO + procurement lead evaluating Denku for a >$10k-ACV deal. Question:
  *would this survive a security-and-procurement review, and what's the gap between the enterprise
  tier we sell (Scale, $899) and the enterprise product we have?*
- **Scope:** identity (SSO/2FA/RBAC/SCIM), audit-log coverage, data lifecycle (export/deletion/
  retention), compliance substance vs claims, tenancy assurance.
- **Relationship to prior audits:** the broad enterprise gap is filed as R-045; this audit gives it
  procurement-grade granularity and adds the two concrete, separately-shippable pieces (audit-log
  coverage, data lifecycle). Compliance-claim fabrication is R-004; admin identity is R-057; tenant
  isolation assurance is R-060/R-037.

> Living document (Rule 1). Canonical status: `docs/IMPLEMENTATION_ROADMAP.md`.

## The core tension

Denku **sells** an enterprise tier — Scale ($899/mo) with marketing promising "HIPAA & audit logs,"
"SLA," "Account manager," "API access," and "SSO/SAML (Roadmap)" — but **has** essentially none of
the enterprise substance. A procurement review doesn't fail Denku for missing features; it fails it
for the *gap between claim and reality* (R-004) plus the absence of table-stakes controls. Every
finding below is something a mid-market security questionnaire asks about explicitly.

## Findings

### Identity & access (filed under R-045 — enriched here)
- **No SSO/SAML/OIDC** — confirmed absent (no SAML/SSO/OIDC anywhere in the code). A hard "no" on
  most enterprise questionnaires.
- **No 2FA/MFA** anywhere, including for the platform-admin surface (which is a single shared
  Basic-Auth credential — R-057). MFA is a near-universal procurement gate.
- **No SCIM / directory provisioning**; user lifecycle is manual (and invites are broken — R-010).
- **RBAC is coarse:** three string roles (`owner`/`admin`/`viewer`) with `viewer` only partially
  enforced; no granular/custom permissions despite the security page claiming "define custom roles."

### [R-072 — NEW, High] Audit log covers system events, not user actions
An `audit_log` table + viewer exist (a real head-start), but coverage is **system/billing-centric**:
the logged actions are `pause`/`resume`, `enforce_telephony_pause`, `vapi.assistants.enabled/
disabled`, `settings.update`, `agent.update`, lease events, and webhook-ignored. **Missing the
"who did what" a security review requires:** logins/auth events, member add/remove/role-change, data
access/export, billing/plan changes by a user, and field-level settings diffs attributed to a human.
Worse, because platform admin is one shared credential (R-057), admin actions can't be attributed to
an individual at all. *Direction:* expand audit coverage to user/security events with actor
attribution; make it exportable and tamper-evident; this is a SOC 2 CC-series prerequisite.

### [R-073 — NEW, High] No data lifecycle: export, deletion, or retention controls
Denku stores **call transcripts** — PII-heavy, sometimes sensitive — yet there is **no customer data
export, no account/data deletion path** (the "Disable workspace" control is a no-op, R-049), and **no
configurable retention** (the security page advertises "30/90/custom day retention" that doesn't
exist — R-004). This fails GDPR/CCPA data-subject-rights obligations and enterprise data-handling
requirements, and it's a direct contradiction of marketed claims. *Direction:* self-serve data
export (calls/tickets/transcripts), a real deletion flow (hard-delete + Vapi/Stripe teardown +
confirmation), and configurable retention with automatic purge (also caps the `webhook_debug`/
`raw_payload` growth flagged in R-032/R-068).

### Compliance substance (filed)
- **R-004** — HIPAA/SLA/SOC-2-ready claims without substance are the single biggest due-diligence
  liability (misrepresentation risk, not just a missing feature).
- **R-060/R-037** — tenant isolation has no RLS backstop and no tests; "how do you guarantee tenant
  isolation?" currently has no defensible answer.
- **R-001** — an unauthenticated ingestion webhook is an automatic finding in any pen-test/review.

## Procurement Blocker List (the hard "no" items)

| # | Blocker (questionnaire item) | R-ID |
|---|---|---|
| 1 | "Do you support SSO/SAML?" — No | R-045 |
| 2 | "Is MFA available (incl. admins)?" — No | R-045, R-057 |
| 3 | "Provide your audit-log / who-did-what capability" — system-only, no user attribution | R-072 |
| 4 | "How do we export/delete our data? Retention policy?" — none | R-073 |
| 5 | "Compliance attestations (SOC 2 / HIPAA / DPA)?" — claimed, not held | R-004 |
| 6 | "How is tenant isolation enforced/tested?" — discipline-only, no RLS/tests | R-060, R-037 |
| 7 | "Any unauthenticated endpoints?" — yes, the ingestion webhook | R-001 |
| 8 | "Accessibility conformance (VPAT)?" — unaudited | R-070, R-071 |

## What would reduce valuation in due diligence?

- **Misrepresentation exposure:** the enterprise tier is sold on capabilities that don't exist
  (R-004) — an acquirer prices in rebrand/cleanup cost, refund risk, and reps-and-warranties concern
  on the highest-revenue tier.
- **Undefensible tenancy story:** service-role-everywhere with no RLS/tests (R-060/R-037) is the
  first thing a technical DD lead probes; "one missing filter = cross-tenant breach" is a valuation
  discount.
- **Unattributable admin + shared credential (R-057):** insider-risk and key-person risk.
- **Regulatory posture (R-073):** PII (transcripts) with no export/deletion/retention is a live
  compliance liability, not a roadmap item.
- **No enterprise motion to defend the top of the revenue mix:** the $899 tier is the least
  defensible dollar in the book.

## Executive Summary

Denku is not enterprise-ready, which is fine for its stage — except that it *sells* an enterprise
tier, which converts every gap into a misrepresentation liability. The single most valuable move is
to **stop selling what doesn't exist** (R-004) and reframe Scale honestly, then build the
enterprise substance in the order procurement actually checks: attributable audit logging (R-072)
and data lifecycle/export-deletion-retention (R-073) first — both are concrete, separately shippable,
and also pay down real security/PII risk — followed by the identity pack (SSO + MFA + real RBAC,
R-045/R-057) and the tenancy-assurance work (RLS + tests, R-060/R-037). Until then, the honest
enterprise posture is "SMB self-serve," and the marketing must match it.

## Action Items

| # | Action | R-ID | Priority |
|---|---|---|---|
| 1 | Stop selling non-existent enterprise/compliance capabilities; reframe Scale | R-004 | Critical |
| 2 | Expand audit log to user/security events with actor attribution + export | R-072 | High |
| 3 | Data export + deletion + configurable retention (PII/GDPR) | R-073 | High |
| 4 | Enterprise identity pack: SSO + MFA + real RBAC | R-045, R-057 | Low (until enterprise pipeline real) |
| 5 | Defensible tenancy: RLS backstop + tests | R-060, R-037 | High |
| 6 | Accessibility conformance for VPAT | R-070, R-071 | Medium |
