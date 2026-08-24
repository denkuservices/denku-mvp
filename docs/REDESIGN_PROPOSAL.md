# Denku — Authenticated Experience Redesign Proposal

> **Status: PROPOSAL — awaiting owner approval. No code has been written against this document.**
> Prepared 2026-08-24. Author: AI product-architecture pass over the live repo + competitive
> pattern analysis. Companion docs: `docs/PROJECT_VISION.md` (north star),
> `docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md` (platform model rationale),
> `skills/platform-architecture.md` (what is already built), `CURRENT_SPRINT.md` (Sprint 8.5 state).
>
> Research basis, stated honestly: competitive analysis draws on deep product knowledge of
> HubSpot, Intercom (Fin), Salesforce (Agentforce), HighLevel, Sierra, Decagon, Ada, Attio and
> Linear as of mid-2026 — structural UX/IA patterns, which are stable — not a live screenshot
> teardown. Where a claim depends on a competitor detail that may have shifted, it is framed as
> a pattern, not a fact about their current release.

---

## 0. The single most important finding

**Most of what this redesign asks for already exists in this repo, dark-launched behind two
flags.** Sprints 4.5 → 8.5 built: the channel-agnostic data model
(Conversation/Message/Contact/Artifact + adapters + one ingest pipeline), a platform read model,
a platform IA (Employees · Conversations · Contacts · Channels nav), an action-first dashboard,
truthful-count list surfaces, a rebuilt Settings control center, versioned Employee manifests
with per-conversation provenance, and a Requests surface. All of it is behind
`PLATFORM_UX_ENABLED` / `PLATFORM_MODEL_ENABLED` (default OFF), blocked on a staging
environment to flip — which R-031 has now unblocked.

**Therefore this is not a greenfield redesign. It is: flip, consolidate, rename, and then build
the three genuinely missing pillars — the unified Inbox as a working surface, the CRM's memory
layer (timeline + AI summary + lifecycle), and the AI Team management area — plus a re-narrated
onboarding.** Proposing a from-scratch rebuild would discard roughly four sprints of aligned,
tested work and re-introduce the exact regressions Sprint 8.5 caught.

---

## 1. Current-state assessment

