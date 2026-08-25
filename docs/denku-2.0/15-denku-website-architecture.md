# 15 — Denku Website Architecture (new IA + homepage blueprint)

> Replaces the current marketing IA. Includes the homepage section blueprint (mission §20).
> Design language: doc 17. Wow layer: doc 18.

## 1. Sitemap (launch scope — deliberately small, Creato-lesson: small surface, deep funnel)

```
denku.com
├── /                       Homepage (blueprint below)
├── /employees              Template gallery (the product catalog)
│   ├── /employees/receptionist
│   ├── /employees/booking-assistant
│   ├── /employees/missed-call-rescuer
│   ├── /employees/after-hours
│   └── /employees/support-agent
├── /industries/…           Vertical pages (launch 4: hvac-plumbing, dental, med-spa-salon, law)
│                           — programmatic template; grows to N for SEO/AEO
├── /pricing                Ladder + packs + honest billing math + FAQ
├── /demo                   "Talk to Denku": live number + web call + booking embed
├── /audit                  Instant AI Audit (lead magnet; shareable report URLs /audit/r/{id})
├── /product/inbox|crm|analytics   3 deep-dive pages rendering REAL product UI
├── /trust                  Security, data isolation, spend caps, honest compliance status
├── /about  /contact        Compact
├── /legal/{terms,privacy,dpa}
└── (auth) /login /signup   → onboarding (existing, re-skinned)
```

Explicitly **not** at launch: blog (until the SEO engine sprint), case studies (until customers
exist — the nav slot ships as "Proof" pointing to demo+audit), careers, partner portal.

## 2. Homepage blueprint (section by section)

| # | Section | Purpose / conversion objective | Content & visual | Interaction |
|---|---|---|---|---|
| 1 | **Hero** | one idea in 3s: hire an AI employee that answers | H1 "Hire your first AI employee." + typewriter outcome line ("…answers every call / …books the job / …texts back missed calls"). Right: the **Employee Card** materializing (doc 17 signature) with live status "On shift · 24/7". CTAs: **[Talk to Denku →]** (primary, goes to live demo) · [See pricing] (ghost) | typewriter; card assembles from conversation fragments; reduced-motion safe |
| 2 | **Proof strip** | replace logo-bar we don't have | sourced stat chips: "62% of SMB calls go unanswered" · "85% of missed callers never call back" · live counter "calls Denku answered this week: N" (real, from our own line) | counters animate on scroll |
| 3 | **Live demo** | the wow: experience before signup | phone number in huge type + web-call button; live transcript renders in a real Inbox conversation card as you talk | THE differentiator; see doc 18 |
| 4 | **How hiring works** | de-risk setup | 4 steps (Tell it about your business → Test-call it → Connect your number → It starts its shift) with scroll-drawn connector line | GSAP DrawSVG; mirrors onboarding truthfully |
| 5 | **Meet the employees** | product catalog | 5 template cards (role, what it does, outcome metric); hover tilt + conic sweep on featured card | links to /employees/* |
| 6 | **The workday** (scroll story) | show the real product | 3 pinned scenes of REAL UI: Inbox (call → ticket, takeover), CRM (contact timeline grows, "Denku remembers"), Home (outcomes/savings) | scroll-pinned product frames with labeled sample data |
| 7 | **Memory** | differentiator | "It never forgets a customer." split: left copy, right contact-timeline animation | timeline entries cascade |
| 8 | **Pricing preview** | qualify + no surprises | 3 plan cards + "hard spend caps — we pause before we surprise-bill you" + minute-pack chips | → /pricing |
| 9 | **AI Audit CTA** | second conversion path for not-ready visitors | "See what your phone is costing you" + URL/phone input inline | inline start; report by email + URL |
| 10 | **Honest FAQ** | objections | billing math (per-minute rounding, in plain words), cancel-anytime, what channels are live *today*, data ownership | accordions |
| 11 | **Final CTA** | close | "Your next employee starts today." [Talk to Denku] [Hire now] | conic glow border |

Every section ships with real or clearly-labeled-sample data; nothing fabricated (house rule).

## 3. Template page pattern (`/employees/*` — the Creato agent-page pattern, upgraded)

Hero (role + outcome headline + demo scenario button that *calls the demo line pre-set to that
persona*) → "A day in the life" timeline (6am missed call → texted back → booked) → feature list
(only live features) → integration row → vertical fit chips → pricing block → FAQ → CTA. Each
page is also the landing target for `best AI receptionist for {vertical}` SEO/ads.

## 4. Industry page pattern (`/industries/*`)

Programmatic template: vertical pain stat (sourced) → recommended employee template preset →
2-minute vertical demo scenario → objection FAQ (e.g., "can it check insurance?" honesty) →
pricing. Launch 4 handcrafted; the template becomes the SEO engine in the growth sprint.

## 5. Pricing page architecture (doc 04 applied)

1. Plan cards: **Solo $149 / Team $399 ★ / Scale $899** re-expressed as employees × channels ×
   minutes; ★ center-stage; per-minute-included math visible; monthly/annual toggle (−15–20%).
2. **Minute/Message Packs** row (one-click Stripe checkout, no plan change).
3. "We'll set it up" SKU card (optional, priced, waived annual).
4. The honesty block: how a minute is counted (ceil per call, worked example), caps and pause
   behavior, cancel policy. This block is a *feature*, styled like one.
5. Enterprise/custom: single quiet card above Scale → Calendly.
6. FAQ + comparison table vs "hiring" ($ per month vs receptionist salary — the only competitor
   comparison that matters at SMB).

## 6. Conversion instrumentation (new, non-negotiable)

PostHog on every CTA; audit-report shares tracked; demo-line calls become leads in Denku's own
CRM (dogfood); weekly funnel review is part of the operating cadence, not an afterthought.
