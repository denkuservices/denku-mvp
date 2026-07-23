# Skill: Design system

> Four visual systems coexist in this app ON PURPOSE (per-surface). The cardinal sin is leaking
> one surface's system into another. Read this before styling anything.

## System 1 — Denku "luxury" brand (marketing, auth, onboarding, pre-onboarding chrome)

- Tokens (defined as CSS vars under `.brand-surface` in `web/src/app/globals.css`, but in practice
  written as **inline hex** throughout components — match that style, don't invent Tailwind tokens):
  - Bone `#F7F5F1` (bg) / `#FBFAF8` / `#EFEBE4`
  - Ink `#0A1A2F` (text) / `#2C3E54` / `#6B7888`
  - Teal `#1B6E6E` (accent) / `#134F4F` / `#E3EEED`
  - Copper `#B8895A` (micro-accent)
- Type: **Fraunces** (`.font-display`, serif display), Inter (body), JetBrains Mono
  (`.font-brand-mono`, eyebrows) — loaded via Google CSS `@import` at the top of globals.css.
- Signature classes: `.brand-eyebrow` (mono uppercase w/ leading line), `.brand-shadow-{sm,md,lg}`
  (warm shadows), `.brand-reveal` (scroll reveal, used with `Reveal.tsx`), `.mic-pulse`,
  `.brand-float`. All have `prefers-reduced-motion` fallbacks — keep that when adding animations.
- Logo treatment: `den<span class="text-[#1B6E6E]">ku</span>` — lowercase, teal "ku".
- Brand voice: Stripe/Linear/Vercel — short sentences, confidence over excitement. Banned:
  "revolutionary", "game-changing", hype generally. Product noun: "AI employees"/"AI
  receptionists" (marketing) but never "agent" in dashboard copy (see below).

## System 2 — Horizon UI (dashboard only)

- Purchased template adapted via `components/horizon-shell/*` + `components/ui-horizon/*`.
- Type: **DM Sans** via `next/font` in `(app)/layout.tsx` (+ Poppins from the Google import).
- Color tokens in `@theme inline` (globals.css): `brand-500 #3b82f6` (primary buttons),
  `background-100 #f4f7fe` / `background-900 #0b1437`, navy dark shades, Horizon shadows.
- Charts: ApexCharts. Dark-mode classes (`dark:`) exist in dashboard components; the `.dark`
  variant is wired via `@custom-variant` and next-themes is installed, but dark mode is not a
  supported end-user feature yet — don't half-enable it.
- Rule from Sprint 8: primary CTAs in dashboard = `bg-brand-500` / `Button variant="primary"`.

## System 3 — shadcn primitives (`components/ui/*`)

- oklch token set in `:root`/`.dark` (globals.css), `components.json` present, Radix-based
  primitives (dialog, select, popover, command, button, spinner). Used inside settings forms and
  modals within the dashboard. Fine to keep using for form primitives; skin them to the
  surrounding surface.

## System 4 — Hybrid dark landing (APPROVED SPEC, NOT BUILT)

- Spec: `web/LANDING_REDESIGN_SPEC.md` — read top-to-bottom before building. Summary:
  - Zone A hero: cinematic near-black (`#06070C`), keep the **Spline robot**
    (scene `https://prod.spline.design/UAZ0yJcBnzG0I0Yb/scene.splinecode`, rendered by
    `SplineClient.tsx`, ssr:false, env `NEXT_PUBLIC_SPLINE_SCENE_URL`).
  - Zone B: gradient transition hinge (emotion → clarity).
  - Zone C: Stripe-style structured dark SaaS (`#0B0D14`, 1px borders `rgba(255,255,255,0.08)`).
  - Bone becomes a MICRO-accent only; teal survives as glow/edge.
  - Component sourcing: Magic MCP (21st.dev) for all UI components; `ui-ux-pro-max` skill for
    token/font validation.
- **Scope guard:** this dark system is for the LANDING. Onboarding/auth/dashboard keep their
  current themes unless the user explicitly says otherwise.

## Font-loading reality (be careful)

Fonts arrive four ways today: Google `@import` (Poppins, Fraunces, Inter, JetBrains Mono),
`next/font` DM_Sans in the app layout, dangling `--font-geist-*` variables (leftover from
create-next-app — nothing loads Geist anymore), and Horizon `/fonts` rewrites. If you touch font
loading, don't break `.font-display`/`.font-brand-mono` (marketing) or `font-dm` (dashboard).

## Copy rules (enforced product decisions)

- Brand: "Denku", never "Denku AI".
- **Dashboard: say "AI", not "agent", outside the Settings → Agents/Advanced carve-out** (R-065,
  enforced 2026-07-23). This covers headings, labels, table headers, transcript speaker labels, and
  derived insight copy — e.g. call-detail "AI Context"/"AI" (not "Agent"), the dashboard "AI
  Performance" widget with an "AI" column, transcript AI turns labelled "AI", and "Active AI lines"
  (R-018). Code identifiers (`agent_id`, `AgentComplexTable`, the `/dashboard/agents` route) keep
  "agent" — the rule is about **customer-facing text only**. Marketing may say "AI employee".
- Positioning (landing v2): "AI communication infrastructure", never agency/design-studio framing.

## Known inconsistencies (documented, not yet fixed)

- Duplicate legacy marketing components: `hero.tsx` (old) vs `hero-premium.tsx` (current),
  `how-it-works.tsx` vs `HowItWorks.tsx`, `use-cases.tsx` vs `UseCases.tsx`, `pricing-preview/
  pricing-table` vs `Pricing.tsx` + `ComparePlans.tsx`, `final-cta`, `social-proof`, `trust-scale`
  (check imports in `(marketing)/page.tsx` for the live set). The landing redesign should delete
  the losers.
- The billing settings page defines its own Button/Card/Badge.
- Hardcoded hex everywhere instead of the CSS vars that exist for the same values — follow local
  precedent per file rather than mass-refactoring mid-feature.
