# Channel-Readiness Audit — is Denku actually ready for new channels?

> **Question asked:** can a new channel (WhatsApp, Email, Telegram, SMS, Web Chat) be added as
> *mostly backend/API work*, without redesigning the product?
> **Answer: No — but the gap is much smaller and differently-shaped than it looks.**
> Audited 2026-07-24 against the live code after Sprints 4.5 / 5 / 5.5 / 6. Findings are `C-###`
> (channel-readiness), mapped to roadmap `R-###`.

## 0. The test I applied

Not "do we have channel pages?" (we do) but: **"list every file a developer must edit to add
WhatsApp."** Anything beyond (a) a registry entry, (b) a connection table, (c) an adapter, (d) an
OAuth/credentials route is a *product-design* leak into what should be backend work.

**Result — adding WhatsApp today requires editing ~6 files, 4 of them UI/presentation:**

| # | File | Edit required | Should be? |
|---|---|---|---|
| 1 | `lib/platform/channels.ts` | registry entry | ✅ legitimate |
| 2 | `lib/platform/adapters/{whatsapp,registry}.ts` | adapter + register | ✅ legitimate (backend) |
| 3 | migration + OAuth route | connection table + creds | ✅ legitimate (backend) |
| 4 | `readModel/channels.ts` | **new mapper + new query in `listConnectedChannelViews` + remove from `comingSoonChannelViews` order** | ❌ leak |
| 5 | `_platform/ChannelBadge.tsx` | **ICONS + LABELS entries** | ❌ leak (and duplicates the registry label) |
| 6 | `dashboard/conversations/page.tsx` | **hardcoded filter array `[All, Voice, Instagram]`** | ❌ leak |

So the honest verdict: **Sprint 5/5.5 built the right surfaces, but wired them per-channel.** The
platform *looks* channel-agnostic and is channel-agnostic in its **data model** (conversations,
contacts, artifacts, ingest pipeline — genuinely good), while its **presentation layer is hardcoded**.

## 1. Do I agree this should be the next sprint? (challenged, then endorsed — with a reshape)

**The case against doing it now:** Denku has **zero paying customers** and is **not activated** (webhook
still observe-only, migrations unapplied, no staging). Sprint 6 argued — correctly — that shipping more
scaffolding before validating with one real customer is negative leverage. Designing abstractions for
channels that don't exist is textbook speculative generality; you learn what an adapter needs by
building the *second* one, not by imagining the third.

**Why I nonetheless agree it's right, now:**
1. **It doesn't compete with the launch.** The launch is blocked on *operator* work (staging env,
   flag flips) that engineering cannot do. Engineering capacity is genuinely idle w.r.t. launch.
2. **We are not generalizing from zero.** Voice and Instagram are two *real*, structurally different
   channels (telephony/session vs. OAuth/threaded chat). That's the minimum credible basis for
   abstraction — and it's exactly where the current hardcoding hurts.
3. **The owner's stated constraint is time-shape:** work resumes later, and channel work should then be
   backend-only. Removing the presentation leaks is precisely what buys that.

**Where I disagree with the proposed shape — and what I propose instead.** The request lists a lot of
*new* surfaces to build ("channel pages, connection pages, dashboards, analytics, UI states…"). But the
blocker is **not missing pages — the pages exist.** Building more UI would add surface area without
removing a single per-channel edit. The highest-leverage work is the opposite:

> **Make the existing surfaces registry-driven, and enrich the registry with the capability +
> lifecycle model the UI needs to render any channel generically.**

That is less code, less risk, and achieves the stated goal *better*. Concretely: instead of writing a
WhatsApp page, make the Channels page render **any** registry channel; instead of a Telegram filter,
derive filters from the registry. Then adding a channel is: registry entry + adapter + connection
table + creds route — **backend only, zero UI edits** — enforced by a contract test.

## 2. Findings

### C-001 (High) — Channel presentation is hardcoded, not registry-driven
`listConnectedChannelViews` hardcodes one query + mapper per channel; `comingSoonChannelViews` hardcodes
`["whatsapp","email","sms"]`; the Conversations filter hardcodes three entries; `ChannelBadge` hardcodes
ICONS/LABELS. **Adding a channel means editing UI.** → *Registry-driven rendering + a connection-source
descriptor per channel.* (roadmap **R-099**)

### C-002 (High) — No channel **capability model**
The registry knows `kind | productionReady | adopted` — nothing about what a channel can *do*:
inbound-only vs. bidirectional, how it connects (OAuth / API credentials / provisioned number),
attachments, group vs. 1:1, session vs. persistent thread. Every UI decision that *should* be
data-driven ("show a Connect button", "show a Reply box", "show minutes vs. messages") therefore has to
be hardcoded per channel. **This is the single most important missing abstraction.** (**R-100**)

### C-003 (High) — No connection **lifecycle / health model**
`ChannelStatus` is `connected | coming_soon | disconnected`. Real channels have: `not_configured →
connecting → connected → degraded (token expiring) → error (revoked/failed) → disconnected`. The data
already exists in the DB and is thrown away: `instagram_connections.token_expires_at`, `.last_error`,
`.status`, `.scopes`. **A paying customer whose IG token silently expired gets no signal** — and every
future OAuth channel has the same failure mode. (**R-101**)

