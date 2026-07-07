# Audit 06 — UI / Design Audit

- **Date:** 2026-07-06 · **Findings current as of:** 2026-07-06
- **Lens:** Design director. Question: *does Denku look like one intentional, premium product — or
  several products stitched together?* Audit adherence to the per-surface design boundaries, not
  unification (unifying is a product decision; see `skills/design-system.md`).
- **Scope:** the four coexisting design systems, visual cohesion within each surface, tokens/fonts,
  and customer-facing copy/terminology rules.
- **Relationship to prior audits:** references R-027 (Horizon template ghosts), R-048 (loading
  states), R-018 (dashboard metric labels incl. "Active Agents"), R-055 (ticket `[Agent]` header).
  Adds the cross-surface cohesion and vocabulary findings.

> Living document (Rule 1). Canonical status: `docs/IMPLEMENTATION_ROADMAP.md`.

## The intended design system (for reference)

Per `skills/design-system.md`, Denku deliberately runs four systems on strict per-surface
boundaries: **(1)** warm "luxury" bone/teal/copper + Fraunces on marketing/auth/onboarding; **(2)**
Horizon UI (navy, `brand-500`, DM Sans) on the dashboard; **(3)** shadcn/oklch primitives for
in-dashboard form controls; **(4)** the approved-but-unbuilt hybrid-dark landing. Judged against
that intent, the marketing/auth/onboarding surface is cohesive and genuinely premium — the bone
theme with the Fraunces display serif, the editorial eyebrows, and the warm shadows is the best
craft in the product. The problems are inside the authenticated app.

## Findings

### [R-064 — NEW, Medium] The authenticated app looks like two different products
Within `/dashboard`, two visual identities collide on adjacent screens. The main dashboard, calls,
tickets, and analytics use **Horizon** — navy tokens, `brand-500` blue, `background-100`, rounded
Horizon cards (25 files reference navy/brand-500/background-100). The **settings tree** (API keys,
integrations, danger zone, workspace pages) uses **shadcn/zinc** — `rounded-2xl border
border-zinc-200 bg-white shadow-sm`, zinc text (29 files reference zinc styling). So a customer
who clicks from Analytics into Settings crosses from a navy Horizon product into a grey shadcn
product with different card shapes, borders, shadows, and type color — no transition, no shared
container. This isn't the *intended* four-system boundary (which separates marketing vs dashboard);
it's system #3 (shadcn primitives) having grown into full-page layouts it was never meant to own.
The effect is "assembled from parts," which directly undercuts the premium/enterprise perception
the pricing ($149–899/mo) demands. *Direction:* pick one card/page chrome for the entire
authenticated app (Horizon is the majority and the intended dashboard system) and reskin the
settings pages to it; keep shadcn for form controls only.

### [R-065 — NEW, Medium] Inconsistent product vocabulary in customer-facing UI
Denku's own rule (CLAUDE.md): say **"AI"**, never **"agent"**, in customer-facing UI outside
Settings → Agents/Advanced. In practice the product speaks four dialects: marketing says "AI
employee / AI receptionist," the dashboard says "agent" (a widget literally labeled **"Active
Agents"**, R-018), tickets embed **`[Agent]`** headers (R-055), and the code/settings say
"assistant." A business owner reads all four for the same thing within one session. Beyond the
rule violation, the *inconsistency itself* reads as unpolished and makes the product harder to
talk about. *Direction:* one terminology pass — settle the customer-facing noun (the brand's
"AI employee" is strong), enforce it everywhere outside the Settings/Advanced carve-out, and add
it to the design-system doc as a lint-able rule. Cross-refs R-018 (widget), R-055 (ticket header).

### Referenced (already filed)
- **R-027** Horizon template ghosts (repurposed revenue charts, "Approved/Disabled" statuses) make
  the dashboard read bought-not-built — same cohesion family as R-064.
- **R-048** loading states (spinner/`Loading…` div) aren't visually premium.
- **R-046/R-049/R-012** fabricated/placeholder screens are also *visual* trust leaks (masked fake
  keys, "Coming soon" chips) but are tracked as product/trust findings.
- Marketing-surface craft (bone/teal/Fraunces) is a **strength to preserve** — don't let the
  landing redesign (R-022) or any "unification" impulse degrade it.

## Product Score (Polish): 5.5 / 10

The marketing/auth/onboarding surface would score ~8 — it's cohesive, warm, and premium. The
authenticated app pulls the average down hard: two visual systems collide across the dashboard/
settings seam (R-064), template ghosts remain (R-027), terminology is inconsistent (R-065), and
loading/error states are unfinished (R-048/R-061). Perceived quality is set by the *paid* surface,
and that surface currently looks assembled. Reskinning settings to Horizon and one terminology
pass move polish to ~7 quickly; the Horizon ghost cleanup and premium loading states take it
further.

## Executive Summary

Denku doesn't have a design-talent problem — the marketing surface proves the team can build
beautiful, cohesive UI. It has a *consistency* problem confined to the authenticated app: the
dashboard and settings look like two different products (R-064), the same object is named four
ways (R-065), and bought-template artifacts still show through (R-027). All three are cohesion
work, not redesigns — pick one app chrome, one product noun, and finish the Horizon adoption. Do
that and the paid experience finally *looks* worth what it costs, matching the genuine quality of
the marketing front door. Preserve the bone/teal/Fraunces marketing craft as the reference for
"premium" — it's the bar the rest of the product should rise to, not something to flatten.

## Action Items

| # | Action | R-ID | Priority |
|---|---|---|---|
| 1 | Reskin settings pages to the dashboard (Horizon) system; one app chrome | R-064 | Medium |
| 2 | One customer-facing product noun; enforce "AI not agent" everywhere | R-065 | Medium |
| 3 | Replace Horizon template ghosts with call-outcome widgets | R-027 | Medium |
| 4 | Premium skeleton loading states | R-048 | Medium |
