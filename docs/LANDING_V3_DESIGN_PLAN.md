# Denku Landing v3 — cinematic front door

> **Status:** BUILT — P0–P6 plus a second wave of scope, all on `feat/landing-v3-p0`.
> See §9.1–9.4 for what shipped and what is still open. Written 2026-08-29 against the **Denku 2.0
> research package** (`docs/denku-2.0/01–20`) and the owner's answers.
> This work is **D4 — Website 2.0** in the doc-20 roadmap.
> Supersedes `web/LANDING_REDESIGN_SPEC.md` (v2, approved 2026-07, never built).

**Design read:** *A landing rebuild for US SMB owners who buy on trust, with a cinematic dark-luxury
language, leaning toward the doc-17 "warm employee in a dark suit" system plus GSAP/WebGL ambient
motion — not the category's navy-violet-Syne uniform.*

---

## 0. The single most useful fact found

**The reference site is a bought theme.** `docs/denku-2.0/06-creato-visual-forensics.md` VERIFIED
that agency.creato.digital's entire visual system is the **AiHub ThemeForest theme** — every
behavior loads from `wp-content/themes/aihub/`. Its Syne + violet + tsParticles look is licensed by
hundreds of sites.

That answers the "should I just buy a ThemeForest theme?" question definitively: **the thing you
admired already is one.** Which means matching it is cheap and beating it requires only one thing
the theme cannot sell — originality. We are not competing with a design studio; we are competing
with a $59 template.

---

## 1. Blockers and facts found in the codebase

| # | Finding | Impact |
|---|---|---|
| F1 | **Magic MCP (21st.dev) fails to connect: `-32001 Not authenticated — API key missing or was reset`** | v2's "source ALL UI from Magic MCP" strategy is dead until a fresh key is issued at https://21st.dev/mcp. This plan does not depend on it. |
| F2 | **React Bits is already in the repo** — `web/src/components/DotGrid.tsx` + `.css` is a verbatim React Bits component (gsap `InertiaPlugin`). | Proven, free, MIT, copy-paste. Primary component source. |
| F3 | `gsap@3.14`, `framer-motion@12`, `@splinetool/react-spline@4` installed. `ogl`, `three`, `@react-three/fiber` **not**. | Text/scroll motion costs 0 new deps. WebGL costs `ogl` (small) or `three` (large). |
| F4 | CSP in `web/next.config.ts` already allowlists `*.spline.design`; CSP is report-only unless `CSP_MODE=enforce`. | No CSP work for same-origin WebGL. **New fonts/CDNs must be added to the allowlist before anyone flips `CSP_MODE=enforce`.** |
| F5 | Marketing layout hardcodes the warm light theme (`bg-[#F7F5F1] text-[#0A1A2F]`), as do `Navbar` and `Footer`. | A dark landing breaks `/pricing`, `/security`, `/company`, `/use-cases` unless the layout becomes theme-aware first. **Biggest hidden cost — it is P0.** |
| F6 | ~~Spline scene weight unmeasured.~~ **MEASURED 2026-08-29: 1,351,024 bytes = 1.29 MB** (`https://prod.spline.design/UAZ0yJcBnzG0I0Yb/scene.splinecode`, `Content-Length` confirmed against the downloaded body). | **Under the 2 MB threshold — the robot stays as-is.** No Spline-editor optimisation and no poster-swap fallback needed. The `@splinetool/runtime` JS is a separate cost, still handled by the below-fold lazy mount in §7. |

---

## 2. Reconciling this redesign with the Denku 2.0 research

The research (docs 15/17/18) already specifies a website. Its direction and the owner's brief agree
on more than they disagree — both want a single continuous dark canvas, glass depth, type-led
identity, ambient GSAP motion, and product-as-art. They diverge on exactly three points. Each is
resolved below.

| Divergence | Research position | Owner's instruction | Resolution |
|---|---|---|---|
| **Hue family** | teal-black `#0A1414` + bone + copper; "no violet, no neon, no particles" (doc 17 §8) | cyan/violet space look, like the reference | **Research wins.** The reference's palette is the theme's palette — copying it buys the generic look at full price. Teal-black *is* dark and cinematic; it simply is not purple. Tokens in §3 are doc 17's, unchanged. |
| **The Spline robot** | retire it — "3D mascots read gimmick in 2026" (doc 17 §6, doc 18 §3) | keep it, **above the Talk to Denku button** | **Owner wins, with a promotion in meaning.** The robot moves off "hero identity" duty and becomes the *face of the live demo*: it sits with the call button, reacts when the call connects, and is the thing you are talking to. That is a better job than decorating a hero, and it removes the "mascot for no reason" objection the research raised. |
| **Invented metrics** | banned by house law (doc 18 §3, doc 20 D4 "Must NOT: fabricate any number") | placeholders fine for now, real numbers later | **Owner wins, with a guard.** All placeholder figures come from one `PLACEHOLDER_METRICS` module, each rendered with a `data-placeholder="true"` attribute, and "replace or remove every placeholder metric" is a blocking item on the launch checklist. Concern stated once, below. |

**The concern, stated once:** the repo already carries a marketing-honesty finding (Sprint 6 removed
SOC2/HIPAA over-claims), and doc 20 makes "fabricate any number" an explicit D4 failure condition.
Invented traction numbers on a live site are the kind of thing a first customer can disprove. The
guard above makes them impossible to ship by accident. Beyond that it is the owner's call, and the
design proceeds with them in place.

