# Marketing Honesty Pass — Draft for Review (R-004)

> **Status: DRAFT for owner + legal/counsel review. NOT shipped.** Sprint 6 (L5) deliberately does NOT
> edit the live marketing copy — over-claims (especially compliance) must be reviewed by the owner and
> counsel before any change. This catalogs each over-claim, why it's a risk, and an honest replacement.
>
> **Product truth (2026-07-24):** Voice is the only production-ready channel. Instagram is receive-only.
> There are no paying customers yet. Denku holds **no** SOC 2 or HIPAA certification. Booking works but
> is not a 100% guarantee. Any claim beyond this is an over-claim.

## Severity 1 — Compliance claims we cannot back (legal exposure — fix first)

Claiming certifications you don't hold is the fastest way to lose a first customer's trust and invite
liability. **Do not state or imply SOC 2 / HIPAA compliance until certified.**

| Where | Current copy | Risk | Honest replacement |
|---|---|---|---|
| `components/marketing/SecurityTeaser.tsx:11` | "SOC 2-aligned infrastructure. HIPAA compliance available on Scale." | Implies SOC 2 + offers HIPAA — neither held | "Security-first infrastructure: encrypted data, tenant isolation, audited access. (Formal SOC 2 / HIPAA are on our roadmap, not yet certified.)" |
| `components/marketing/pricing-data.ts:122` | "HIPAA & audit logs" (Scale plan feature) | Sells HIPAA as a feature | "Audit logs & advanced access controls" (drop HIPAA until certified) |
| `components/marketing/Security.tsx:57` | "enterprise-grade security without the complexity" | "enterprise-grade" implies certification | "strong, practical security: encryption in transit, tenant-scoped data, webhook authentication" |
| `components/marketing/social-proof.tsx:49`, `trust-scale.tsx:21` | "From webhook authentication to SOC 2 compliance…" | States SOC 2 compliance | "From webhook authentication to tenant isolation and audited access…" (remove SOC 2) |

**Recommendation:** replace all "SOC 2" / "HIPAA" / "enterprise-grade" *compliance* claims with
truthful descriptions of what's actually implemented (encryption, RLS/tenant scoping, webhook auth,
audit logs), and — only if the owner wants — a clearly-labeled "roadmap, not yet certified" note.
Counsel should approve the final security page.

## Severity 2 — Fabricated / uncited metrics (R-018 honesty)

| Where | Current copy | Risk | Honest replacement |
|---|---|---|---|
| `components/marketing/ProductPreview.tsx:24` | "Success Rate — 98.5%" | Invented statistic | Remove, or replace with a real, defined, measured metric once we have data (e.g. "Calls turned into an outcome") — never a made-up number |
| `components/marketing/OutcomesStrip.tsx:13` | "The average business misses 35% of inbound calls. That stops now." | Uncited stat | Cite a credible source inline, or soften: "Missed calls are missed customers — your AI answers the ones you can't." |

**Recommendation:** no numeric claim on the site unless it's either (a) sourced (external stat with a
citation) or (b) measured from real product data. Until then, remove invented figures.

## Severity 3 — Channel / capability over-claims (platform aspiration vs today)

| Where | Current copy | Risk | Honest replacement |
|---|---|---|---|
| `config/site.ts:12` | "answer every call, qualify every lead, and book every appointment — 24/7" | Absolute "every … book every" | "answer your calls 24/7, capture every lead, and turn conversations into booked appointments and tickets" (drop the absolute booking guarantee) |
| `components/marketing/about-page.tsx:68` | "from one channel to omnichannel" | "omnichannel" overstates (voice + IG-receive today) | "starts with voice and grows to more channels as we ship them" |
| `components/marketing/OutcomesStrip.tsx` | "Instant call summaries … sent to your inbox" | Notifications are staged/off until activation | Keep only once R-008 notifications are live; until then soften to "Every call transcribed and summarized in your dashboard." |

**Note on "24/7 / instant":** these are defensible **once the product is activated and verified** (the
AI genuinely answers 24/7). They become true at launch — keep, but don't claim them while the webhook
is observe-only / unverified.

## What NOT to over-correct

Truthful, already-shipping capabilities are fine to state plainly: 24/7 voice answering, transcription,
deterministic ticket/appointment creation ("never dead-end"), per-tenant isolation, usage-based
billing, Spanish + English. Don't hedge what actually works.

## Suggested process

1. Owner + counsel review this draft (especially Severity 1).
2. Apply approved changes to the marketing components in a single reviewed PR.
3. Re-run before launch: no compliance claim without certification, no uncited metric, no channel we
   haven't shipped. Add "marketing honesty" to the launch go-live checklist (already referenced in
   `docs/LAUNCH_RUNBOOK.md`).
