# AI Employees Platform Audit

> **Reframe:** Denku is no longer "a Voice AI product." It is an **AI Employees platform** — a business
> hires AI employees that work across **channels** (Voice, Instagram, WhatsApp, Email; later SMS, Web
> Chat). This audit rethinks the product, IA, data model, and roadmap from that premise, grounded in
> the *actual* codebase and live schema (read-only, project `kebqwsdguxxjsijahrox`).
>
> **Method:** static read of `/docs`, root planning docs, `web/src` (routing, dashboard, onboarding,
> settings, nav) + live DB schema inspection. Author lens: Head of Product + Principal Architect + CEO.
> **Date:** 2026-07-23 · **Status of product at audit time:** Voice sprint (4) code-complete; Instagram
> foundation (Sprint 1.5) is receive-only; every other channel is unbuilt.
>
> **Scope discipline:** this is an architecture/product/UX/roadmap audit. **No speculative UI or code**
> — only planning-doc updates. Findings use `P-###` ids (platform findings), distinct from the
> `R-###` implementation roadmap.

---

## 0. Executive summary

Denku's engineering foundation is strong (security, billing verifiability, notifications, voice
intelligence — Sprints 1–4). But **the product is architected voice-first, and the platform vision it
now aspires to is latent, not realized.** Three facts define the gap:

1. **The "AI Employee" is really a "Vapi voice assistant."** The `agents` table is saturated with
   voice fields (`vapi_assistant_id`, `vapi_phone_number_id`, `voice`, `first_message`, personas). There
   is no channel-agnostic Employee entity.
2. **A generic conversation model already exists but is not the spine.** `conversations(channel,
   external_user_id, agent_id)` + `messages(conversation_id, role, content)` exist *with API routes* —
   yet **voice conversations live in `calls`** and **Instagram events live in raw `instagram_webhook_events`**.
   The shared layer is half-built and unused by the two real channels. This is the single most important
   architectural fact: **the platform's backbone is already sketched; it just isn't adopted.**
3. **Every customer-facing surface is voice-shaped.** Sidebar leads with *Phone Lines* and *Calls*;
   onboarding step 2 is *Phone Intent*; Instagram is a bolted-on 2nd nav item with no conversation or
   artifact integration. Adding WhatsApp/Email this way would multiply the bolt-ons.

**The good news:** this is an evolution, not a rewrite. The Employee/Channel/Conversation/Contact
abstractions can be introduced *incrementally* on top of what exists, with the existing voice stack
becoming "the Voice channel adapter." **The risk** is doing 4 more channel bolt-ons before the shared
model exists — each one hardens the voice-first debt.

**Headline recommendation:** **Yes, run Sprint 4.5 — but scope it as the *platform-model foundation*,
not a UI redesign.** Introduce the Employee + Channel + Conversation + Contact abstractions (adopting
the existing `conversations`/`messages` tables), retrofit Voice and Instagram onto them behind a
compatibility layer, and reskin IA around "AI Employees / Conversations / Contacts." Defer WhatsApp/Email
*channels* until the model is proven with the two channels that already exist.

---

## 1. Product vision — what changes

| Dimension | Voice product (today) | AI Employees platform (target) |
|---|---|---|
| Core noun | "Voice agent" / "AI line" | **AI Employee** (a hire that works across channels) |
| Unit of work | A **call** | A **conversation** (voice call, IG thread, WhatsApp chat, email thread) |
| Who it serves | Inbound phone callers | **Contacts** reachable on any channel |
| Setup | Buy a phone number | **Hire an Employee**, then **connect channels** to it |
| Output | Ticket / appointment / lead | Same artifacts, now channel-agnostic, attributed to a conversation |
| Pricing | Minutes + numbers + concurrency | Per-Employee + per-channel usage (minutes for voice, messages for chat) |
| Marketing | "AI that answers your phone" | "Hire an AI workforce" |

