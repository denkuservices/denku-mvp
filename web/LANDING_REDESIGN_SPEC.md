# Denku — Landing Page Redesign Spec (v2: Hybrid Dark SaaS)

> **Status:** APPROVED, not yet built. Created right before a Claude Code restart to load the
> 21st.dev Magic MCP. The session that created this had no Magic MCP tools available; the build
> is intentionally deferred to the post-restart session. **Read this top-to-bottom before building.**

---

## 0. Pre-flight (do this first, post-restart)

1. Confirm Magic MCP is loaded: run `/mcp` — you should see a `magic` server (21st.dev).
   - Config lives in `~/.claude.json` under top-level `mcpServers.magic` (command `npx -y @21st-dev/magic@latest`, `env.API_KEY` set).
   - If it is NOT listed, the restart didn't pick it up — tell the user before proceeding.
2. The **UI UX Pro Max** skill is installed at `.claude/skills/ui-ux-pro-max/` and is the primary design-system reference. Use its data (styles/colors/typography CSV) to inform tokens.
3. **Requirement from the user:** source UI components from **Magic MCP** ("for ALL UI components"); only hand-build a primitive when Magic genuinely can't produce it. Always re-skin Magic output to the tokens in §3.

---

## 1. Product positioning (do not drift)

Denku is **AI communication infrastructure** — voice + messaging + booking automation. Position it
like **Stripe / Twilio / Vapi**, NOT an AI agency or design/marketing studio.

One-liner: *"An AI-powered communication operating system that handles every customer call, message,
and booking for businesses automatically."*

**Never include:** AI marketing-agency services, AI video generation, AI design-studio concepts.

**Copy voice:** Stripe / Linear / Vercel. Short sentences. High clarity. Confidence > excitement.
Banned words: "revolutionary", "game-changing", and startup-cringe hype generally.

---

## 2. THE design system — "Contextual Hybrid" (user's explicit decision)

> One-line philosophy: **"Start with emotion, transition into clarity, end with trust."**
> The page is a journey: *cinematic AI experience → structured SaaS product → trust*.
> It must read as ONE intentional design, never two bolted-together themes.

Three zones, top to bottom:

### Zone A — Hero: cinematic dark experience
- Deep near-black immersive background (`#05060A`–`#0A0B12` range).
- **KEEP the existing Spline robot** (cursor-following AI entity). Decision is final — see §5.
  - Scene URL: `https://prod.spline.design/UAZ0yJcBnzG0I0Yb/scene.splinecode`
  - Rendered via `web/src/components/marketing/SplineClient.tsx` (`<SplineClient scene={...} />`, ssr:false).
- Minimal high-contrast type overlay. Feels cinematic, emotional, "AI is alive."
- Goal: curiosity + wow + intrigue.

### Zone B — Transition zone (the hinge — get this right)
- A soft section right after the hero: subtle gradient shift from cinematic black →
  structured SaaS dark. Emotional tone drains out; clarity + control enter.
- This is the "mental shift" from AI *experience* to AI *product*. Must feel seamless/intentional.

### Zone C — Body: Stripe-level structured dark SaaS UI
- Deep gray backgrounds, sharp 1px borders, minimal gradients, high readability.
- Rational, precise, infrastructure-focused. No emotional language here.

### Accent system (critical constraint)
- **Do NOT use warm bone (`#F7F5F1`) as a base.** The previous warm bone+teal theme is being
  replaced for the landing. Bone/warm appears ONLY as a *micro-accent*: highlights, hover states,
  subtle glow — to keep the cold dark UI from feeling sterile. Teal (`#1B6E6E`) may carry over as
  a brand accent but used as a glow/edge, not fields of color.

---

## 3. Token starting point (tune against UI UX Pro Max data)

```
--bg-hero:        #06070C   /* near-black cinematic */
--bg-saas:        #0B0D14   /* structured dark body */
--bg-saas-elev:   #11141D   /* elevated cards/panels */
--border:         rgba(255,255,255,0.08)
--border-strong:  rgba(255,255,255,0.14)
--text-hi:        #F4F6FB
--text-mid:       #AEB4C2
--text-low:       #6B7280
--accent-teal:    #1B6E6E   /* brand glow/edge */
--accent-warm:    #B8895A   /* copper micro-accent ONLY */
--glow:           radial teal/indigo, very low alpha, behind hero + final CTA
```
Use these as CSS variables (mirror the `.brand-surface` pattern already in `web/src/app/globals.css`).
Fonts: keep Inter (body) + JetBrains Mono (eyebrow/mono). Display face: pick per UI UX Pro Max — a
clean geometric/grotesk reads more "infra" than Fraunces serif for this dark direction; confirm with
the skill's font-pairing data before committing.