**What is real and shipping (flag OFF, today's customer experience):**
- Voice channel end-to-end: provisioning, Vapi assistant, webhook pipeline, never-dead-end
  ticket/appointment artifacts, billing/overage/pause enforcement, concurrency leases.
- Legacy dashboard: 8 flat nav items (Dashboard, Phone Lines, Calls, Tickets, Appointments,
  Usage, Analytics, Settings), Horizon UI shell, real data, no pagination beyond `.limit(200)`.
- Instagram: OAuth connect (per-tenant encrypted creds), receive-only webhook verified in
  production, and — in flight on `feat/instagram-app-review`, uncommitted — a received-DM inbox
  with human-handoff/opt-out thread state (built for Meta App Review risk #1/#2).
- Onboarding: 6-step DB machine (Goal → Language → Phone intent → Plan → Activating → Live),
  voice-only framing, bone/teal brand theme, 1,283-line wizard client.

**What is built but dark (flag ON):**
- Platform model dual-write: voice + IG write `conversations`/`messages` via adapters + shared
  `ingestInboundMessage`. Reads not yet cut over (R-085).
- Platform IA: Dashboard · AI Employees · Conversations · Contacts · Channels · Tickets ·
  Appointments · Analytics · Settings; conversation thread with per-channel plugin renderers;
  aggregation read model; platform dashboard variant; Contacts over leads.
- Employee manifests: immutable versioned config revisions + provenance stamping.
- Settings control center: AI Employees · Channels · Organization · Billing & Usage · Account ·
  Integrations, persistent nav, live status index.

**What genuinely does not exist:**
- A unified Inbox *as a working customer surface* (Conversations list exists; the IG inbox
  exists separately; voice calls are a separate page; no context rail, no cross-channel thread
  handling, no generalized human-handoff).
- CRM depth: no unified contact timeline UI, no AI-generated contact summary, no lifecycle
  stages, no companies, no deals/pipeline, no human tasks (R-113 reserved), no notes.
- AI Team as a management surface (agents settings pages exist; no roster-with-outcomes, no
  agent detail with activity/history tabs; manifest history has no UI).
- Calendar (R-020, external OAuth dependency), Automations surface, WhatsApp/Telegram/Email
  channels (explicitly out of scope until the model is proven live).
- A single design language: four dialects coexist (marketing luxury theme, Horizon dashboard,
  shadcn primitives, and a zinc-sprawl in settings/instagram pages — R-129).

## 2. Problems with the current authenticated experience

1. **Voice-first IA with the platform bolted on behind flags.** Two parallel experiences exist;
   customers see the older one. The longer both live, the more they drift.
2. **Channel-shaped, not customer-shaped.** Calls, Tickets, Appointments, Leads are separate
   top-level silos; the same human appears in four places with no connecting thread. The
   product's own promise ("CRM as memory") is invisible.
3. **The AI is invisible as a workforce.** The product *does* work for the customer (answers
   24/7, files tickets, books appointments) but the dashboard reports activity, not
   accomplishment — nothing answers "what did my AI team do for me this week?"
4. **Settings-as-product.** Configuring the AI lives in Settings; there is no place where an
   "employee" is seen working. (Sprint 8.5's settings rebuild fixed navigation, not framing.)
5. **Onboarding sells a phone line, not an AI team.** The wizard is a competent checkout +
   provisioning flow; it never introduces the AI as a hire, never teaches it the business
   (business context lives in Settings), never shows it working before dropping the user into
   the dashboard. Its strongest existing asset — the web test call — isn't in the flow.
6. **Design fragmentation** (four systems) reads as unpolished exactly where trust matters.
7. **Known debt that touches this redesign:** dual step-numbering landmine (UI = DB − 1),
   1,432-line billing page (R-131, do-not-touch), zinc sprawl (R-129), `.limit(200)` with no
   pagination, some raw Supabase errors rendered.

## 3. Product positioning

> **Denku is an AI workforce for customer communication. Businesses hire AI employees; the CRM
> is the team's shared memory.**

Three consequences that shape everything below:

- **Two planes, never merged** (Sprint 8's recorded verdict): the **control plane** is the
  Employee (what it is: persona, knowledge, channels, policies — versioned, audited); the
  **data plane** is the Conversation/Contact (what happened — high volume, machine-written).
  The nav mirrors this: *AI Team* manages the control plane; *Inbox* and *CRM* render the data
  plane.
- **The CRM is memory, not a database product.** Its job is to make every AI interaction
  compound: each conversation enriches a contact; each contact's history makes the next AI
  interaction better. We do not compete with HubSpot on records management; we win on "your AI
  already knows this customer."
- **Honesty is a feature** (existing house rules R-018/`productionReady`): never fabricate
  totals, never surface a non-working channel as available, state limitations ("Instagram:
  receives, cannot reply yet") in the UI itself.

## 4. Research: patterns worth stealing (and avoiding)

| Pattern | Source of the pattern | Adopt? |
|---|---|---|
| Inbox and CRM as **separate top-level surfaces sharing a context rail** (conversation left, customer right) | Intercom, HighLevel | **Yes** — core of the Inbox design |
| **Object + timeline** record architecture: a contact is a header + activity timeline + related objects | HubSpot, Salesforce, Attio | **Yes** — core of contact detail |
| **AI agent as a managed worker**: roster → detail with Overview / Setup / Knowledge / Actions / Logs / Analytics tabs; test-before-deploy; QA/monitoring | Salesforce Agentforce, Sierra, Decagon, Ada, Intercom Fin | **Yes** — core of AI Team |
| **Outcome-first dashboard** ("resolved for you", deflection rate, revenue influenced) vs activity charts | Intercom Fin reporting, Agentforce analytics | **Yes** — dashboard v2 framing |
| **Channels are configuration, not navigation** — connect once in settings, then they appear as filters/badges everywhere | Intercom, HubSpot | **Yes** — keeps sidebar flat and scalable to 10+ channels |
| Saved views / filterable index pages instead of one page per record type | HubSpot, Attio, Linear | **Yes**, incrementally |
| Suggested replies + human takeover with explicit AI/human ownership per thread | Intercom, HighLevel | **Yes** — handoff now (built for IG), suggestions later |
| Pipeline as kanban with stage automation | HubSpot, HighLevel | **Later** — real, but not before the memory layer works |
| Everything-in-the-sidebar (15+ items, sub-menus everywhere) | HighLevel (cautionary) | **No** — this is the anti-pattern |
| Workflow-builder-first automation | HighLevel, HubSpot ops | **No for now** — an automation *engine* is a product of its own; ship visible "autopilot" behaviors first |
| Gimmicky AI chrome (sparkle-everything, purple gradients) | generic AI startups | **No** — premium restraint; AI presence shown through *outcomes and provenance*, not decoration |

## 5. Information architecture & navigation

**Target primary sidebar (flat — preserves the deliberate no-nesting rule):**

```
Home            ← the outcome dashboard
Inbox           ← every conversation, every channel (voice included)
CRM             ← contacts hub (index w/ internal sub-nav: Contacts · Requests · [Pipeline])
AI Team         ← the workforce: roster + employee detail
Analytics       ← deep reporting (headline numbers live on Home)
Settings        ← control center (Sprint 8.5 IA, kept)
─ later, appearing only when real:
Calendar        ← when R-020 calendar integration ships
Automations     ← when there is something to manage beyond built-in autopilot
```

6 items now, 8 at maturity. Deltas from the dark-launched platform nav (9 items):
**Conversations → Inbox** (verb-space users know), **AI Employees → AI Team** (roster framing),
**Contacts + Tickets + Appointments consolidate under CRM** (one customer-shaped hub with an
internal sub-nav, using the exact layout-level nav pattern Settings already established),
**Channels demotes to Settings → Channels** (configuration, not navigation — the strongest
cross-product research finding; channel presence surfaces as badges/filters in Inbox/CRM
instead). Requests (Sprint 8.5's tickets+appointments merge) becomes CRM's second tab —
nothing is lost, its list simply lives inside the customer hub.

Naming note: customer-facing copy continues to say **"AI"** (house rule); "AI Team" is the nav
label; an individual is an "AI employee". `agents` table and code identifiers do not rename.

## 6. Dashboard (Home) architecture

Primary question: **"What did my AI team accomplish for my business?"** — answered in this
order (extends Sprint 8.5's action-first structure rather than replacing it):

1. **Needs attention** (exists): pause/billing/channel-health alerts, conversations waiting on
   a human (from handoff state), failed webhooks — renders only when true; all-clear otherwise.
2. **Outcomes this period** (new): leads captured · conversations handled · appointments booked
   · requests resolved · minutes used vs plan. Each number links to its filtered surface.
   Honest-counting rules apply (`limited` flag → "recent N", never fabricated totals).
3. **Your AI team** (new): one row per employee — status (working/paused/needs setup), channels,
   handled this week, outcomes. Links into AI Team detail.
4. **Hot right now** (later, needs scoring): contacts showing buying intent, follow-ups due.
5. **Trends** (exists): volume/outcome charts from `aggregate.ts`.

Implementation: extend `readModel/aggregate.ts` + `PlatformDashboard`; artifact counts from the
`artifacts` view; handoff counts from thread-state. No schema changes for 1–3.

## 7. CRM architecture

**Definition: the CRM is the shared memory of the AI workforce.** Concretely, for v1 it is
three things: a **unified contact record**, a **cross-channel timeline**, and an **AI-written
summary that stays current**. It is explicitly *not* (yet) a records-management suite.

- **Objects, v1:** Contact (person; `contacts` + `contact_identities` — built), Conversation,
  Call, Request (ticket/appointment via `artifacts` view), Note (new, small), Lifecycle stage
  (new column: `lead → qualified → customer → lapsed`), AI summary (new table).
  Leads converge into Contacts (bridge exists via `leads.contact_id`; backfill = R-081).
- **Objects, later:** Company, Deal/Pipeline (kanban + stage tracking), Task (R-113 reserved
  name), Lead score. Deals are deliberately deferred: pipeline value is only trustworthy after
  identity + timeline are solid, and SMB ICP validation should drive whether we need full deal
  objects or just "appointment booked / job won" outcomes.
- **Contacts index:** the Sprint 5.5 page, upgraded with lifecycle filter + channel badges.
- **Contact detail (the flagship page):**
  - *Header:* name/handle(s), channel identities, lifecycle stage, tags, owner (later).
  - *Spine — unified timeline:* every conversation, call, request, note in one reverse-chrono
    stream with channel badges; each entry expands in place or links to the Inbox thread /
    call detail. Sources all exist today (conversations, messages, calls, artifacts).
  - *Right rail:* **AI summary** ("Denku's memory of this person" — 3–6 bullet profile +
    last-interaction recap, with generated-at provenance and a regenerate affordance), upcoming
    appointment, open requests, quick facts (first/last seen, channels, totals).
- **AI summary mechanics (new, small):** `contact_summaries` table (org_id, contact_id,
  summary jsonb, model, generated_at, source_span) — derived data under the
  `docs/MEMORY_CONTRACT.md` rules: erasable, provenance-stamped, regenerated on conversation
  close via a queue-less "summarize on close, best-effort, never-throw" hook in the existing
  pipeline. LLM cost is metered and capped per org (guardrail from day one).

Example journey the timeline must render as one thread: IG DM → contact created → AI qualifies
→ voice call → appointment booked → (email follow-up, when email exists) → deal won (later).

## 8. Inbox architecture

**One surface for every conversation on every channel — voice included.**

- **Layout:** three panes. Left: thread list (filters: channel · open/needs-human/all · date;
  truthful counts; URL-persisted filters — the Sprint 8.5 conversations plumbing). Center: the
  conversation, rendered by the existing per-channel plugin renderer registry (voice renders
  transcript turns + recording player; IG renders DM bubbles — both adapters already
  normalize). Right: **context rail** — contact card (→ CRM), AI summary, lifecycle stage,
  open/linked artifacts (appointment, ticket), and the **handling control**.
- **Human handoff / ownership (generalize what IG just built):** every thread has
  `handling: ai | human` + customer `automation opt-out`. The IG implementation
  (`instagram_thread_states`) becomes the model: at read-cutover this state moves to
  conversation-level columns; the UI control is identical everywhere. "Needs human" is a
  first-class filter and a dashboard alert.
- **AI assistance in the rail (phased):** v1 = per-conversation AI summary + detected intent
  (intent detection exists for voice; IG opts in via `transcriptForIntent`). Later = suggested
  replies — deliberately deferred because replying requires send capability (Meta send
  permission for IG is the same App Review track; voice "reply" is a different concept).
- **What Inbox replaces:** the Calls list (becomes channel=voice filter; call detail page stays
  and is linked), the standalone IG received-messages section (its inbox UI migrates here), and
  the dark Conversations page (renamed/absorbed). Redirect pattern already exists
  (`routeRedirects.ts`).

## 9. AI Team architecture

Primary question: **"Who works for me, and how are they doing?"**

- **Roster page:** one card/row per employee — name, avatar, **status** (working / paused /
  needs setup — derived from workspace pause + channel connection health), channels with
  capability notes ("Instagram: receives, can't reply yet" — `employeeCapabilities.ts` exists),
  this-week outcomes, last activity. Plus a "Hire" affordance listing truthful coming-soon
  roles derived from the channel registry (`comingSoonChannelViews()` — exists).
- **Employee detail — tabs:**
  1. **Overview** — status, channels, outcomes, recent activity.
  2. **Setup** — persona, greeting, behavior, language, prompt override (today's
     Settings → Agents forms move here; R-094 remainder — its own change with tests).
  3. **Knowledge** — business context fields today; shared versioned knowledge later (R-109).
  4. **Channels** — bindings (`employee_channels`) + per-channel capabilities and health.
  5. **Activity** — conversations/calls this employee handled (data plane, filtered).
  6. **History** — **the manifest revision log (R-107), nearly free**: every config change as
     an immutable revision with reason + date; "which revision handled this call" provenance.
     No competitor at our size shows customers this; it is a trust feature.
- **Scaling to 10+ agent types without confusion:** agent *types* are templates (role name,
  default persona, default channel expectations) layered on the one Employee model + channel
  registry — a registry of roles, not new tables or new UI per type. Names like "Voice
  Receptionist / Social Concierge" are template labels, decided later.

## 10. Onboarding architecture

**Frame: "Let's build your AI team." Mechanics: keep the existing DB step machine untouched.**
The 6-step machine, its forward-only writes, the `step >= 6` dashboard gate, dual-path checkout
activation, and resume-from-partial provisioning are hard-won and load-bearing. The redesign
re-narrates and re-skins the wizard, and adds content *within* existing steps — no gating
changes, no new DB steps, no renumbering (and the UI=DB−1 mapping gets centralized in one
module while we're in there).

| Wizard beat (new narrative) | DB step (unchanged) | What changes |
|---|---|---|
| 1. Your business & goal | 1–2 | Merge goal+language beats; add optional website URL field (stored now, import later) |
| 2. Meet your first AI employee | 3 | Reframe "phone intent" as choosing your Voice AI's number; show the employee card being assembled |
| 3. Choose a plan | 4 | Unchanged mechanics; copy speaks to hiring, not minutes |
| 4. Teach it your business | 5 (during activation wait) | **The clever bit:** provisioning takes real seconds-to-minutes; use that wait to collect business-context fields (moved forward from Settings) instead of a spinner. Skippable. |
| 5. First day of work | 6 (Live) | The existing **web test call** becomes the finale: "Call your new employee." Then → dashboard. Skippable. |

Every optional beat is skippable and resumable from a dashboard "Finish setting up" card.
Multi-channel onboarding (connect Instagram during the wizard) arrives only after App Review
approval makes it honest.

## 11. Calendar architecture

Gated on the external dependency (R-020: Google/Microsoft OAuth + verification clocks, weeks).
Until then: Appointments live as a CRM/Requests tab and on contact timelines; the AI continues
to create *appointment requests*. When the integration lands: Calendar becomes a top-level nav
item — month/week view of AI-booked appointments, two-way sync status, per-employee booking
rules (availability windows the AI respects). Do not build a calendar UI before sync exists
(an unsynced calendar is a worse appointments list).

## 12. Automations architecture

**Do not build a workflow engine.** Denku's early moat is *built-in autopilot*, not a builder.
- **Now (implicit, keep):** never-dead-end artifact creation, intent detection, handoff.
- **Next (visible):** an **Autopilot page** — read-only recipe cards stating what Denku
  automates ("Every missed call becomes a ticket", "DMs from new customers create contacts"),
  each with an on/off toggle only where genuinely supported, and honest "always on" labels
  where not. This makes existing invisible value visible at near-zero engineering cost.
- **Later:** follow-up sequences (the first automation customers will pay for), then — only
  with clear demand — a constrained builder (trigger → condition → action over pipeline
  events). The ingest pipeline's injected `runAutomation` stage is already the right seam.

## 13. Settings architecture

Keep the Sprint 8.5 control-center IA (it is weeks old and correct). Changes:
- **AI Employees section** shrinks to a pointer once Setup moves into AI Team detail (R-094).
- **Channels** section becomes the single home for connecting/managing channels (Instagram
  connect card moves here from its standalone page; the standalone page's inbox half moves to
  Inbox).
- **Billing page (R-131)** is explicitly out of scope for this redesign — 1,432-line money
  path; restyle nothing there until it is extracted.
- Zinc re-skin (R-129) happens surface-by-surface as each is touched, not big-bang.

## 14. Contact detail page architecture

Covered in §7; summarized as the spec sheet: header (identity + lifecycle + tags) · unified
timeline spine (all channels, expandable entries) · right rail (AI summary w/ provenance,
upcoming appointment, open requests, quick facts) · actions (note, edit stage; later: task,
deal). Route: `/dashboard/crm/contacts/[contactId]` with lossless redirect from
`/dashboard/leads/[id]` (id-compat already designed into the read model).

## 15. AI employee detail page architecture

Covered in §9; spec sheet: header (name, status, channels, pause/resume honoring workspace
pause rules) · tabs Overview / Setup / Knowledge / Channels / Activity / History (manifest
revisions). Route: `/dashboard/team/[employeeId]`; settings agent pages redirect in.

## 16. Key user journeys

1. **Morning check (owner, 60s):** Home → "2 conversations need you" → Inbox (needs-human
   filter) → read thread + AI summary in rail → take over / mark handled → back to all-clear.
2. **IG lead to booked job:** DM arrives → contact auto-created + timeline starts → AI
   qualifies (intent) → owner sees hot lead on Home → voice callback → appointment artifact →
   timeline shows the whole arc; AI summary now describes the customer.
3. **Missed-call safety net (existing magic, made visible):** after-hours call → AI answers →
   ticket artifact → Home outcome tile + Autopilot recipe card both show it → owner resolves
   from CRM/Requests.
4. **Hiring a second employee:** AI Team → "Hire" → Social Concierge template → connect
   Instagram (Settings → Channels flow) → capabilities honestly labeled receive-only → roster
   shows two workers.
5. **Meta App Review reviewer (near-term critical):** login → connect IG → send DM →
   **Inbox shows the message** → handoff + opt-out controls demonstrate the human-agent story
   → deletion path via privacy page. (The in-flight Phase 0 build is exactly this journey.)

## 17. Data model implications

**No breaking changes anywhere; all additive, RLS-locked, migration-trap rules respected.**
- Already pending: `instagram_thread_states` (in flight); R-081 backfill (`employee_channels`,
  `leads.contact_id`); R-085 read cutover (a read-model source swap, not a migration).
- CRM v1: `contact_summaries` (new); `contacts.lifecycle_stage` (additive column);
  `contact_notes` (new, small). Conversation-level handling state at cutover (columns on
  `conversations`, superseding the IG-specific table via view/backfill).
- Later: `deals` + stages, `tasks`, `companies`, knowledge tables (R-109), automation defs.
- Billing: R-086 (message-based usage dimension) must land before any non-voice channel scales
  — pricing today is minutes-only.

## 18. Routing implications

New: `/dashboard/inbox`, `/dashboard/crm/{contacts,requests}[...]`, `/dashboard/team/[id]`,
`/dashboard/autopilot` (later), `/dashboard/calendar` (later). Legacy routes get the
established treatment: **lists redirect, detail pages stay reachable** (`routeRedirects.ts`
middleware pattern; calls list → Inbox?channel=voice, leads → crm/contacts, instagram →
split Settings-Channels/Inbox, agents settings → team). Nothing 404s.

## 19. Components/systems to reuse (do not rebuild)

Platform read model + aggregation (`lib/platform/readModel/*`) · ingest pipeline + adapters ·
conversation plugin renderer registry · `_platform/ui` primitives (wrap Horizon Card) ·
HorizonShell + nav plumbing (incl. server-resolved flag boolean) · Settings layout-nav pattern
(template for CRM hub) · truthful-counts/filters/URL-state plumbing from Conversations ·
Requests merge · manifest system (History tab) · connection-health + employee-capabilities
derivations · IG inbox + thread-state (becomes the Inbox/handoff seed) · analytics component
suites · web test-call flow (onboarding finale) · checkout/activation machinery untouched.

## 20. Components/surfaces to redesign or retire

Redesign: dashboard home (extend platform variant), calls list (absorbed by Inbox), leads pages
(absorbed by CRM), standalone Instagram page (split), agents settings forms (move into AI Team
Setup), onboarding wizard UI (re-narrate/re-skin; keep actions), zinc-styled pages as touched.
Retire eventually: legacy nav variant + both flags (the end state has one experience).

## 21. Recommended implementation order (phased roadmap)

Ordering principles: keep the app functional after every phase · leaves before hub · flags for
every cutover · **never let this program block the Meta App Review clock**.

- **Phase 0 — App Review surface (in flight, days).** Finish + verify + commit the IG inbox,
  handoff/opt-out, privacy policy rewrite, R-004 security-page honesty. Independent of all
  flags by design. *This is also the seed of the Inbox and the handoff model.*
- **Phase 1 — Flip the foundation (the gate for everything).** Stand up staging (R-031 makes
  the DB reproducible) → flip `PLATFORM_MODEL_ENABLED`, verify dual-write parity → R-081
  backfill → R-085 read cutover → flip `PLATFORM_UX_ENABLED` after a functional-parity audit
  (Sprint 8.5's regression list is the checklist). Exit: customers live on the platform IA.
- **Phase 2 — IA consolidation.** Rename/regroup nav to §5 (Inbox, CRM hub w/ internal nav,
  AI Team, Channels→Settings), redirects, route moves. Mostly renames + one hub layout.
- **Phase 3 — Inbox v1.** Voice + IG in one surface, context rail (contact card + artifacts +
  intent), generalized handling state + needs-human filter, dashboard alert wiring.
- **Phase 4 — CRM v1 (the memory).** Contact detail with unified timeline; lifecycle stages;
  notes; `contact_summaries` + summarize-on-close hook with cost caps; leads convergence UX.
- **Phase 5 — AI Team v1.** Roster + detail tabs; fold agents settings in (R-094); manifest
  History tab; capability/health surfacing.
- **Phase 6 — Home v2.** Outcomes row + AI-team strip + hot-leads placeholder.
- **Phase 7 — Onboarding re-narration.** §10 mapping; test-call finale; knowledge-during-
  activation; "Finish setting up" resume card.
- **Phase 8+ — Expansion (each gated on external reality):** Autopilot page → Pipeline/Deals →
  Tasks → Calendar (R-020) → suggested replies + IG send (post-App-Review approval) →
  WhatsApp/Email channels (registry contract, only after the model is proven live; R-086
  billing first) → scoring → automation sequences.
- **Continuous:** design unification (tokens, zinc-kill R-129) on every touched surface;
  pagination debt; error-message hygiene.

**MVP = Phases 0–7.** Everything in Phase 8+ ships only against demonstrated demand or an
unblocked external dependency.

## 22. MVP vs later-stage features

| MVP (Phases 0–7) | Later (Phase 8+) |
|---|---|
| Unified Inbox (voice+IG), handoff, context rail | Suggested replies, IG send, WhatsApp/Telegram/Email |
| Contact timeline + AI summary + lifecycle | Companies, Deals/pipeline, Tasks, lead scoring |
| AI Team roster + detail + manifest history | Agent templates marketplace, 10+ roles, multi-persona |
| Outcome dashboard | Pipeline value on dashboard, hot-lead scoring |
| Re-narrated onboarding + test-call finale | Website knowledge import, multi-channel onboarding |
| Autopilot visibility page (stretch) | Automation sequences, constrained builder |
| — | Calendar two-way sync (R-020) |

## 23. Risks and technical dependencies

1. **Flag-flip regression** — Sprint 8.5 caught a fabricated-total + missing-filters regression
   pre-flip; a functional-parity checklist is mandatory before `PLATFORM_UX_ENABLED` flips.
2. **Meta App Review clock coupling** — mitigated: Phase 0 is flag-independent and first.
   IG send/suggested replies must not be promised in UI copy before Advanced Access is granted.
3. **Read-cutover parity (R-085)** — dual-write must be verified row-for-row on staging before
   reads move; `ConversationView.source` provenance exists for exactly this audit.
4. **Onboarding gate fragility** — the step machine, forward-only writes, and fail-open
   middleware are load-bearing; the redesign deliberately changes narrative, not mechanics.
5. **Service-role discipline on new tables** — every new table ships RLS-locked; every query
   carries `.eq("org_id", …)`; migration files only, operator applies (no prod DB writes).
6. **Migration traps** — partial-applied history + baseline rules (R-031 doc) — never edit
   historical migrations; additive only.
7. **LLM summary cost** — summaries are a new marginal cost per conversation; cap per org,
   meter from day one, degrade gracefully (timeline works without summaries).
8. **Design-system drift** — four dialects; the fix is incremental tokens-on-touch, not a
   big-bang restyle (R-129), or this program stalls on CSS.
9. **Do-not-touch zones** — billing page (R-131), Vapi webhook auth staging (R-001), billing
   enforcement paths, never-dead-end artifact guarantee.
10. **External clocks** — Meta Business Verification + App Review, Google OAuth verification
    (Calendar), WhatsApp BSP onboarding: all weeks-long; sequence product work so none blocks.
11. **Scope discipline** — the two named traps: building a workflow engine (Phase 8 gate) and
    building channels before the model is proven (registry rule already forbids it).

---

*Approval requested on: (a) the target IA (§5), (b) the CRM definition and deferral of
Deals/Companies (§7), (c) onboarding = re-narration over rebuild (§10), (d) the phase order
(§21), and (e) the four naming decisions: "Inbox", "CRM", "AI Team", "Autopilot".*