**What genuinely changes:** the mental model ("hire an employee, give it channels" vs "buy a phone
line"), the primary objects (Employee, Conversation, Contact, Channel), and the extensibility contract
(a new channel = a new adapter, not a new product surface). **What does NOT change:** the artifact
guarantee (never dead-end → ticket/appointment), idempotency-first, billing enforcement, per-tenant
isolation — these are channel-agnostic and are the platform's real moat.

## 2. Information architecture

**Today (voice-first sidebar):** Dashboard · Phone Lines · Instagram · Calls · Tickets · Appointments ·
Usage · Analytics · Settings. Two channels appear as peers (*Phone Lines*, *Instagram*); the unit of
work is *Calls*; there is no "Conversations" or "Contacts" or "Employees" concept.

**Target IA (platform):**

- **Dashboard** — cross-channel overview (conversations handled, artifacts created, by channel/employee).
- **AI Employees** — the roster (each Employee: which channels it's connected to, its brain/persona,
  status). Replaces "Phone Lines" + the two agent trees.
- **Conversations** — unified inbox across Voice/IG/WhatsApp/Email (replaces "Calls" as the primary
  list; a call is one conversation type). Filter by channel/employee/status.
- **Contacts** — people the business talks to, with per-channel identities (phone, IG handle, email).
  Generalizes "Leads".
- **Channels** — connect/configure/monitor each channel (phone numbers, IG account, WhatsApp number,
  mailbox). Absorbs "Phone Lines" + "Instagram" as *channel connections*, not top-level peers.
- **Tickets / Appointments** — stay (channel-agnostic artifacts), now reachable from any conversation.
- **Analytics** — cross-channel funnels + per-employee/per-channel performance.
- **Billing / Settings** — per-Employee + per-channel usage; settings reorganized around Employees & Channels.

**Nav finding (P-001, High):** the sidebar hardcodes voice primacy (`nav.tsx`). Target order:
Dashboard · **Employees** · **Conversations** · **Contacts** · **Channels** · Tickets · Appointments ·
Analytics · Billing · Settings. *Calls, Phone Lines, Instagram* collapse into Conversations/Channels.

## 3. Dashboard redesign

Today the dashboard is call-metric-shaped (Est. Savings, Total Calls, Answer Rate, Active AI lines).
Target: **channel-aware, employee-aware**. Minimum: a channel breakdown (conversations handled by
Voice/IG/…), an Employee roster strip, artifacts created cross-channel, and the existing honesty
(R-018) preserved. **Do not rebuild yet** — this rides the Sprint-4.5 model + a later UI sprint. The
data for it (conversations.channel, per-employee) only becomes real once the shared model is adopted
(§6), so **model before dashboard**.

## 4. Onboarding redesign

Today: Workspace → Goal → **Phone Intent** → Plan → Activating → Live (voice-assumed; the "Phone
Intent" step and provisioning a US number are load-bearing). This is where R-013's business-context
capture was deliberately deferred (Sprint 4).

Target onboarding: **Create workspace → Hire your first AI Employee → give it business context (R-013)
→ connect a channel (start with Voice or Instagram) → go live.** The channel step becomes *pluggable*
(pick Voice/IG/… ), not "buy a phone number." **Finding (P-002, High):** the onboarding step machine
is voice-coupled and fragile (DB step gating; UI = DB−1). The platform onboarding is a genuine
redesign — it belongs to Sprint 4.5's scope decision, sequenced *after* the Employee/Channel model so
"connect a channel" has something to connect to.

## 5. Settings redesign

Today settings are agent/voice/workspace-shaped and split across `settings/agents` (two trees,
R-063) + `settings/workspace/*` + a stub `settings/notifications`. Target: **per-Employee settings**
(brain/persona/business-context/voice — the R-013/R-051 surfaces already there) + **per-Channel
settings** (Voice: numbers/caps; Instagram: connection/scopes; future: WhatsApp/Email creds) +
workspace/billing. **Finding (P-003, Medium):** consolidate the two agent trees (R-063) into "Employee
settings" during this reframe rather than separately.

## 6. Shared data model (the core of the audit)

**What exists (live schema):**
- `agents` — the Employee, but voice-saturated (`vapi_assistant_id`, `vapi_phone_number_id`, `voice`,
  `first_message`, `router_persona_key`, `default_persona_key`, `effective_system_prompt`).
- `phone_lines` — the Voice channel binding (number ↔ agent).
- `calls` — the Voice conversation record (transcript, cost, duration, vapi ids).
- `conversations(id, org_id, agent_id, channel, external_user_id, last_activity_at)` — **generic,
  channel-aware, present, with API routes** (`api/conversations/*`, `getAvgResponseTime`).
- `messages(id, org_id, conversation_id, role, content, created_at)` — **generic message store, present.**
- `instagram_connections` (channel #2 creds) + `instagram_webhook_events` (raw IG events, NOT mapped
  to conversations/messages).
- `leads` (phone/email/source — a proto-Contact), `tickets`/`appointments` (artifacts, `call_id`-coupled).

**Target abstractions:**
- **Employee** = `agents` generalized: strip the voice-specific columns into a per-channel binding;
  keep brain (prompt/persona/business_context) channel-agnostic. Introduce `employee_channels`
  (employee ↔ channel ↔ channel-specific config: phone number, IG connection, WhatsApp number, mailbox).
- **Channel** = an enum + per-channel connection tables (`phone_lines`, `instagram_connections`, future
  `whatsapp_connections`, `email_mailboxes`) unified behind an `employee_channels` mapping.
- **Shared Conversation** = **adopt `conversations` + `messages` as the canonical layer for ALL
  channels.** Voice: a call *is* a conversation (`channel='voice'`), its turns become `messages` (or
  `calls` becomes a voice-specific detail row linked to a `conversation`). Instagram: each IG thread →
  a conversation; each DM → a message. This is the keystone: **one inbox, one model, N channels.**
- **Shared Contacts** = `leads` generalized to `contacts` with per-channel identities
  (`contact_identities(contact_id, channel, external_id)` — phone, IG user id, email). A conversation
  belongs to a contact.
- **Shared Automations** = the artifact/guardrail logic (ticket/appointment creation, never-dead-end,
  intent detection) generalized to run on a **conversation** regardless of channel, not just on a `call`.

**Finding (P-004, Critical for the platform):** the shared conversation/contact model is ~40% present
(schema + some API) but **not adopted by the two live channels.** The platform stands or falls on
adopting it. Everything else (IA, dashboard, onboarding) is a projection of this model.

## 7. Database implications

- **Adopt `conversations`/`messages` as canonical.** Backfill/adapt Voice (`calls` → linked
  conversation; transcript turns → messages, or keep `calls` as a voice-detail table 1:1 with a
  conversation) and Instagram (`instagram_webhook_events` → conversation+messages via a processor).
- **`employee_channels`** join table (employee ↔ channel ↔ config) — the extensibility seam.
- **`contacts` + `contact_identities`** (generalize `leads`); repoint `tickets`/`appointments` to
  `conversation_id` (keep `call_id` during migration).
- **RLS:** every new table gets RLS-locked from day one (the Instagram tables already model this; the
  billing/service-role tables were just fixed in R-060). Do **not** repeat the RLS-disabled debt.
- **Schema baseline (R-031)** should land alongside — the platform model is the moment to version the
  base schema, not just the billing views (R-075 done).
- **Billing implications:** usage becomes multi-dimensional (voice minutes + chat messages). The
  baselined billing math (R-075) is voice-minute-only; it will need a message-usage dimension.

## 8. API implications

- **Channel-adapter contract:** each channel implements a common inbound interface: *receive event →
  verify → resolve org+contact+conversation → append message → run automations (artifacts/intent) →
  optional reply*. The Vapi webhook and the Instagram webhook are two instances; today they share
  nothing. Extract a shared `ingestInboundMessage(channel, event)` pipeline.
- **Outbound/reply contract** (future): a common `sendMessage(conversation, content)` dispatched to the
  channel adapter (Voice = TTS/next-turn, IG/WhatsApp/Email = provider send). Instagram is receive-only
  today; reply is a future epic — the contract should anticipate it.
- **Internal self-calls** (`webhook → /api/tools`, `purchase → /api/billing/addons`) remain a landmine
  (CLAUDE.md #7) — the shared pipeline should be a function call, not HTTP.
- **Naming:** `/api/phone-lines/*`, `/api/webhooks/vapi`, `/api/webhooks/instagram` stay (channel
  adapters), but artifact/conversation APIs should be channel-agnostic (`/api/conversations/*` already
  exists — make it the canonical surface).

## 9. Routing implications

- New route groups: `/dashboard/employees`, `/dashboard/conversations`, `/dashboard/contacts`,
  `/dashboard/channels`. `/calls` → a filtered view of `/conversations?channel=voice`; `/phone-lines`
  and `/instagram` → sub-views under `/channels`. Keep old routes as redirects during migration (don't
  break bookmarks / customer muscle memory).
- The dashboard `error.tsx`/`loading.tsx` skeletons and the `PausedBanner` (Sprints 3–4) already live
  at the dashboard-layout level and will carry over.

## 10. Component architecture

- Introduce channel-agnostic primitives: `<ConversationList>`, `<ConversationThread>` (renders voice
  transcript OR chat messages via a channel renderer), `<EmployeeCard>`, `<ChannelConnectionCard>`
  (the Instagram card `InstagramConnectionCard` is the template — generalize it).
- Reuse the Sprint-2/3 primitives (`Skeleton`, `ToastProvider`, error boundary, `safeErrorMessage`).
- Keep the Horizon dashboard system (design-system rule); the shadcn settings split (R-064) should be
  reconciled during the settings reframe.

## 11. Naming consistency

**Finding (P-005, High):** ~24 dashboard `.tsx` files reference "agent"; nav says "Phone Lines/Calls";
the DB says `agents`/`calls`. Target customer-facing noun hierarchy:
- **AI Employee** (the hire) — replaces "agent"/"AI line" everywhere customer-facing (the "AI not
  agent" rule, R-065, was step 1; this extends it to "AI Employee").
- **Conversation** — replaces "call" as the generic unit ("Calls" becomes "Voice conversations").
- **Contact** — replaces "lead".
- **Channel** — the connection type (Voice/Instagram/WhatsApp/Email).
- Code identifiers (`agents`, `calls`, `agent_id`) can migrate gradually behind the customer-facing
  rename (same discipline as R-065). Document the canonical vocabulary in `skills/design-system.md`.

## 12. UX consistency

- One conversation experience across channels (thread view), one Employee experience, one Channel-
  connect experience (the IG connect flow is the pattern). Today Voice and Instagram feel like two
  products; the platform must feel like one.
- The design-system split (Horizon vs shadcn settings, R-064) undermines the "one product" feel and
  should be resolved as part of the reskin.

## 13. Future extensibility

**How easily do WhatsApp/Email/SMS/Web-Chat plug in *today*?** Poorly — each would be a new bolt-on
(new nav item, new raw-events table, no shared conversation/contact/artifact path), exactly as
Instagram is. **After Sprint 4.5's model**, a new channel = (1) a connection table + creds, (2) a
webhook adapter implementing `ingestInboundMessage`, (3) registration in `employee_channels`, (4) an
optional reply adapter. IA/dashboard/analytics/billing then pick it up for free. **This is the whole
point of the reframe:** turn N-channel work from O(N) product surfaces into O(1) adapter + config.

## 14. Technical debt from the voice-first architecture

- **P-004 (Critical):** shared conversation/contact model exists but unadopted; two channels diverge.
- **`agents` voice-saturation** — Employee ≠ voice assistant; the coupling blocks multi-channel.
- **Artifacts are `call_id`-coupled** (`tickets.call_id`, `appointments.call_id`) — must generalize to
  `conversation_id`.
- **Instagram is receive-only + raw** — not integrated into conversations/artifacts (R-078/R-079 open).
- **Onboarding + IA + nav hardcode voice** (P-001/P-002).
- **Billing math is voice-minute-only** (R-075) — needs a message dimension.
- **Two org-creation paths, `organizations_legacy` dual-writes** (CLAUDE.md #4, R-036) — a platform
  data-model change is the time to finish this.
- **Base schema unversioned** (R-031) — baseline it with the platform model.

## 15. Migration strategy (evolve without breaking customers)

1. **Additive, adapter-first.** Introduce Employee/Channel/Conversation/Contact as *additive* schema +
   a compatibility layer; the voice stack (`agents`/`phone_lines`/`calls`) keeps working, now exposed
   *as* the Voice channel adapter.
2. **Dual-write then cut over.** New conversations/messages written alongside `calls` (and IG events
   mapped in) before any read cutover — same discipline as the `orgs`/`organizations_legacy` migration
   should have used.
3. **Read compatibility.** `/calls` stays as a filtered conversations view; old routes redirect. No
   bookmark/muscle-memory breakage.
4. **Staged flags.** New IA/dashboard behind a flag until proven (the project's established
   stage-then-enforce pattern).
5. **No prod mutations blind.** Migrations are files + the operator runbook; RLS-locked from day one;
   verify on a staging/preview env (the P1 gap from Sprint 3 — a staging env is now doubly needed).

## 16. Roadmap changes (reprioritization)

The platform reframe **reorders** the roadmap without invalidating the security/verifiability work:

- **New P0 (platform foundation):** the Employee/Channel/Conversation/Contact model + adopting
  `conversations`/`messages` for Voice & Instagram (Sprint 4.5). This becomes the trunk everything hangs
  off.
- **Elevated by the reframe:** R-063 (consolidate agent trees → Employee settings), R-031 (schema
  baseline — do it with the model), R-036 (finish orgs/legacy — do it with the model), R-078/R-079
  (Instagram debt — resolve as IG becomes a real channel).
- **Recontextualized:** R-066 (analytics) becomes *cross-channel* funnel analytics — still P2, still
  "measure before optimize," now bigger. R-004 (marketing truth-pass) must also reflect the platform
  claim honestly (don't claim WhatsApp/Email before they ship).
- **Unchanged priority:** the staging-blocked security items (R-057, R-060 remainder) — the platform
  model *increases* the need for a staging env.
- **Deferred:** voice-only depth (R-020 calendar, R-054 hours, R-014 go-live) until after the model, so
  they're built channel-aware.

## 17. Sprint recommendations — should Sprint 4.5 exist, and what's in it

**Yes — Sprint 4.5 should exist, and it should be the *platform-model foundation*, NOT a UI redesign.**
Rationale: doing IA/dashboard/onboarding redesign before the shared model exists would be painting a
facade over voice-first plumbing; and adding WhatsApp/Email channels before the model would triple the
bolt-on debt. Build the trunk first.

**Recommended Sprint 4.5 scope (foundation, mostly backend + one thin UI proof):**
1. **Employee abstraction** — introduce the channel-agnostic Employee (generalize `agents`; add
   `employee_channels`), with the voice stack retrofit as the Voice channel binding (additive, non-breaking).
2. **Adopt `conversations`/`messages` as canonical** — map **Instagram** events into conversations/messages
   (turns IG from receive-only-raw into a real channel in the shared model — highest-leverage proof),
   and link **Voice** `calls` to a conversation (dual-write, no read cutover yet).
3. **Contacts** — generalize `leads` → `contacts` + `contact_identities` (additive), repoint new
   artifacts to `conversation_id` while keeping `call_id`.
4. **Shared inbound pipeline** — extract `ingestInboundMessage(channel, event)` so the Vapi and
   Instagram webhooks share the automation path (artifacts/intent run on a *conversation*).
5. **One thin UI proof** — a channel-agnostic **Conversations** list (voice + IG in one inbox) behind a
   flag, to validate the model end-to-end. **No full dashboard/onboarding redesign yet.**
6. **Naming + docs** — flip the canonical vocabulary (Employee/Conversation/Contact/Channel) in the
   design-system skill + planning docs; the customer-facing UI rename is a *later* sprint.

**Explicitly NOT in Sprint 4.5:** WhatsApp/Email *channels* (build after the model is proven with the 2
existing channels), the full dashboard/onboarding/settings redesign (a dedicated UX sprint once the
model is real), Instagram *reply/AI* (a channel-feature epic).

**Prerequisites/blockers for 4.5:** a **staging/preview env** (the model migration + RLS + adapter
cutover can't be verified under read-only prod — this is now the critical unblock); the Sprint-3
operator activation should also be completed so the foundation is on solid, live ground.

---

## Findings register (platform)

| id | Sev | Finding | Where |
|---|---|---|---|
| **P-004** | Critical | Shared conversation/contact model exists (`conversations`/`messages`) but is unadopted by both live channels (voice=`calls`, IG=raw events) | §6/§7 |
| **P-001** | High | IA/navigation hardcodes voice primacy; channels are bolt-ons | §2, `nav.tsx` |
| **P-002** | High | Onboarding step machine is voice-coupled ("Phone Intent"); platform needs Employee→Channel onboarding | §4 |
| **P-005** | High | Naming is voice-shaped ("agent"/"call"/"lead"); needs Employee/Conversation/Contact/Channel | §11 |
| **P-006** | High | `agents` is voice-saturated; no channel-agnostic Employee entity | §6/§14 |
| **P-007** | High | Artifacts (`tickets`/`appointments`) are `call_id`-coupled; must generalize to `conversation_id` | §7/§14 |
| **P-003** | Medium | Two agent settings trees (R-063) + Horizon/shadcn split (R-064) undercut "one product" | §5/§12 |
| **P-008** | Medium | Billing math is voice-minute-only (R-075); needs a message-usage dimension | §7/§16 |
| **P-009** | Medium | Instagram integrated as a silo (receive-only, raw), not a channel in the shared model (R-078/R-079) | §6/§14 |
| **P-010** | Medium | Base schema unversioned (R-031) + orgs/legacy dual-write (R-036) — resolve with the model | §7/§14 |

### Platform-experience-depth findings (filed 2026-07-24, post-Sprint-5; see `docs/SPRINT_5.5_PROPOSAL.md`)

| id | Sev | Finding | Roadmap |
|---|---|---|---|
| **P-011** | High | Dashboard home is call/answer-rate/agent-table shaped, not channel/employee-aware | R-090 |
| **P-012** | High | Analytics is voice-only (calls+tickets+by-agent); no channel/conversation/per-employee dimension | R-091 |
| **P-013** | Medium | Three overlapping "agent" surfaces (`/dashboard/agents`, `settings/agents`, `employees`) + voice-shaped copy | R-092 |
| **P-014** | High | Contacts is a placeholder; `contacts`/`contact_identities` (4.5) unused by UI | R-093 |
| **P-015** | Medium | Settings organized by resource type, not by the platform model (per-Employee/per-Channel) | R-094 |
| **P-016** | Medium | UX split: `_platform` surfaces hand-rolled vs Horizon components — two visual languages in one shell | R-096 |
| **P-017** | Low | Nav polish gaps: topbar titles for new routes, active/empty states, "coming soon" consistency | R-097 |

(P-002 onboarding reframe → R-095; the platform-experience skeleton P-001/P-003/P-005 were addressed in Sprint 5.)

## Recommended implementation phases

- **Phase 0 (unblock):** provision a staging/preview env; complete Sprint-3 operator activation. *(No new code; gates everything.)*
- **Phase 1 — Model foundation (Sprint 4.5):** Employee + Channel + Conversation + Contact abstractions; adopt `conversations`/`messages`; map Instagram in; link Voice; shared inbound pipeline; thin Conversations-inbox proof (flagged). Additive, non-breaking. Baseline schema (R-031) + finish orgs/legacy (R-036) alongside.
- **Phase 2 — Platform UX:** dashboard + onboarding + settings + nav redesign around Employees/Conversations/Contacts/Channels; naming cutover; resolve R-063/R-064. Cross-channel analytics (R-066).
- **Phase 3 — New channels:** WhatsApp, then Email (each = adapter + connection + config, riding the model). Instagram reply/AI epic. Multi-dimensional billing (P-008).
- **Phase 4 — Depth:** channel-aware voice depth (calendar R-020, hours R-054), automations, workflows.

## Risks

- **Big-bang temptation** — redesigning UI before the model = facade over debt. Mitigation: model-first, additive, flagged.
- **No staging env** — migrating the data model + RLS + adapter cutover blind on prod is unsafe (the Sprint-3 P1 blocker, now critical). Mitigation: staging is a hard prerequisite for Phase 1.
- **Marketing over-claim** — announcing "WhatsApp/Email employees" before they ship repeats R-004. Mitigation: honest "channels shipping" messaging.
- **Customer disruption** — renaming/rerouting mid-flight. Mitigation: redirects, dual-write, compatibility reads, staged flags.
- **Scope creep in 4.5** — trying to ship UI + channels + model at once. Mitigation: 4.5 = model only.

## Recommended Sprint 4.5 scope (one-paragraph brief)

**Sprint 4.5 — "Platform Foundation":** introduce the channel-agnostic **Employee**, **Channel**
(`employee_channels`), **Conversation** (adopt `conversations`/`messages`), and **Contact**
(`contacts`/`contact_identities`) abstractions as *additive, non-breaking* schema; retrofit **Voice**
(link `calls` → conversation, dual-write) and **Instagram** (map events → conversation/messages) onto
the shared model; extract a shared `ingestInboundMessage(channel, event)` automation pipeline so
artifacts/intent run on conversations regardless of channel; ship **one flagged Conversations-inbox
UI** as end-to-end proof; and flip the canonical vocabulary in the design-system + planning docs. **No**
full UI redesign, **no** WhatsApp/Email channels, **no** Instagram reply yet. **Prerequisite:** a
staging/preview env.

---

*Companion to `docs/PROJECT_VISION.md` (updated for the platform direction) and the roadmap
reprioritization. This audit is the canonical reference for the AI-Employees-platform evolution.*