### C-004 (Medium) — Telegram absent; channel vocabulary incomplete
The vision names **Telegram**; it exists nowhere in the registry or docs. `web` (Web Chat) is in the
registry but excluded from the coming-soon list, so it's invisible. The set of channels the product
*claims* to be heading toward isn't represented in the one place that should define it. (**R-102**)

### C-005 (Medium) — Duplicate sources of truth for channel labels
`ChannelBadge.LABELS` duplicates `CHANNELS[x].label`. Two places to edit, guaranteed drift. Same class
of bug as the pre-4.5 `agents`/`calls` duplication. (folded into **R-099**)

### C-006 (Medium) — No connection-flow scaffold
The only real connect flow is `InstagramConnectionCard` on the **legacy** `/dashboard/instagram` page —
bespoke, not reusable, not reachable from the platform Channels surface (which only links "Manage").
Every new channel would hand-roll its own connect UI. (**R-103**)

### C-007 (Medium) — Employee ↔ channel **capability/permission** model missing
`EmployeeView.channels` says *which* channels an employee owns, never *what it may do* on them (answer
only? reply? book? escalate?). Multi-channel employees need per-channel capability/permission, and
billing/limits will need it too. (**R-104**)

### C-008 (Medium) — Knowledge is voice-prompt-shaped, not channel-agnostic
`agents.business_context` (Sprint 4) is injected into a **voice system prompt**. There is no
channel-agnostic *knowledge* concept an email/chat employee would share. Not previously filed anywhere.
(**R-105**)

### C-009 (Low) — Automations exist as a pipeline hook, not a product surface
`ingestInboundMessage`'s `runAutomation` is a code seam with no user-facing concept ("when X on any
channel → do Y"). Fine for now; flag so it isn't reinvented per channel. (**R-106**)

### Already-filed, re-confirmed as voice-first (not re-filed)
Onboarding "Phone Intent" (**R-095**), settings organized by resource not by Employee/Channel
(**R-094**), Horizon vs `_platform` visual split (**R-096**), nav polish (**R-097**), voice-minute-only
billing (**R-086**), read cutover (**R-085**), backfill (**R-081**).

## 3. What is genuinely ready (don't rebuild it)

Credit where due — the 4.5/5/5.5 foundation holds up:
- **Data model:** `conversations`/`messages`/`contacts`/`contact_identities`/`employee_channels` +
  `artifacts` are truly channel-agnostic. A new channel needs **no core schema change**.
- **Ingest pipeline:** `ingestInboundMessage` (Contact→Conversation→Message→Intent→Automation) with a
  pure `ChannelAdapter` contract — a new channel is one `normalizeInbound`.
- **Read model:** conversations/contacts/aggregates are channel-parameterized already.
- **Thread rendering:** the plugin renderer registry with a default fallback is exactly right — a new
  channel renders sensibly with *zero* renderer code.
- **Honesty discipline:** `productionReady` + "coming soon" affordances already prevent over-claiming.

## 4. Recommended sprint shape (Sprint 7 — "Channel Readiness")

**Principle: remove per-channel edits; don't add per-channel surfaces.** All additive, flag-gated,
truthful (nothing pretends to work).

- **A. Enrich the channel model** (C-002/C-003/C-004): capabilities (`direction`, `connection` method,
  `supports`), lifecycle states, Telegram + Web Chat added, all `productionReady:false`.
- **B. Registry-driven presentation** (C-001/C-005): one connection-source descriptor per channel;
  `listChannelViews` iterates the registry; Conversations filters, ChannelBadge icons/labels derive
  from it. Single source of truth.
- **C. Connection lifecycle + health** (C-003/C-006): surface real status/expiry/error on the Channels
  surface; a **generic** connect/disconnect scaffold the IG flow plugs into.
- **D. Contract test** (the guardrail): a test asserting *every* registry channel renders — icon,
  label, filter, channel view — so a future channel added to the registry **cannot** silently require
  a UI edit. This is what makes the goal durable rather than aspirational.
- **E. Employee capability model** (C-007) — per-channel capabilities on `EmployeeView`.
- **Deliberately out:** WhatsApp/Email/Telegram integrations; onboarding + settings restructure
  (R-094/R-095 — bigger, and better once channels are real); knowledge model (R-105) and automations
  surface (R-106) — filed, not built.

**Success criterion (testable):** adding a channel = registry entry + adapter + connection table +
creds route. **Zero UI file edits.** Enforced by (D).

## 5. Risks

- **Speculative generality** — mitigated by generalizing only from voice + IG (two real, structurally
  different channels) and by preferring registry-driven rendering over new abstraction layers.
- **Scope creep into a redesign** — onboarding/settings restructure explicitly deferred.
- **Regression on live surfaces** — everything additive + `PLATFORM_UX_ENABLED`-gated; voice untouched.
- **Over-claiming** — `productionReady:false` for every unbuilt channel; coming-soon/disabled states only.
