# 07 — Creato Animation & Micro-interaction Forensics

> Method: live DOM census (behavior scripts, element counts, runtime globals) on rendered pages.
> The animation system on agency.creato.digital is the AiHub theme's behavior library — every
> loaded behavior file was enumerated (VERIFIED). Screenshot-based motion capture was unavailable
> this session; observed-behavior notes for scroll effects are STRONGLY INFERRED from the loaded
> behavior modules + their DOM annotations, which is reliable (each behavior binds to explicit
> data-attributes present in the DOM).

## Runtime inventory (agency.creato.digital — VERIFIED loads)

| Library / module | Purpose | Evidence |
|---|---|---|
| **GSAP core + ScrollTrigger + ScrollToPlugin + DrawSVGPlugin** | scroll-driven timelines, SVG line drawing | `themes/aihub/assets/vendors/gsap/*` |
| **tsParticles** (bundle) | particle fields | vendor load; `window.tsParticles` present |
| **Lottie** 5.9.6 | vector animations | vendor load; 1 lottie node on home |
| **typewriter-effect** | hero rotating words (cursor "\|" observed in H1) | vendor + 2 typewriter nodes |
| split-text behavior | per-word/letter reveal on scroll | `behaviors/split-text.js` |
| marquee behavior | infinite logo/keyword loops — **51 marquee elements** on home | `behaviors/marquee.js` + census |
| hover-3d behavior | tilt-on-hover cards | `behaviors/hover-3d.js` |
| look-at-mouse behavior | elements track cursor | `behaviors/look-at-mouse.js` |
| carousel (+drag/nav/autoplay) | testimonial/content sliders | 4 modules |
| text-rotator, toggle-slide, local-scroll, sticky-header, animations.js | misc scroll/entrance | behavior files |
| Prism.js | syntax-highlighted embed-code block | vendor load |
| fastdom | batched DOM reads/writes (perf) | vendor load |
| Custom canvas | 4 `<canvas>` elements on home (particles/metric widgets) | DOM census |

Notable *absences* (VERIFIED zero): Three.js/WebGL scenes, Spline, Framer Motion, page
transitions, custom cursors, magnetic buttons. On the React platform site: **Three.js IS bundled**
(SplineCurve/Matrix4 strings in the SPA bundle) — some 3D exists or is planned there, but no
active WebGL scene was observed on public pages (canvas elements present were 2D).

## Micro-interaction inventory (element · behavior · purpose · Denku verdict)

| # | Element (page) | Observed/bound behavior | Likely tech | Visual purpose | UX purpose | Complexity | Denku recommendation | Priority |
|---|---|---|---|---|---|---|---|---|
| 1 | Hero H1 (agency home) | typewriter cycling value words ("Geleceğe / Yapay Zekaya / Otomatik Süreçlere…") | typewriter-effect | motion focal point | states multiple value props in one slot | XS | **Adopt** — rotate outcomes ("answers calls / books jobs / recovers carts") | P1 |
| 2 | Partner/keyword strips (home, ai-studio) | infinite marquees (51 on home; use-case keywords ×3 repetition) | marquee.js CSS transform | density + liveliness | communicates breadth passively | XS | Adopt 1–2 max; >3 reads as filler | P2 |
| 3 | Section headings | split-text word-by-word reveal on scroll | GSAP + split-text | rhythm | paces reading | S | Adopt with reduced-motion respect | P1 |
| 4 | Service/feature cards | hover-3d tilt + conic border sweep | hover-3d + CSS conic | "alive" tech feel | affordance | S | Adopt on 2–3 key cards only | P2 |
| 5 | Metric mock-cards (ai-agents, ai-yazilim) | animated counters in idealized dashboards ("1.8K +24%", "0.8s") | GSAP counters | proof-by-UI | product preview | M (design) | **Adopt with REAL product UI + real (or clearly-labeled sample) numbers** — honesty rule | **P0** |
| 6 | Embed-code block (home) | Prism-highlighted real snippet + copy | Prism | authenticity | developer trust | XS | Adopt when web-chat ships | P3 |
| 7 | Fake build console (corporate home) | code types → "Build Successful" | custom typewriter | competence theater | — | S | Skip (audience mismatch for SMB) | — |
| 8 | Optimization-score gauge (corporate home, AI Audit card) | animated 98% ring | SVG + JS | audit visualization | sells the audit | S | **Adopt for real AI Audit product** (doc 14) | P1 |
| 9 | Particles background | drifting dots | tsParticles | depth | ambiance | XS | Skip — replace with static grain + animated glow (cheaper, more 2026) | — |
| 10 | Cursor-tracking elements | look-at-mouse on hero art | look-at-mouse.js | playfulness | — | S | Optional; only if Denku keeps a mascot/3D element | P3 |
| 11 | Scroll-drawn SVG lines | DrawSVG path animation (process/flow sections) | GSAP DrawSVG | guides eye along a journey | explains process | M | Adopt for "how hiring works" 4-step section | P2 |
| 12 | Carousels (testimonials/templates) | drag + autoplay | theme carousel | content density | browse templates | S | Prefer grid; carousels hide content | — |
| 13 | Ikasagent live-inbox mock | channel counts tick "CANLI/12/8/5/3", takeover flow plays | React state loop | the product working | teaches the core loop | M | **Adopt: an auto-playing 'AI handles it → human takeover' vignette using Denku's real Inbox UI** | **P0** |
| 14 | Widget-studio configurator (ikasagent) | live theme/color preview of chat widget | React | customization proof | reduces "will it fit my brand?" objection | M | Adopt when web-chat channel ships | P2 |
| 15 | Pipeline/CRM mock (ikasagent) | animated kanban with AI lead scores | React | CRM depth | sells memory layer | M | Adopt with real CRM surface | P1 |

## Structural lessons

1. **All motion is ambient, none is gating.** Nothing blocks scroll; no scroll-jacking; no page
   transitions. The site feels fast *because* the flashy parts are decorative.
2. **The most persuasive "animations" are product simulations, not effects** (#5, #13–15).
   Creato fakes them convincingly; **Denku can render the genuine article** — its real dashboard,
   real inbox, real takeover flow — which is both more honest and impossible for
   theme-buyers to copy.
3. **Motion budget discipline:** hero typewriter + scroll reveals + 1–2 signature effects. The
   51-marquee excess on Creato's home is the one place the theme shows its seams.
4. **Accessibility gap to exploit:** no `prefers-reduced-motion` handling was observed in the
   theme behaviors (INFERRED from behavior JS). Denku should ship reduced-motion variants — a
   real differentiator for US enterprise/a11y review (Denku already has an a11y audit debt to
   pay anyway).

## Denku motion principles (input to doc 17)

- Every animation must either (a) demonstrate the product truthfully, (b) direct attention to one
  action, or (c) be sub-200ms interaction feedback. Delete anything else.
- One signature effect owned end-to-end (recommendation in doc 17: the **"employee card
  materializes"** motif — the AI employee's badge/card assembling from conversation fragments —
  used in hero, onboarding, and empty states).
- GSAP + ScrollTrigger is the right library choice for the marketing site (proven by benchmark);
  the dashboard keeps CSS-only transitions.
