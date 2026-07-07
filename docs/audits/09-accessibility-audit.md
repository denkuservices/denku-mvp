# Audit 09 — Accessibility Audit

- **Date:** 2026-07-06 · **Findings current as of:** 2026-07-06
- **Lens:** accessibility specialist, WCAG 2.2 AA on the three customer surfaces (marketing, auth/
  onboarding, dashboard).
- **Scope:** landmarks/structure, keyboard operability, focus management, forms, color contrast,
  text alternatives, motion.
- **Honesty note:** color-contrast ratios and screen-reader behavior require measurement/AT testing
  not available in-session. Structural findings are code-verified; contrast/AT items are flagged
  "needs measurement" in the WCAG summary rather than asserted as failures.

> Living document (Rule 1). Canonical status: `docs/IMPLEMENTATION_ROADMAP.md`.

## What's already right (preserve)

- **`prefers-reduced-motion` is respected** in the brand animation system (`globals.css` disables
  `.mic-pulse`/`.brand-float`/`.brand-reveal` and the flow-connector/pulse animations) — a real,
  deliberate accessibility win on a heavily-animated marketing surface. Keep it, and extend the same
  discipline to any landing-redesign motion (R-022).
- Auth forms use proper `<label htmlFor>` + `autoComplete` (login/signup) — correct pattern.
- Some interactive icons are labeled (`aria-label="Toggle menu"` on the mobile nav).

## Findings

### [R-070 — NEW, Medium] Operable/structural gaps: no skip link, thin ARIA, unverified focus management
- **No skip-to-content link** anywhere — keyboard users must tab through the full nav on every page.
- **ARIA is very sparse** — ~27 `aria-*` attributes across the entire app (~250 component/route
  files); interactive patterns (tabs on the phone-line detail, dropdowns, the command/combobox,
  custom toggles) largely lack roles/states, so screen-reader semantics are mostly whatever the raw
  elements provide.
- **Modal focus management is unverified** — the dialogs use Radix primitives (which trap focus by
  default, a plus) but the bespoke modals (AddPhoneNumberModal, LiveAgentModal) and the demo-call
  overlay need focus-trap + return-focus + Esc verification.
- **Icon-only controls** in tables/toolbars need consistent accessible names (some have them, many
  don't).
*Direction:* add a skip link + verified landmark structure to each surface's layout; audit each
interactive component for role/state/keyboard; standardize focus-trap/return on all modals.

### [R-071 — NEW, Medium] Perceivable gaps + unmeasured contrast
- **Color contrast is unmeasured against AA.** The bone/teal palette uses low-contrast greys for
  secondary text (`#6B7888` on `#F7F5F1`, `#F7F5F1/70` placeholders) and the Horizon dashboard uses
  light navy-on-white; several of these are plausibly below 4.5:1 for body text and must be measured.
- **Some inputs rely on placeholder-as-label** (e.g. dashboard filters/search) — placeholders
  disappear on input and aren't reliable labels.
- **Data visualizations have no text alternative** — ApexCharts render as canvas/SVG with no
  accessible summary or data table fallback, so analytics is opaque to screen-reader users.
- **Dynamic updates aren't announced** — bespoke toasts/success banners (see R-062) aren't in
  `aria-live` regions, so confirmations are silent to AT.
*Direction:* run a contrast pass and fix secondary-text tokens to AA; ensure every input has a
persistent label; add data-table alternatives for charts; wrap status messages in `aria-live`.

## WCAG 2.2 AA Conformance Summary (initial pass)

| Criterion (area) | Status | Note / R-ID |
|---|---|---|
| 1.1.1 Non-text content (alt) | Likely NA/pass | Almost no `<img>` (SVG/CSS/Spline); Spline canvas needs a label |
| 1.4.3 Contrast (minimum) | **Needs measurement** | Grey secondary text on bone; navy on white — measure (R-071) |
| 1.4.11 Non-text contrast | Needs measurement | Borders/focus rings on bone (R-071) |
| 1.3.1 Info & relationships | **Fail (partial)** | Sparse ARIA; placeholder-as-label; chart semantics (R-070/071) |
| 2.1.1 Keyboard | Needs verification | Custom toggles/tabs/modals (R-070) |
| 2.4.1 Bypass blocks | **Fail** | No skip link (R-070) |
| 2.4.3 / 2.4.7 Focus order & visible | Needs verification | Modal focus trap/return; focus-visible on custom controls (R-070) |
| 4.1.3 Status messages | **Fail** | Toasts/banners not `aria-live` (R-071, R-062) |
| 2.3.3 Animation from interactions | **Pass** | `prefers-reduced-motion` respected — preserve |

## Executive Summary

Accessibility has never been audited, and it shows in the structure — no skip link, thin ARIA, and
unverified focus/contrast — but it is not a catastrophe: the reduced-motion handling is genuinely
good, auth forms are labeled correctly, and Radix primitives give the modals a real focus-management
floor. The two findings are a scoped WCAG 2.2 AA pass: **operable/structural** (R-070 — skip link,
ARIA, focus, keyboard) and **perceivable** (R-071 — measured contrast, real labels, chart
alternatives, live-region announcements). None are large, and doing them also removes a concrete
enterprise-procurement blocker (accessibility conformance is increasingly a VPAT line item — see
Audit 10). Start with the skip link + a contrast measurement pass; both are day-scale and high-signal.

## Action Items

| # | Action | R-ID | Priority |
|---|---|---|---|
| 1 | Skip link + verified landmarks; ARIA roles/states on interactive components; modal focus audit | R-070 | Medium |
| 2 | Measure/fix contrast to AA; persistent input labels; chart text alternatives; `aria-live` on status | R-071 | Medium |
| 3 | Preserve `prefers-reduced-motion` handling in any new motion (landing redesign) | R-022 | (guard) |