**Sequencing note:** doc 20 puts D4 after D0→D3 and marks it parallel-safe with D5. The current
sprint state (memory: D0 partly executed, D1–D8 awaiting approval, gated on staging) means this
landing work runs *ahead* of its roadmap slot. That is a legitimate choice — a front door is
worthless without a product behind it, but a product nobody sees is worse. Flagged, not blocked.

---

## 3. Design tokens — doc 17, adopted unchanged

```css
/* Canvas */
--d-bg:            #0A1414;   /* near-black with a teal undertone (vs the category's navy) */
--d-bg-raised:     #0E1A1A;
--d-surface-glass: rgba(247,245,241,0.04);   /* bone-tinted glass, 3–6% — never solid fills */
--d-border:        rgba(247,245,241,0.10);

/* Ink */
--d-ink:           #F7F5F1;   /* bone, not white */
--d-ink-soft:      #C9C4B8;   /* warm gray */
--d-ink-faint:     rgba(247,245,241,0.55);

/* Accents — copper appears in at most 3 places per viewport */
--d-teal:          #2FA39A;
--d-copper:        #C89468;
--d-success:       #7FC98F;
--d-danger:        #E2695C;

/* Signature gradients */
--d-grad-ember:    linear-gradient(120deg,#C89468,#F7F5F1);
--d-grad-depth:    radial-gradient(circle at 50% -60%, rgba(47,163,154,.35), transparent 60%);
--d-grad-sweep:    conic-gradient(from 280deg, transparent, rgba(200,148,104,.9) 12%, transparent 22%);
```

Scoped under a new `.landing-surface` class in `web/src/app/globals.css`. **`.brand-surface` is not
touched** — onboarding and auth depend on it.

**Typography — correction to an earlier draft of this plan.** An earlier version proposed replacing
Fraunces with a technical grotesk. That was wrong, and doc 17 §3 explains why: every competitor in
this category runs Syne or Space Grotesk or Inter, and a warm serif at poster scale on a dark canvas
is the one typographic position nobody else occupies. **Fraunces stays** — H1 at `clamp(56px, 7vw,
96px)` / 600 / line-height 0.95, which is Creato-class scale in the opposite voice. Inter for body,
JetBrains Mono for data and labels. Onboarding, auth and dashboard type do not change.

**Structural moves borrowed from the benchmark** (doc 06, mechanics only): one continuous canvas
with zero section background swaps — sections are separated by glow position and whitespace; nothing
fully opaque except text; type carries the branding and colour is only an accent.

---

## 4. Site structure — doc 15's IA, given the owner's cinematic treatment

The owner asked for subpages like the reference. Doc 15 already specifies them, and its list is the
business-validated one, so it is adopted as-is rather than reinvented:

```
/                      Homepage (§5)
/employees/…           5 template pages — receptionist · booking-assistant ·
                       missed-call-rescuer · after-hours · support-agent
/industries/…          4 at launch — hvac-plumbing · dental · med-spa-salon · law
/pricing               ladder + packs + the honest billing math
/demo                  "Talk to Denku" — live number + web call
/product/inbox|crm|analytics    3 deep-dives rendering REAL product UI
/trust  /about  /contact  /legal/*
```

Not at launch: blog, case studies, careers.

---

## 5. Homepage — doc 15's 11 sections, treated for minimum text and maximum motion

The word budget is a hard constraint. Whole page under ~260 visible words.