---

## 4. Page structure (sections, in order)

Current composition (`web/src/app/(marketing)/page.tsx`) to be rebuilt:
`HeroPremium → WhyDenku → UseCases → HowItWorks → DemoCallout → OutcomesStrip → Pricing → SecurityTeaser → Contact`

New target order + intent:

1. **Sticky Navbar** — logo "Denku"; links: Product, Features, Pricing, Docs (placeholder). Primary
   CTA: **"Get Early Access"**. Minimal, sticky, semi-transparent blur (dark glass).
2. **Hero (Zone A)** — headline **"AI that answers every customer call for your business."**
   Sub: *"Denku is an AI-powered communication system that handles calls, messages, and bookings
   instantly—so you never lose a customer again."* CTAs: primary **"Talk to Denku"** (keep
   `DemoCallButton` Vapi logic), secondary **"See how it works"** (anchor scroll). Keep Spline.
3. **Transition zone (Zone B)** — gradient hinge, one-line clarity statement.
4. **Problem** — title *"Businesses are losing customers every day."* 3 factual pains:
   missed calls = lost revenue · hiring support is expensive & inconsistent · existing AI tools are
   unreliable / not production-grade. Factual tone, no fluff.
5. **Solution — "Meet Denku."** Every business gets an AI comms system; each phone line becomes an
   AI agent; it handles calls + messages + bookings automatically. Include a visual grid/diagram.
6. **Features (bento grid)** — AI Voice Agents (core) · SMS/WhatsApp follow-ups · Appointment
   booking automation · CRM/workflow integrations (placeholder) · Real-time call handling ·
   Concurrency-based scaling. One sentence each, product-first, no fluff.
7. **How it works (3 steps + flow diagram)** — Connect your business phone line → Configure AI
   assistant behavior → Start handling calls instantly.
8. **Trust / Reliability** — frame as infrastructure: uptime mindset, deterministic behavior,
   concurrency control, billing transparency. Stripe-like seriousness.
9. **Pricing** — Starter / Growth / Business. Axes: # phone lines, concurrency capacity, usage
   scaling. Keep it simple. (Reuse pricing logic in existing `Pricing.tsx` where possible.)
10. **Final CTA (Zone A energy, reprised)** — *"Never miss another customer call."* CTAs:
    **"Get Early Access"** + **"Talk to Denku"**. Strong dark bg, subtle glow, AI aesthetic.
11. **Footer** — minimal: Denku · Terms · Privacy · Contact.

---

## 5. Spline hero decision — KEEP (final)

Rationale (record in code comments): already integrated and performant; carries the "Talk to Denku"
interaction; provides a unique "AI presence" element a generic Magic MCP 3D block wouldn't beat;
replacing it adds bundle weight + regression risk for no clear conversion gain. Keep it; tighten the
copy/frame so it reads as *infrastructure*, not *agency*.

---

## 6. Hard constraints / preserve

- **Preserve all business logic**: `DemoCallButton` Vapi state machine + rate limiting; `Contact`
  form validation/submit; `Pricing` plan data + Stripe paths. Restyle only.
- Stack: Next.js 16 App Router, Tailwind v4 (explicit color values in marketing — no shadcn tokens),
  Supabase, Vapi, Stripe. Use markdown-link file refs when reporting.
- Verify with `npm run build` (from `web/`) before declaring done. Prior baseline: 72 pages passing.
- Marketing files: `web/src/components/marketing/*`, page at `web/src/app/(marketing)/page.tsx`,
  layout at `web/src/app/(marketing)/layout.tsx`, global CSS at `web/src/app/globals.css`.
- The **onboarding + auth + dashboard** already use the warm bone+teal theme. This rebuild is the
  **marketing landing** direction. Before unifying themes app-wide, ASK — don't assume the dark
  system should overwrite onboarding/auth.

---

## 7. Suggested build order (post-restart)

1. Add the hybrid tokens to `globals.css` (new `.landing-surface` scope; don't clobber `.brand-surface`).
2. Navbar (dark glass) → Hero (Spline + new copy) → Transition hinge.
3. Problem → Solution → Features bento → How-it-works → Trust → Pricing → Final CTA → Footer.
4. Source each block from Magic MCP, then re-skin to §3 tokens; keep motion subtle.
5. `npm run build`; then have the user `npm run dev` and eyeball the zone transitions.
