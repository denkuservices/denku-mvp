# Sprint 5 Review & Retrospective — Platform Experience

- **Sprint:** 5 (core P0–P3) · **Window:** 2026-07-24 · **Status:** **code-complete; operator
  flag-flip pending**
- **Goal (verbatim):** Turn the Voice-first product experience into an AI Employees platform
  experience using the Sprint 4.5 foundation — behind `PLATFORM_UX_ENABLED`, additive, zero
  regression, WhatsApp/Email not built but able to appear naturally.
- **One-line verdict:** **The AI Employees IA is built and dark-launchable.** A business now sees
  Employees who own Channels, a unified Conversations inbox (voice + Instagram) with a plugin thread
  renderer, and a Channels inventory that shows WhatsApp/Email as "coming soon" — all reading the P0
  read model, with the current dashboard byte-for-byte unchanged until the flag flips. **6 commits,
  193 tests green, build green.**

---

## 1. What shipped (P0–P3)

| Phase | Delivered |
|---|---|
| **P0** | `PLATFORM_UX_ENABLED` flag + **Platform Read Model** (`lib/platform/readModel/*`): Conversation/Employee/Channel views over legacy tables, decoupled from the dual-write flag; Employee-centric; channel-tagged for the plugin renderer. |
| **P1** | Platform nav (server-resolved `platformUx` boolean → shell) + Employees/Conversations/Channels/Contacts route pages consuming the read model + middleware legacy redirects. New routes 404 when flag OFF. |
| **P2** | Unified **Conversations** inbox + detail with a **plugin per-channel renderer registry** (`registerRenderer`/`getRenderer`); voice + IG registered; core `<ConversationThread>` never changes to add a channel. |
| **P3** | **AI Employee detail** (owns channels, recent conversations, "Configure" → existing agent settings) + **Channels** inventory (Phone Lines + Instagram collapsed, "Manage" link-throughs, WhatsApp/Email/SMS "coming soon"). |

## 2. Design invariants honored (owner requirements)

1. **Employees own Channels.** `EmployeeView.channels` is the ownership edge everywhere — the roster,
   the detail page, the read model. Ownership is derived from real bindings
   (`phone_lines.assigned_agent_id`), never invented; it upgrades to `employee_channels` post-backfill.
2. **Plugin conversation renderer from day one.** The thread dispatches by `turn.channel` through a
   registry. A future channel (WhatsApp/Email/SMS/WebChat) adds a renderer with `registerRenderer(...)`
   and **zero change to the core thread**. Proven by test (custom renderer registers; core untouched).

## 3. Architecture decisions (validated / refined during build)

- **Read Model decouples UI from storage (P0 cornerstone).** Surfaces show real data regardless of
  `PLATFORM_MODEL_ENABLED` or backfill; at read-cutover (R-085) sources swap with no UI change.
- **Boolean, not JSX, crosses the server/client boundary** for nav selection — the shell stays a
  client component; the flag is resolved server-side in the layout.
- **Capability-preserving redirects (refined in P3).** A blanket "collapse everything into the new
  routes" would have *lost* real capability — phone-number purchase, IG connect, the leads list, and
  the rich call detail (recording/cost). Instead: redirect only the fully-replaced **calls list**;
  keep detail/management pages reachable and **link through** to them from the new surfaces. The
  flag-ON experience loses nothing. (This is a better design than the original plan's blanket
  redirect — surfaced by asking "what breaks if I redirect this?")
- **No duplicated business logic.** Every surface reads the P0 read model; "Configure" reuses the
  existing agent settings; voice detail links to the existing call page. New code is presentation +
  the read model, not re-implemented domain logic.

## 4. The hard constraint (why "code-complete", not "verified")

No staging env / no way to exercise the flag-ON UI against real prod data from here. The flag stays
OFF; an operator flips `PLATFORM_UX_ENABLED` on staging to preview the IA. Engineering-done vs
operationally-verified, as with prior sprints.

## 5. Metrics

| Metric | Value |
|---|---|
| Commits | 6 (read model+flag · nav+surfaces+redirects · conversation thread+registry · employee/channel detail · + P0/P1 docs) |
| New routes | `/dashboard/{employees,employees/[id],conversations,conversations/[id],channels,contacts}` |
| New env | `PLATFORM_UX_ENABLED` (default OFF) |
| Tests | 186 → **193** (+7: renderer registry, route redirects), all green |
| Build | passes (new routes registered) |
| Breaking changes | **0** (flag-gated; legacy nav/routes unchanged when OFF; no page deleted) |
| Roadmap | R-087/R-084/R-088/R-089 done; 35 completed / 52 open |

## 6. Lessons

- **"What breaks if I redirect this?" beat the plan.** The plan said collapse phone-lines/instagram/
  leads via redirects; implementing it would have hidden real management capability. Link-through +
  redirect-only-the-replaced-list is strictly better. Interrogate every collapse for capability loss.
- **A read model is the right seam for a big IA change.** Building surfaces against a stable
  view interface (not raw tables) meant the UI is oblivious to the eventual storage cutover — the
  reason P1–P3 could ship fast and safely over legacy data.
- **Plugin-from-day-one costs almost nothing when designed in.** The registry + channel-tagged turns
  (decided in P0's types) made P2's plugin thread a small, testable addition rather than a refactor.
- **Dark-launch discipline compounds.** `PLATFORM_UX_ENABLED` (like `PLATFORM_MODEL_ENABLED` before
  it) means the entire IA ships to `main` with zero customer risk; the flag is the whole safety net.

## 7. Deferred to Sprint 5.5 (approved scope split)

Contacts surface (generalize leads + identities/merge) · dashboard reskin (channel/employee-aware) ·
settings reorg (per-Employee / per-Channel; R-063) · onboarding narrative reframe · full customer-
facing naming sweep. Plus the standing platform follow-ups: R-081 backfill, R-082 IG→Employee,
R-083 voice-artifact convergence, R-085 read cutover, R-086 message-usage billing.

## 8. Handoff → next

**Operator:** flip `PLATFORM_UX_ENABLED` on staging and walk the IA (Employees → detail; Conversations
→ voice + IG threads; Channels manage links; legacy redirects). **Product/eng (Sprint 5.5):** Contacts
+ dashboard/settings/onboarding reskin + naming sweep, then the read-cutover (R-085) once dual-writes
are trusted. WhatsApp/Email stay deferred until the model is proven live.

---

*Living companion to the roadmap. Sprint 5 core is done-in-code; operationally verified when the IA is
walked with the flag ON on staging.*