| # | Section (doc 15) | Cinematic treatment | Components | Words |
|---|---|---|---|---|
| 1 | **Hero** | One WebGL field on the teal-black canvas; H1 in Fraunces at poster scale, mask-revealed; typewriter outcome line; the **Employee Card** materializing from drifting conversation fragments (doc 17 signature #1). | React Bits `Threads`/`LineWaves` (ogl); `SplitText`/`MaskedHeading` (gsap); `Magnet` | ≤22 |
| 2 | **Proof strip** | Sourced stat chips + counters. Placeholder figures flow through `PLACEHOLDER_METRICS` (§2). | `CountUp` | ≤14 |
| 3 | **Live demo** ★ | **The Spline robot lives here**, directly above the Talk to Denku button — idle drift, then a visible state change the moment the call connects, driven by the existing `DemoCallButton` Vapi state machine. Phone number in huge type. | existing `SplineClient` + `DemoCallButton`; conic sweep border | ≤16 |
| 4 | **How hiring works** | 4 steps joined by a scroll-drawn copper **Thread** line (doc 17 signature #2). | GSAP `DrawSVGPlugin` + ScrollTrigger | ≤18 |
| 5 | **Meet the employees** | 5 Employee Cards, hover tilt, conic sweep on the featured one. Links to `/employees/*`. | `TiltedCard`; CSS `@property` conic | ≤25 |
| 6 | **The workday** ★ | **The set piece:** 3 pinned scenes of the REAL product (Inbox → CRM → Home), sample data labeled. Doc 18 W4. | GSAP ScrollTrigger (pinned) | ≤18 |
| 7 | **Memory** | "It never forgets a customer." Contact timeline entries cascade in. | `AnimatedList` / gsap stagger | ≤14 |
| 8 | **Pricing preview** | 3 plan cards, glass, conic sweep on the recommended one. Existing plan data and Stripe paths untouched. | `BorderGlow` | (existing) |
| 9 | **AI Audit CTA** | Inline URL/phone input, animated readiness gauge. Doc 18 W2 — ship the CTA now, the product later. | SVG gauge | ≤12 |
| 10 | **Honest FAQ** | Accordions. Billing math in plain words. | native `<details>` | ≤40 |
| 11 | **Final CTA** | Hero energy reprised: light rays, one large magnetic button. | `LightRays` (ogl); `Magnet` | ≤14 |
| 12 | **Footer** | Oversized `DENKU` wordmark cropped at the viewport edge. | — | ≤20 |

Business logic preserved verbatim, restyled only: the `DemoCallButton` Vapi state machine and its
rate limiting, `Contact` validation and submit, `Pricing` plan data and Stripe paths,
`pricing-data.ts`.

---

## 6. Dependencies

| Package | Size (gz) | Opens | Verdict |
|---|---|---|---|
| `ogl` | ~30–50 KB | `Threads`, `LineWaves`, `Aurora`, `DarkVeil`, `Particles`, `LightRays`, `Orb`, `LiquidChrome`, `Prism` | **ADD** |
| `three` + `@react-three/fiber` | ~150 KB+ | `Silk`, `Beams`, `LaserFlow`, `LiquidEther`, `FluidGlass` | **AVOID** — Spline already ships its own 3D runtime; two engines on one page is not affordable |
| `gsap` + ScrollTrigger + DrawSVGPlugin | installed | §5 rows 4 and 6 | already present; all plugins free since gsap 3.13 |

---

## 7. The performance conflict — and the deviation being requested

Doc 17 §7 sets **LCP < 2.0 s and JS < 200 KB** on marketing routes. The owner has asked for maximum
3D, animation and motion. **Both cannot hold.** Spline's runtime alone plus one WebGL field exceeds
200 KB before any application code.

Proposed, explicit deviation — **homepage only**:

- **LCP < 2.5 s · CLS < 0.05 · INP < 200 ms · initial JS < 300 KB gz.**
- Every other marketing route keeps doc 17's original 2.0 s / 200 KB budget.
- The Spline runtime is **not** in the initial bundle: section 3 is below the fold, so it mounts on
  intersection and is excluded from the hero's critical path entirely.

Rules that make that budget reachable:

1. **One WebGL context above the fold. Ever.** Multiple live canvases exhaust browser context limits.
2. **Measure the Spline scene in P0** (F6). Over ~2 MB → optimise it in the Spline editor, or the
   robot becomes a poster image that swaps to live 3D on interaction.
3. Every below-fold canvas: `next/dynamic({ ssr: false })` + IntersectionObserver mount, unmounted on exit.
4. `prefers-reduced-motion: reduce` → every canvas becomes a static WebP poster. Not less motion — none.
5. **Mobile (< 768 px): no WebGL.** Posters and CSS gradients only. Doc 17 §7 also converts the demo
   section to "tap to call" on mobile, which is a stronger CTA anyway.
6. Verify with `@next/bundle-analyzer` (already a devDependency) and Lighthouse before merge. Doc 20's
   D4 acceptance bar is Lighthouse ≥ 95 perf/a11y — the homepage will be held to ≥ 90 under this
   deviation, everything else to ≥ 95.
7. Text always lives in the DOM, never painted into canvas — SEO and screen readers both need it.

If the owner prefers to keep doc 17's original budget instead, the trade is: drop the WebGL field and
carry the hero on type, glow and the Employee Card animation alone.

---

## 8. Accessibility & SEO

- Minimum copy is not minimum semantics: real `h1`/`h2`, real `<nav>`, real link text. Depth content
  lives on `/employees/*`, `/industries/*`, `/pricing`, which stay text-rich — that is what makes a
  sparse homepage survivable for SEO.
- Contrast checked at AA against actual grounds, glass panels included. Bone-on-teal-black passes
  comfortably; copper-on-glass is the one pairing to verify.
- Visible focus rings on the dark ground: copper at 2 px, never a removed outline.
- Cursor effects only on `pointer: fine` and only when motion is not reduced.
- Reduced-motion variants are a deliberate differentiator: doc 07 found the benchmark theme ships
  none.

---

## 9. Phases

| Phase | Work | Exit criterion |
|---|---|---|
| **P0** ✅ | Decisions · **measure the Spline scene** · add `ogl` · doc-17 tokens as `.landing-surface` · make the marketing layout/nav/footer theme-aware (F5) · `PLACEHOLDER_METRICS` module + launch-checklist entry | **DONE 2026-08-29 — see §9.1** |
| **P1** | **Hero + live demo** — WebGL field, Fraunces poster type, Employee Card materialization, Spline robot repositioned above the call button with connect-state reaction | The hero and demo alone beat the entire current page; LCP measured |
| **P2** | Thread-drawn "How hiring works" + the pinned Workday scroll story | 60 fps on a mid-range laptop |
| **P3** | Employee cards + Memory + Audit CTA + Proof strip | — |
| **P4** | Pricing preview + FAQ + final CTA + footer (zero logic change) | Stripe paths still work |
| **P5** | Perf/a11y pass: mobile posters, reduced-motion, bundle analysis, Lighthouse, contrast audit | §7 budgets met |
| **P6** | `/employees/*` and `/industries/*` templates, then the remaining marketing pages | Visual consistency across `(marketing)` |

Auth, onboarding and the dashboard are **out of scope** and must not change.

### 9.1 P0 record — completed 2026-08-29 (branch `feat/landing-v3-p0`)

| Item | Result |
|---|---|
| Spline scene measured | **1.29 MB** — under threshold, robot kept unchanged (F6) |
| `ogl` | `ogl@1.0.11` added |
| doc-17 tokens | `.landing-surface` added to `globals.css`; `.brand-surface` untouched |
| F5 theme-aware chrome | Solved with **surface role tokens**, not conditionals — see below |
| Placeholder guard | `web/src/lib/marketing/placeholderMetrics.ts` + blocking item in `docs/LAUNCH_RUNBOOK.md` |
| 21st.dev MCP | `magic` removed from all scopes; `21st` added over HTTP transport, `claude mcp list` reports connected |

**How F5 was solved.** Rather than branching every className on a `dark` flag, both
`.brand-surface` and `.landing-surface` define the same set of **role tokens** — `--s-bg`,
`--s-bg-glass-a/b`, `--s-bg-overlay`, `--s-ink`, `--s-ink-soft`, `--s-ink-faint`, `--s-accent`,
`--s-cta-bg/-hover/-fg`, `--s-border`, `--s-border-soft`, `--s-hover-bg`. `Navbar` and `Footer`
read the roles, so one markup serves both surfaces and the cascade resolves them. Every value in
`.brand-surface` is byte-identical to the literal hex it replaced, so the warm pages are unchanged
by construction. `MarketingSurface.tsx` holds `DARK_SURFACE_ROUTES`, the single list that decides
which routes are dark; P1 adds `"/"`, P6 extends it.

`DARK_SURFACE_ROUTES` ships **empty**: the plumbing is live but no route changes appearance until
its sections are restyled.

**Verification (dev server on :3000, `/pricing`):**

| Role | Warm surface (must equal the old literal) | Dark surface |
|---|---|---|
| wrapper background | `rgb(247,245,241)` = `#F7F5F1` ✓ | `rgb(10,20,20)` = `#0A1414` ✓ |
| wrapper text | `rgb(10,26,47)` = `#0A1A2F` ✓ | `#F7F5F1` ✓ |
| navbar (unscrolled) | `rgba(247,245,241,0.6)` = old `/60` ✓ | `rgba(10,20,20,0.55)` ✓ |
| footer | `#F7F5F1` ✓ | `#0A1414` ✓ |
| primary CTA | bg `#0A1A2F`, text `#F7F5F1` ✓ | bg `rgb(200,148,104)` = copper `#C89468`, text `#0A1414` ✓ |

Also verified: `npm run build` green, **72/72 static pages** (baseline count unchanged) — the
client wrapper does not de-optimise the marketing routes, which still prerender as static;
`npm run test` 864/864 across 64 files; `eslint` clean on every touched file; the CSP allowlist in
`next.config.ts` already covers `fonts.googleapis.com` / `fonts.gstatic.com`, so no CSP work is
owed before `CSP_MODE=enforce`.

*Note on the session:* a second dev server was running against the same `web/.next` from another
session for part of this work. Two `next dev` processes cannot share that directory, and the
shared server's Tailwind JIT served stale CSS, which produced misleading intermediate readings.
The table above was measured after that server exited, on a clean server serving this branch.

### 9.2 P1–P6 record — completed 2026-08-29

All phases built on `feat/landing-v3-p0`. Final state: **`npm run build` green, 83/83 static pages**
(72 before; the 11 new ones are `/employees`, five employee pages, `/industries` and four industry
pages), **864/864 tests**, lint clean on every file added or rewritten.

| Phase | What shipped |
|---|---|
| **P1** | `SignalField` (ogl shader: teal threads + one copper thread, cursor-reactive), `LandingHero` (Fraunces poster type, mask reveal, rotating outcome line), `EmployeeCard` (materialises from conversation fragments), `ProofStrip`, `LiveDemo` |
| **P2** | The hinge (glow, not a background swap) and `HowHiringWorks` — four steps joined by the Thread |
| **P3** | `Workday` (the set piece) plus `ProductFrame` with three real-UI scenes; `MeetEmployees` |
| **P4** | `PricingPreview` (plan data and Stripe paths untouched), `HonestFaq`, `AuditCta`, `FinalCta` |
| **P5** | Perf/a11y pass — measurements below |
| **P6** | `/employees`, `/employees/[slug]`, `/industries`, `/industries/[slug]`, and the whole `(marketing)` group moved to the dark canvas |

**Deviations from the plan, and why.**

1. **No GSAP on the landing.** §6 budgeted GSAP + ScrollTrigger + DrawSVG for the Thread and the
   pinned story. Both are `stroke-dashoffset` and `position: sticky` driven by one rAF-throttled
   scroll hook instead — same effect, zero library. GSAP stays installed for the dashboard.
2. **No separate "Memory" section.** §5 row 7 is folded into the Workday story, whose second act
   *is* the memory argument told with the real CRM surface. A prose section restating it would have
   spent a third of the word budget saying the same thing twice.
3. **The Spline scene needed its background cleared.** The scene ships a light backdrop that punched
   a grey rectangle through the dark canvas. `SplineClient` now forwards `onLoad` so the caller can
   call `setBackgroundColor("transparent")`, and the employee stands in a pool of light instead.
4. **`DemoCallButton` gained one optional prop.** `onStateChange` is a read-only tap so the demo's
   rings can react to the real Vapi state machine. The state machine itself is untouched.

**Measured, not estimated:**

| Budget (§7) | Target | Actual |
|---|---|---|
| Initial JS on `/` | < 300 KB gz (deviation) | **199.0 KB gz** across 13 chunks — also under doc 17's original 200 KB, so the JS half of the deviation was not needed |
| `ogl` in the initial bundle | must be lazy | **lazy** — absent from every initial chunk |
| Spline runtime in the initial bundle | must be lazy | **lazy** — absent from every initial chunk |
| WebGL contexts above the fold | ≤ 1 | **1** |
| WebGL on mobile (375px) | none | **0 canvases** |
| Contrast, dark surface | AA | **all ten token pairs pass AA for normal text**; lowest is ink-faint on a glass card at 5.32:1 |

Reduced motion is guaranteed at the surface, not per component: a `@media (prefers-reduced-motion)`
block inside `.landing-surface` neutralises every animation, transition and smooth scroll, so a
component added later cannot forget to opt in.

**How the whole `(marketing)` group went dark without per-page conditionals.** 588 + 76 literal hex
values across 35 files were mapped to the `--s-*` role tokens by a prefix-aware pass (`bg-`, `text-`
and `border-` of the same hex resolve to different roles), plus 31 `bg-white` panels which become
bone glass on the dark canvas. Because the warm values are byte-identical to the literals they
replaced, that sweep changed nothing on its own; flipping `MarketingSurface` then moved every page
at once. Off-system slate and blue values found along the way (`#64748B`, `#2563EB`, `#CBD5E1` …)
were folded into the same roles — they were already inconsistent on the warm surface.

Two hand-fixes the sweep could not make: the featured pricing plan needed its own
`--s-feature-*` role (a fully copper-filled card violates doc 17's "copper is an edge, never a
field"), and the mobile menu overlay plus the header behind it were made fully opaque — they were
`/97` and `/60`, so the page scrolled visibly behind an open menu.

### 9.3 Known gaps

- **Lighthouse was not run.** No Lighthouse binary in this environment; the budget table above is
  measured from the production build's own chunks and from the browser, which covers JS weight but
  not LCP or the a11y audit. Run it against a deployed preview before calling D4 acceptance met.
- **Placeholder metrics are live on the homepage** (owner-approved, §2). The launch checklist entry
  is the gate.
- **The old marketing components are now orphaned.** `HeroPremium`, `WhyDenku`, `UseCases`,
  `HowItWorks`, `DemoCallout`, `OutcomesStrip`, `SecurityTeaser` and friends were the previous
  homepage composition. They were tokenised by the sweep and still build, but nothing renders them.
  Deleting them is a tidy-up for a separate change, not something to bundle into this one.

---

### 9.4 Wave 2 — services, i18n, auth and brand (2026-08-29)

Scope added after the first review. Final state: **`npm run build` green, 178 static
pages, 864/864 tests, lint clean on every file authored here.**

| Item | What shipped |
|---|---|
| **Channel honesty** | `lib/marketing/content/channels.ts` — a marketing-only view, separate from the runtime registry. Voice / Telegram / Email present as **Live**, Instagram as **Receiving**, and Messenger / WhatsApp / SMS / Web chat as **Beta, not in any plan**. `ChannelGrid` puts the status on every card's face. |
| **Four services** | `/services` plus `/services/[slug]` for AI Employees, AI Audit, AI Studio and Custom AI. Each states what you get, how it is delivered, and how it is priced — including "quoted" where no price list exists. |
| **Request page** | `/request` with intent tabs, reusing the existing `/api/marketing/contact` route and `contact_requests` table. The only backend change is an **allowlisted `source`** so the four intents don't land in one pile. Second path out: the demo line takes the enquiry itself. |
| **Pricing** | `/pricing` rebuilt dark, with the billing math spelled out and a worked example. |
| **i18n** | `next-intl` with `localePrefix: "as-needed"` — English at the root, `/es`, `/de`, `/tr`. Marketing moved under `app/[locale]`. Four message files, hand-written (not machine-translated). Locale switcher in the nav and footer. Sitemap emits every path per locale with `hreflang` alternates. **Completed 2026-08-31** — the first pass only translated the chrome and the homepage; every subpage's body was still English. See §9.5. |
| **Geo detection** | Country → language in middleware (`x-vercel-ip-country`, `cf-ipcountry` fallback), unknown country → English. Skipped for crawlers, and skipped once `NEXT_LOCALE` exists so a manual choice is never overridden. |
| **Auth** | Dark, matching the site. Right panel is a rotating three-scene story of the product (missed call → booked → remembered). Google/Facebook buttons present but genuinely `disabled` behind `NEXT_PUBLIC_SOCIAL_AUTH_ENABLED`. |
| **Brand** | `DenkuMark` — three swept blades around a hollow core, filled by one diagonal gradient across the whole form. Applied to nav, footer, auth, onboarding and the dashboard shell; `icon.svg` and `apple-icon.svg` share the geometry. Gradient is **deep teal → brand teal → copper** (doc-17 tokens), chosen by rendering five candidates side by side: routing through bone came out milky, and copper→bone alone collapsed to one warm blob at favicon size. |
| **Filled-out pages** | `/security` (six real controls plus a "not claimed" section naming no SOC 2, no HIPAA, no pen test) and `/company` (four engineering rules that can be checked against the product). |

**Decisions taken rather than asked, with the reasoning:**

1. **One pricing ladder, not the benchmark's voice/chat split.** Creato prices chat from
   $349 and voice from $749 as separate products. Denku's billing meters **voice minutes and
   nothing else**, so messaging channels genuinely cost the customer nothing extra. A second
   price list would have been a second meter that does not exist.
2. **Plan names stay Starter / Growth / Scale.** Doc 14 proposed Solo / Team / Scale, but the
   plan codes are baked into `billing_plan_catalog`, Stripe and the dashboard. Buying "Team" and
   landing in an account labelled "Growth" is a support ticket for a cosmetic gain.
3. **No training/workshop service.** It is the one Creato offering with no counterpart in the
   product and no way to deliver without headcount. AI Studio takes that slot instead.
4. **No invented pack SKUs.** Doc 04 recommends minute/message packs and a setup SKU. They are
   not built and cannot be bought, so they are not on the pricing page.
5. **`<html lang>` stays English; the locale is declared on the `[locale]` wrapper.** Making the
   root layout dynamic to read the locale would cost static generation on all 178 pages. `lang` is
   valid on any element, assistive tech honours the nearest one, and search engines take their
   signal from the `hreflang` alternates, which are correct.
6. **Auth is not locale-prefixed.** `/login` stays `/login`; the language comes from the
   `NEXT_LOCALE` cookie. Prefixing it would mean rewriting every middleware redirect and
   Supabase callback URL for two pages nobody indexes. Cost: those two pages became dynamic.

**Open, needing the owner:**

- **OAuth apps.** Create the Google client (and Meta app if Facebook is kept), add them as
  Supabase providers, then set `NEXT_PUBLIC_SOCIAL_AUTH_ENABLED=true` and implement
  `onProvider` with `supabase.auth.signInWithOAuth`. Nothing else changes.
- **Email's runtime flag.** The owner states Email is fully working; the runtime registry still
  has it at `productionReady: false`. The marketing site presents it as Live, but the flag was
  deliberately left alone — flipping it changes product gating and should be an engineer's call.
- **AI Studio prices.** The page says "quoted" because no price list exists. Give me the numbers
  and it prints them.
- **Geo detection is Vercel-only.** It reads `x-vercel-ip-country`; locally and on other hosts
  everyone gets English, which is the correct fallback but means this cannot be verified until
  deploy.
- **Legacy pages are English only.** `/privacy`, `/terms`, `/docs`, `/support`, `/about`,
  `/contact`, `/use-cases` were not translated. Legal text in particular should not ship as a
  machine translation.

---

### 9.5 Translation completion and two bugs (2026-08-31)

The owner found two real defects in the first i18n pass, and both were mine.

**1. Non-English pages still showed English.** The first pass translated the chrome
(nav, footer) and the homepage, and I reported it as "every page I built, in four
languages". That was an overclaim: the bodies of `/services`, `/employees`,
`/industries`, `/pricing`, `/company` and `/security` were still hardcoded English,
because the copy lived in the data modules where a translation had nowhere to go.

Fixed by moving **all** page copy into the message files and reducing the data
modules to structure only:

- `lib/marketing/content/services.ts` now carries slug, glyph, kind, whether a price
  is printed, and the CTA target. Nothing else.
- `lib/marketing/employees.ts` carries slug, given name and glyph. The given name is
  deliberately not translated — Ava is Ava in every language.
- `lib/marketing/industries.ts` carries slug and which employee it recommends.

Everything visible is now keyed by slug in `src/messages/*.json`, so adding a language
is a message file rather than a code change, and the two cannot drift.

Also translated in the same pass: the plan bullets and the `/ month` unit, which come
from `pricing-data.ts`. **Plan names stay untranslated** — "Starter" on the site and
"Starter" in the billing account have to be the same word in every language.

Verified by a scanner that pulls every English string out of `en.json` and looks for
it verbatim in the rendered HTML of the other three locales, across 14 pages × 3
locales: **0 leaks**, plus a targeted sweep for the `pricing-data.ts` strings.

**2. `/tr/login` returned 404.** Auth lives outside the `[locale]` tree by design, but
the nav used the locale-aware `Link`, which prefixed `/login` to `/tr/login` — a route
that does not exist. Every non-English visitor hit a 404 from the header.

Two-part fix: auth links now go through `ExternalToLocale` (a named component rather
than a bare `next/link`, so the intent is legible at the call site and nobody
"corrects" it back), and the middleware now redirects `/{locale}/login` → `/login` so a
typed URL or an old bookmark resolves instead of 404ing. The language survives in the
`NEXT_LOCALE` cookie, which is what the auth layout reads.

---

### 9.6 Channel landing pages and a channel-led nav (2026-08-31)

**Shipped.** `/voice` and `/chat`, in all four languages, plus a nav reorganised the
way the benchmark's is.

The roster pages are organised by ROLE — receptionist, missed-call rescue — which
matches the hiring metaphor but misses how people search. "AI call agent" and "AI
chat agent" are distinct queries and distinct ad destinations, and the site had
nowhere to land them. These two pages catch that intent.

They do **not** imply two products. Both point at the same single plan, and each
carries a billing paragraph that is different and true: voice is billed by the
minute, chat is included and unmetered. If chat is ever priced separately, that
paragraph is what changes.

Nav is now **AI Voice · AI Chat · AI Studio · Requests**. Services, Employees,
Industries, Pricing and Company moved to the footer under a new "Explore" column
rather than disappearing.

Naming: "AI Voice", never "AI Call Agent". CLAUDE.md bans "agent" in customer-facing
copy and doc 14 makes "AI Employee" the category term, so the channel is the noun
and never the worker.

### 9.7 Splitting Voice and Chat into separately priced products — NOT DONE, and why

The owner proposed six Stripe products (Voice ×3, Chat ×3) plus AI Studio packages.
The Stripe side is genuinely easy. The rest is not, and the blocker is not the
website:

| What the split needs | State today |
|---|---|
| A way to count chat usage | **None.** No `message_count`, `messages_used`, `message_quota`, `billable_messages` or `message_overage` anywhere in `src/lib` or `src/app/api`. |
| A usage metric that isn't minutes | `usageMath.ts` computes one number: `billable_minutes = Σ ceil(duration_seconds/60)` per call. The whole view chain (`org_daily_usage` → `org_monthly_invoice_preview`) is shaped around it. |
| Plan limits with a message axis | `getEffectiveLimits` returns `max_concurrent_calls` and `included_phones`. Add-ons are `extra_concurrency` and `extra_phone`. There is no message dimension. |
| More than one plan per org | `org_plan_limits` holds a single `plan_code`. Selling voice and chat separately means either two subscriptions per org (schema change) or a 3×3 matrix of combined plans. |
| Something to sell on the chat plan | Only Telegram is `productionReady` among chat channels, plus email by owner statement. Instagram is receive-only; Messenger, WhatsApp, SMS and web chat have no adapter at all. |

Selling a "Chat plan with N messages" today would mean promising a quota nobody can
count, enforce, or cap — which breaks the repo's own "fail closed on money" rule and
is the same class of mistake as the SOC 2 claims that had to be removed.

**Recommended order if the owner wants the split:**

1. Message metering: a usage row per inbound/outbound message, aggregated the way
   minutes already are, with the same idempotency guarantees.
2. A second axis on `billing_plan_catalog` and `getEffectiveLimits`, plus a cap and
   pause path for messages mirroring the minute one.
3. Decide the plan model: two subscriptions per org, or a combined matrix. This is
   the decision that shapes the other two.
4. Only then: Stripe products, and the pricing page becomes a small change.

**AI Studio packages** are blocked on something much smaller — the owner has not
given price points. The page says "quoted per project" until they exist. Given
Studio is delivered by hand rather than by the platform, its packages could be sold
as one-off Stripe products without any of the metering work above; that is the
cheapest of the three ideas to ship.

---

### 9.8 Chat as a purchasable capacity (2026-08-31)

The owner asked whether to meter messages or price flat like the benchmark. Answer: **neither
exactly — price on capacity.** The benchmark does not meter either; its tiers read "1 agent /
3 agents / team". A capacity number is a COUNT this schema already answers; a message quota
would need the metering pipeline §9.7 showed does not exist.

**What shipped**

| Piece | Where |
|---|---|
| Entitlement (slots bought) | Derived from `billing_org_addons` — nothing stored, so it cannot drift from what Stripe charged |
| Activation (channels switched on) | `org_active_channels`, new table |
| The gate | `respondToInbound`, beside the existing handling checks. Ingest stays OPEN — a workspace can connect a channel and watch messages arrive before paying; only the REPLY is gated. Same shape as Instagram's existing receive-only behaviour |
| Workspace safety valve | `MAX_REPLIES_PER_ORG_PER_HOUR = 500` in the reply engine, beside the per-conversation cap that was already there |
| Chat-only customers | A `chat_only` $0 base plan. `org_plan_limits` holds one `plan_code`, so chat-only needs something to point at; zero concurrency also makes the existing lease check deny voice with no new code |
| Pricing | $299 for one channel, $499 for two, plus a quoted tier — on `/pricing` and `/chat`, in four languages |

**Decisions worth keeping**

1. **Two tiers, not three.** The benchmark has three because Instagram, WhatsApp and web chat
   are all live for them. Only Telegram and email are sellable here, so a three-slot tier would
   sell a number against two available channels. `chat_standard` is two slots today and becomes
   three when a third channel ships — and the pricing page imports `CHAT_ADDON_SLOTS` rather
   than hardcoding, so the page cannot advertise more than the gate grants.
2. **No schema change for the add-on.** `billing_org_addons.addon_key` is plain `text` with no
   CHECK, so `chat_basic` / `chat_standard` are just new values reusing the existing Stripe
   flow, idempotency keys and invoice-staleness marking.
3. **A downgrade is explainable.** When slots shrink below the number of activated channels,
   the oldest activations keep working and the rest go quiet, rather than the system guessing
   which one the customer meant.
4. **Six strings had to change.** "Telegram and email included, unmetered" was true until chat
   became an add-on. Leaving it would have put two prices for the same thing on one page — the
   same class of error as the compliance claims that had to be removed.

**One gap found while building and closed:** buying a plan fills the slot count, but
`org_active_channels` starts empty — so without an activation screen the AI would have stayed
silent right after a sale and the feature would have looked broken. Rather than add a settings
UI, a spare *paid* slot now claims itself on the first message: the customer connected the
channel and a message arrived, which is what they meant. The claim is idempotent on
`(org_id, channel)`, so a retried webhook cannot consume two, and a failed write refuses the
reply rather than reading as "allowed".

**Not built, deliberately:** message metering. If chat volume ever needs billing, it gets built
then, and nothing shipped here has promised a number it cannot count.

---

### 9.9 AI Studio gets a price list (2026-08-31)

`/services/ai-studio` said "quoted per project" because no numbers existed. The owner supplied
them by pointing at the benchmark, so the packages are now printed.

**The numbers, read from the benchmark's own markup rather than a summary of it.** A first pass
reported the tiers as `$3,490`–`$8,990`; the rendered markup shows a `<span>` of `349` beside a
superscript `0`, i.e. **$349**, and the sprint doc had already recorded the same figures from
`docs/denku-2.0/04`. Visuals ship at **$349 / $499 / $649** (10 / 30 / 60 assets) and video at
**$399 / $599 / $899** (3–5 / 5–8 / 8–12 videos), each with the revision count and delivery
window the tier actually carries.

**Prices live in code, words live in messages.** `lib/marketing/content/studio.ts` holds the
tiers, prices and featured flag; every visible string is in `messages/*.json` under `studio.*`.
A test asserts no message file contains a dollar figure, so a price can never say $349 in
English and $449 in German — the exact drift this split exists to prevent. Another asserts every
tier has a name, a volume, an audience line and a **multi-item** features array in all four
languages, because a `features` value written as one long sentence renders as a single bullet
and silently loses the package contents.

**Nothing is purchasable, and that is the design, not an omission.** Every other price on this
site buys something that provisions itself — a plan, a number, a channel slot. A studio package
buys production time: a brief, a concept round, a fixed number of revisions, a delivery date.
None of that can be scoped before the conversation, so a checkout button would take money for
work nobody has agreed on. The benchmark reaches the same conclusion from the other direction:
all six of its tiers say "contact sales". **So AI Studio needs no Stripe products at all.**

**What the page could not get, and why it was not faked.** The benchmark carries this page on
photographs of finished client work — fashion, product, lifestyle. Denku has none. Generating
sample images and presenting them as a portfolio would be a fabricated body of work, so the page
carries itself on the landing system's own visual language: the glass panels, the copper/teal
gradients, a twelve-item "what we make" grid and a four-step production section. **Real sample
work is the one asset this page is still missing**, and it is recorded as an asset request rather
than quietly designed around.

**One shared component had to bend.** `SubpageHero` hardcoded "Hear it now" → the voice demo and
"See pricing" → the homepage plans. On a page selling images and video that prints its own
prices, both are untrue. The hero now takes optional CTA overrides, defaulting to exactly its
previous behaviour; studio passes "Ask for a quote" and an in-page jump to the packages. A `#`
href renders a plain anchor rather than a locale-prefixed router link, and the section carries
`scroll-mt-24` so the heading does not land under the fixed navbar.

## 10. Buy vs build

- **ThemeForest: no** — and §0 is the reason. The admired reference *is* a ThemeForest theme; buying
  one puts Denku on the same template as everyone else, and retro-fitting HTML/Bootstrap into
  Next.js 16 + React 19 + Tailwind v4 costs more than building.
- **React Bits: primary source.** Free, MIT, already proven here (F2). Components are copied in as
  source files and re-skinned to §3 tokens — never left on their demo colours.
- **21st.dev / Magic MCP:** useful for structural blocks if the key is renewed (F1).
- **Aceternity UI Pro (~$169 lifetime):** optional; does not beat React Bits on WebGL atmosphere.
- **Tailwind Plus (~$249):** wrong for this job — light and utilitarian.
- **Money is best spent on a custom Spline/Blender asset**, not a component licence. Prices seen
  Aug 2026; re-check at purchase.

---

## 11. Skills and tooling

- **taste-skill** (github.com/leonxlnx/taste-skill, MIT) — installed 2026-08-29 into
  `~/.claude/skills/`: `taste-skill` (design-taste-frontend), `redesign-skill`, `soft-skill`,
  `minimalist-skill`, `brutalist-skill`, `gpt-tasteskill`, `brandkit`, `image-to-code-skill`,
  `imagegen-frontend-web/-mobile`, `stitch-skill`, `output-skill`, `taste-skill-v1`. The three that
  apply here: **taste-skill** (anti-slop landing work), **redesign-skill** (audit-first on an
  existing site), **soft-skill** (high-end spacing/shadow/motion detail). Loaded immediately — no
  session restart was needed.
- **ui-ux-pro-max** — already installed; palette and font-pairing data.
- Its anti-default list matches this plan's §2 resolution: no AI-purple gradients, no centered hero
  over dark mesh, no three equal feature cards, no Inter + slate-900.

---

## 12. Open decisions

1. **Performance deviation (§7)** — accept 2.5 s / 300 KB on the homepage, or keep doc 17's 2.0 s /
   200 KB and drop the WebGL field?
2. **21st.dev key** — renew, or drop Magic MCP from the plan permanently?
3. **Scope of the dark system** — homepage only, or the whole `(marketing)` group in P6?
4. **Roadmap order** — run this now, ahead of its D4 slot, or after D0–D3 as doc 20 sequences it?
5. **Assets** — real customer logos, product screenshots, or a call recording we may show? Sections
   3, 5 and 6 get much stronger with them.
