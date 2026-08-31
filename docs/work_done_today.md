# Work done — 2026-08-31 (Denku 2.0 session)

A single session covering: a full audit, a safe performance pass, the **Voice completion**
workstream, and the **Usage** widget. Two working trees were used to avoid colliding with a
second Claude session running on the same branch:

- **`feat/landing-v3-p0`** (main working tree) — the performance pass + the `docs/denku-2.0/` set.
- **`feat/voice-completion`** (isolated git worktree at `C:\Users\alien\denku-voice-worktree`) —
  Voice completion + the Usage widget. **Not merged yet** (see "What I need from you").

Everything below is verified: `tsc --noEmit` clean on changed files, and the full vitest suite green
(882 → 887 tests as tests were added).

---

## 1. Audit (7 areas) → `docs/denku-2.0/`

A 7-agent audit mapped: Voice end-to-end, language→voice, BYON/SIP, usage screen, dashboard i18n +
reply-engine language, and dashboard/inbox performance. Findings + per-workstream backlog live in
`docs/denku-2.0/` (`00-audit-findings.md`, `01`–`05`, `README.md`). Read that folder first.

**Owner decisions locked:** build order = Performance → Voice → Dashboard i18n → BYON/SIP + Usage;
build **de/tr voice** (registry work, in the i18n workstream); AI auto-replies stay **mirror**
(answer in the customer's language); Usage chart goes on the **home**.

## 2. Performance — safe first pass (on `feat/landing-v3-p0`)

Root cause = round-trip amplification + no caching (NOT missing indexes). Shipped the safe, high-value
subset; the deeper server-side fixes are **deferred until the system is feature-complete** (per your
call) and are listed in `docs/denku-2.0/01-performance.md`.

- `next.config.ts`: `experimental.staleTimes = { dynamic: 30, static: 180 }` — client Router Cache, so
  revisiting a page/conversation is instant instead of refetching.
- Inbox `ConversationList.tsx`: stale-while-revalidate client cache — **channel/filter switching no
  longer blanks to a skeleton** (your specific complaint).
- `resolveOrgId` wrapped in React `cache()`; new `lib/org/orgSettingsContext.ts` collapses
  `getWorkspaceStatus` / `isWorkspacePaused` / `getOrgTimezone` from 3 `organization_settings`
  round-trips to 1/request.
- `loading.tsx` added for calls/tickets/leads/analytics/agents; removed leftover debug `console.log`s
  (middleware + calls page).

> Note: because the side session ran `git add -A`-style commits, most of these landed **inside its
> commits** on `feat/landing-v3-p0` (functionally intact; messy attribution). `staleTimes` + the
> `docs/denku-2.0/` set are in commit `13f03a2`.

## 3. Voice completion (on `feat/voice-completion`)

| Item | What | Commit |
|---|---|---|
| **A1** | Onboarding **activation** + **Hire** path now go live in the chosen language, with a business prompt **and the tools** (create_ticket / create_appointment / identify_caller). Activation converges both the fresh-create and idempotent-resume paths on the chosen language via the single prompt source (`deriveEffectivePrompt`). New `lib/vapi/greeting.ts` = localized opening line. | `3591437` |
| **B** | (same commit) Hire path (`agents/new/actions.ts`) now calls `ensureAssistantConfig` at creation — previously a hired employee had no voice/transcriber/tools until a manual Settings save. | `3591437` |
| **D** | **Real in-browser Test call** — replaces `alert("coming soon")`. New auth'd, org-scoped `POST /api/vapi/test-call` (returns only the caller's own assistant) + a Vapi Web SDK widget (connect / live / mute / end). No telephony cost. | `cdf3660` |
| **C** | **Knowledge base / PDF upload** (your explicit ask). Vapi-native: upload each file (`POST /file`) → one `type:"query"` tool per employee → attached to the assistant (survives later config syncs). Migration + `agent_knowledge_files` table + helpers + owner/admin org-scoped actions (the tool is always rebuilt from DB truth, so partial failures self-heal) + upload/list/delete UI in the Knowledge tab + 5 unit tests. | `ab09b5e` |

**Deferred:** A2 (onboarding UI *capturing* language/business info — folded into i18n) and E
(auto-reconcile on Vapi sync failure, minor). See `docs/denku-2.0/02-voice-completion.md`.

## 4. Usage / remaining-minutes widget (on `feat/voice-completion`)

- `lib/billing/getRemainingMinutes.ts` — cached read of `org_daily_usage` for the current month →
  cumulative series + used/included/remaining from `PLAN_PRICING` (matches the invoice). Null in
  preview mode / chat-only → card hides.
- `UsageMinutesCard.tsx` on the **home**: used/included, minutes-left (or overage), a fill bar, and a
  **cumulative burn-down** chart with the plan ceiling as the y-axis max (shows pace, not just "how
  full"). `TrendChart` gained optional `max` + `color` (backward compatible).
- **Remaining:** mirror the card into `_platform/home/PlatformDashboard.tsx` for when
  `PLATFORM_UX_ENABLED` flips. | Commit `da43573`.

## 5. Docs written

`docs/denku-2.0/` (README + 00–05) and this file.

---

## What I need from you

1. **Merge the isolated branch** when the side session is idle (it touches the shared tree, so do it
   when safe):
   ```
   git worktree remove C:/Users/alien/denku-voice-worktree
   git checkout feat/landing-v3-p0 && git merge feat/voice-completion
   ```
   (The worktree's `node_modules` is a junction to the main tree's — `worktree remove` cleans it up.)

2. **Apply the migration** `supabase/migrations/20260831140000_agent_knowledge_files.sql` (I'm
   read-only on Supabase MCP, so migrations are files for an operator to run).

3. **Live-smoke the Vapi knowledge base** with a real API key: upload a PDF → confirm a `type:"query"`
   tool is created and attached, and the AI answers from it. If the account's KB provider isn't
   Google, change `knowledgeBases[].provider` in `lib/vapi/knowledge.ts#buildQueryToolBody`. The Vapi
   calls were coded to the current docs but **not** live-tested here.

4. **Confirm env keys**: `NEXT_PUBLIC_VAPI_PUBLIC_KEY` (Test call + Web SDK) and `VAPI_API_KEY`
   (server) are set in Vercel.

5. **Decisions for the next workstreams:**
   - **BYON/SIP billing model** — charge a per-number platform fee (reuse `extra_phone`) vs meter
     minutes only vs free? (`docs/denku-2.0/04-byon-sip.md`, step 4.)
   - **Dashboard i18n** go-ahead — it's the largest workstream (~170 files) and includes wiring de/tr
     voice into the registry (needs verified Deepgram + TTS voices).

6. **Review** the branch (`git log --oneline 13f03a2..feat/voice-completion`) and the deferred
   performance backlog before it's picked up (`docs/denku-2.0/01-performance.md`), since some of those
   items touch auth gating.
