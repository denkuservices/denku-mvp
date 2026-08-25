# 17 — Denku Visual System (Creato-level sophistication, unmistakably Denku)

> Principle: adopt the benchmark's *mechanics* (doc 06) — dark continuous canvas, glass depth,
> type-led identity, ambient motion — while rejecting its rented aesthetic (Syne + violet +
> particles = AiHub theme, owned by hundreds of sites).

## 1. The identity decision

Denku's existing brand assets are the warm "luxury" palette (bone `#F7F5F1`, teal `#1B6E6E`,
copper `#B8895A`, Fraunces serif) — currently marketing/onboarding-only. The 2.0 system keeps
this DNA and inverts it into a dark, technical register:

> **"A warm employee in a dark suit":** deep-teal-black canvas + bone-warm text + copper
> signature accents + Fraunces display. Nobody in the AI space looks like this — the entire
> category (Creato included) is navy+violet+Inter/Syne. Warmth IS the differentiation, and it
> matches the product story (an employee you trust, not a robot).

## 2. Token foundation

```css
/* Canvas */
--d-bg:            #0A1414;   /* near-black with teal undertone (vs Creato #000212 navy) */
--d-bg-raised:     #0E1A1A;
--d-surface-glass: rgba(247,245,241,0.04);   /* bone-tinted glass, 3–6% */
--d-border:        rgba(247,245,241,0.10);

/* Ink */
--d-ink:           #F7F5F1;   /* bone, not white */
--d-ink-soft:      #C9C4B8;   /* warm gray (the lavender-gray lesson, warm-shifted) */
--d-ink-faint:     rgba(247,245,241,0.55);

/* Brand accents */
--d-teal:          #2FA39A;   /* lifted from #1B6E6E for dark-canvas contrast */
--d-copper:        #C89468;   /* the signature; gradients + key moments ONLY */
--d-success:       #7FC98F;
--d-danger:        #E2695C;

/* Signature gradients */
--d-grad-ember:    linear-gradient(120deg,#C89468,#F7F5F1);       /* keyword text */
--d-grad-depth:    radial-gradient(circle at 50% -60%, rgba(47,163,154,.35), transparent 60%);
--d-grad-sweep:    conic-gradient(from 280deg, transparent, rgba(200,148,104,.9) 12%, transparent 22%);
```

Light-mode (dashboard daytime) maps the same roles onto bone paper: bg `#F7F5F1`, ink `#141B1B`,
same teal/copper accents — the existing luxury theme *becomes* light mode, closing the
four-dialect era with one dual-mode system.

## 3. Typography

| Role | Face | Spec |
|---|---|---|
| Display (hero/H1–H2) | **Fraunces** (existing brand serif; optical size + SOFT/WONK axes) | H1 clamp(56→96px)/600/lh 0.95; the warm-serif-on-dark look is the brand's most ownable asset — Creato-class scale, opposite voice |
| UI/body | **Inter** (marketing) / DM Sans (dashboard, existing) → converge on Inter over time | body 16–18px/1.6; captions 13–14px |
| Numbers/data | **Fraunces** for outcome numbers (weekly digest, savings) — warm confident figures; tabular Inter for tables | |
| Mono (embed/code) | JetBrains Mono | web-chat snippet section only |

Rule from the benchmark: type does the branding; color is an accent. Copper appears in ≤3 places
per viewport.

## 4. Component systems

- **Cards:** bone-glass (4%) + 1px warm border + 20px radius; hover lifts glass to 7% + copper
  hairline. No solid fills on dark.
- **Buttons:** primary = copper-filled pill, ink-dark text (high contrast, unusual in category);
  secondary = glass pill with bone text; the *conic sweep* reserved for exactly two elements
  (hero CTA, live-demo card).
- **The Employee Card (CORE SIGNATURE #1):** a badge-like card representing an AI employee —
  avatar glyph, name, role, "On shift" pulse, live outcome ticker. Used in hero, template
  gallery, AI Team roster, onboarding finale ("your employee's badge"). This is Denku's answer
  to Creato's E-logo composition: an original, product-true visual metaphor.
- **The Thread (CORE SIGNATURE #2):** a copper conversational thread-line motif — the line that
  connects a missed call → text-back → booking → CRM entry in scroll stories and empty states.
  (Replaces particles: meaning instead of ambiance.)
- **Real-UI frames (CORE SIGNATURE #3):** marketing renders actual product components inside a
  device-free "glass window" frame with a "sample data" chip — honesty as aesthetic.

## 5. Motion principles (doc 07 distilled)

1. Ambient, never gating; nothing blocks scroll; no scroll-jacking, no page transitions.
2. Every animation demonstrates the product, directs to one action, or is <200ms feedback.
3. Signature moves: typewriter outcome line (hero), Employee Card assembly (fragments of
   conversations converge into the badge), Thread draw-on (DrawSVG), counter tick-ups on real
   stats, takeover vignette autoplay in the workday section.
4. `prefers-reduced-motion` variants mandatory (benchmark ships none — cheap differentiation,
   and F-011 a11y debt says do it anyway).
5. Stack: GSAP + ScrollTrigger on marketing; CSS-only in dashboard.

## 6. Imagery & 3D strategy

- **No Spline robot** in 2.0 (retire the current scene): 3D mascots read gimmick in 2026 and the
  robot contradicts the "employee, not robot" brand line. The Employee Card + Thread carry the
  visual load. (Decision reversible; the asset remains in the repo.)
- Photography: none at launch (no stock humans-with-headsets). AI-generated abstract *materials*
  (brushed copper, warm glass, woven texture) as section backdrops — produced once via image
  APIs (internal use of the doc-12 pipeline), heavily art-directed.
- Iconography: 1.5px stroke, rounded, warm-tinted; Lucide base customized.

## 7. Responsive & performance

- Mobile-first sections; the live-demo section becomes "tap to call" (a *stronger* CTA on
  mobile — the phone is right there).
- Budget: LCP < 2.0s, JS < 200KB on marketing routes (the 6MB-bundle cautionary tale, doc 08);
  static-render everything; animations progressive-enhance.

## 8. Do-not list

No violet/purple (category cliché + Creato's palette). No particles. No fake terminals. No
neon. No pure black/white. No Syne/Space Grotesk (category fonts). No stock 3D robots. No
section-to-section background color changes — one continuous canvas, glow-articulated.
