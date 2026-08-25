# 06 — Creato Visual Forensics

> Method: computed-style extraction from live rendered pages (not source reading), full color
> census across ~2,500 elements, asset inspection. Screenshots were unavailable in this session
> (headless pane); all measurements below are from the live CSSOM and are VERIFIED unless noted.
> Two distinct visual systems exist — they are analyzed separately.

## System A — agency.creato.digital (the "wow" site)

### Measured foundation
| Token | Value | Note |
|---|---|---|
| Body background | `rgb(0, 2, 18)` `#000212` | near-black **navy**, not pure black — reads "space," avoids OLED-black harshness |
| Display font | **Syne** (Google) | geometric, wide, slightly quirky — the single biggest "AI-brand" signal |
| Body font | **Be Vietnam Pro** | neutral grotesque; UI strings 14px/700 in buttons |
| Accent fonts | Poppins, Roboto Mono | mono for the embed-code trust section |
| H1 | 92px / 700 / **line-height 0.85** (78.2px) | oversized + tighter-than-1 leading = poster typography |
| H2 | 55px / 700 / lh 1.0 | same voice, one step down |
| Body text color | `rgb(170,171,194)` (lavender-gray, 1,678 uses) | **not** gray-white: a *tinted* muted tone that keeps the page cool |
| Secondary text | `rgba(255,255,255,.55)`, `rgb(140,141,167)` | opacity-stepped hierarchy |
| Buttons | full pill (measured radius 1386px), 14px/700 | pill + glow hover |

### Color census (top non-neutral accents, by frequency)
1. Teal-cyan `rgb(103,205,204)` — 30 uses (links/highlights)
2. Violet `rgb(146,126,188)` — 16 uses (gradient text)
3. Green `rgb(126,198,153)` — 8 uses (success/positive metrics)

### Measured gradient system
- **Glass cards:** `linear-gradient(0deg, rgba(255,255,255,.02) → .06)` — 2–6% white over navy,
  with 1px faint borders. This is the entire card system: no solid fills anywhere.
- **Gradient text:** `linear-gradient(1deg, rgb(146,126,188) → #fff)` — violet→white on key words.
- **Hero/section glow:** `radial-gradient(circle at 50% -75%, #985199 → #6449D1)` — magenta→violet
  bloom positioned *above* the viewport so only its falloff is visible (the "aurora from above").
- **Conic sweep:** `conic-gradient(from 290deg, transparent, #fff 10%, transparent 20%)` — the
  rotating-highlight border that makes cards look "alive" (animated rotation of a mostly
  transparent conic ring behind a card).

### Why it looks professional (deconstructed)
1. **One dark canvas, zero section color changes** — sections are separated by glow position and
   whitespace, not background swaps → premium continuity.
2. **Typography does the branding**: Syne at 92px with negative-feel leading is 80% of the
   identity. Color is only an accent (three hues, low frequency — see census).
3. **Nothing is fully opaque except text**: cards at 2–6% white read as depth, not boxes.
4. **Motion signals competence** (see doc 07): typewriter hero, marquees, particles — all
   *ambient*, none blocking content.
5. **Product-mock UI as illustration**: metric cards ("1.8K conversations +24%", "0.8s response"),
   inbox mockups, pipeline boards — the illustrations *are* screenshots of an idealized product.
   This is the pattern most worth stealing: **the marketing site renders the product's UI as its
   art.**

### The honest caveat
This entire system is the **AiHub ThemeForest theme** (VERIFIED: all behaviors load from
`wp-content/themes/aihub/`). The "Creato E-logo composition with services attached to its
geometry" and similar showpieces are theme-family compositions configured with Creato's content.
Consequence for Denku: the benchmark is reachable — it is a known, purchasable design system —
and beating it requires *originality*, not more effort.

## System B — creato.digital + portals (the product surfaces)

- Fonts: **Inter + Manrope** (Google) — the standard 2024–26 SaaS pairing.
- Look: same dark-navy family, tighter information density, Tailwind-style utility classes
  (STRONGLY INFERRED from class-name fingerprints in the SPA: `text-2xl font-bold`, `zinc`-style
  utilities), status colors per provider (openai=green, gemini=blue, claude=orange — VERIFIED
  string).
- Marketing pages within the SPA reuse the dark canvas but with simpler, flatter cards — visibly
  a *different, cheaper* dialect than System A. Even Creato has a design-fragmentation problem
  between showcase and product.

## Major visual concepts — evaluation for Denku

| Concept | What happens | Why it works | Tech | Difficulty | Denku verdict |
|---|---|---|---|---|---|
| Near-black navy canvas + aurora glows | one continuous dark field; radial blooms mark sections | continuity + focus; premium | CSS only | trivial | **Adopt principle**, not palette — Denku needs its own hue family (see doc 17) |
| Oversized display serif/geometric H1, lh<1 | type as hero art | identity without illustration cost | font choice | trivial | **Adopt** with an original face (not Syne; Denku owns Fraunces heritage — decide in doc 17) |
| 2–6% white glass cards + 1px borders | depth without boxes | keeps dark UI airy | CSS | trivial | **Adopt** |
| Conic rotating border glow | card edge lights up and orbits | "alive" tech feel | CSS `@property`/animation | easy | **Adopt sparingly** (1–2 places: hero CTA, live-demo card) |
| Gradient keyword text | one phrase per heading glows | directs eye | CSS | trivial | **Adopt** |
| Product-mock UI as marketing art | idealized dashboards/inboxes animated in hero/sections | proof-by-showing | HTML/CSS mockups | medium (design labor) | **Adopt aggressively — Denku's real dashboard is genuinely good; render the REAL product, which Creato cannot do honestly** |
| Fake-code typing block w/ "Build Successful" | credibility with technical buyers | authenticity theater | JS typewriter | easy | Skip for SMB owners; maybe on a developer/API page later |
| Embed-code shown on page | literal install snippet as content | "it's real" | static | trivial | **Adopt** once web-chat channel ships |
| Logo-geometry composition (services attached to "E") | brand mark becomes an infographic | memorable metaphor | theme SVG | medium | **Create Denku-original equivalent** — e.g., the Denku "employee card/badge" motif (doc 17) |
| tsParticles starfields | ambient drift | depth | tsparticles lib | easy | Skip — dated by 2026; prefer CSS grain + glow (doc 17) |
