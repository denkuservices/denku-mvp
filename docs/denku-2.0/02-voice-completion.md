# Voice completion — CURRENT workstream

Goal: make the voice product genuinely complete and self-serve. The pipeline already works
end-to-end (`00-audit-findings.md` §1); these items close the "setup feels thin / not truly
self-serve" gaps. Ordered by value.

## A. Onboarding captures business info + language, and activation uses them

**Problem:** `runActivation` (`onboarding/_actions.ts:972-989`) creates the assistant with a fixed
generic ENGLISH prompt and passes only `{language}` to `ensureAssistantConfig`, so a newly-live
agent is nearly blank and English regardless of the customer.

**Do:**
1. In onboarding, capture (at minimum) the business's **language**, **services/what it does**, and
   optionally **hours** + a **greeting** — either as new steps or a single "About your business" step.
   Persist onto `organization_settings`/`agents` (reuse existing `business_context` shape).
2. In `runActivation`, derive the prompt via `deriveEffectivePrompt(...)` and pass
   `systemPrompt` + `firstMessage` + `language` (+ `additionalLanguages`) into `ensureAssistantConfig`,
   exactly like the Settings→Agents path does (`settings/_actions/agents.ts:131-145,262-274`).
3. Ensure `organization_settings.onboarding_language` is actually written (today it defaults to `en`).

**Files:** `onboarding/_actions.ts`, `onboarding/OnboardingClient.tsx`, `settings/_lib/prompt-derivation.ts`,
`lib/vapi/assistantConfig.ts`. **Guardrail:** keep activation idempotent/resumable and the
never-dead-end guarantee untouched.

## B. Hire path applies language + tools to Vapi at creation

**Problem:** `createAgentAction` (`agents/new/actions.ts:100-113`) writes language only into inert
Vapi metadata and never calls `ensureAssistantConfig` — a hired employee has no voice/transcriber/
model.messages/firstMessage/tools/webhook until an owner opens Settings and saves.

**Do:** right after assistant create, call
`ensureAssistantConfig({ assistantId, language, systemPrompt: deriveEffectivePrompt(...), firstMessage })`.
This is the smallest, most surprising break to fix (S effort).

## C. Knowledge base / PDF upload (the owner's explicit ask — highest value, does not exist)

**Problem:** zero file-upload capability anywhere; "Knowledge" tab = 8 free-text fields.

**Design options (pick one, confirm with owner):**
- **Vapi-native knowledge base / query tool** — upload the file to Vapi's Files API, create/attach a
  knowledgeBase (or query tool) to the assistant via `ensureAssistantConfig`. Keeps retrieval on
  Vapi's side; best fit for voice. **Verify current Vapi Files/knowledgeBase API shape before coding.**
- **Own store + prompt injection** — Supabase Storage bucket (RLS/service-role), extract text
  server-side, fold a bounded summary into the prompt. Simpler but bloats the prompt; poor for large docs.

**Build (Vapi-native path):**
1. Supabase Storage bucket for source files (per-org path, service-role writes, signed reads).
2. Upload UI in the existing Knowledge tab (`KnowledgeForm.tsx`): drag/drop PDF, list, delete.
3. Server action: validate (type/size), store, push to Vapi Files, attach knowledgeBase/query-tool
   via `ensureAssistantConfig` (merge — never strip toolIds/webhook, per landmine #6).
4. Track file→assistant linkage in a new table (org-scoped, RLS). Handle delete → detach + remove.

**Guardrails:** additive; never strip `model.toolIds`/webhook `server.url`; keep the sync soft-fail
honest (surface `vapi_sync_status`). New external origin? add to CSP allowlist in `next.config.ts`.

## D. Real dashboard "Test call"

**Problem:** `SuccessBanner.tsx:35` = `alert("Test call coming soon")`; `?test=1` is never consumed.

**Do:** reuse the working marketing browser path (`api/vapi/start` + Vapi Web SDK) to let an owner
talk to their own assistant from the dashboard, OR trigger an outbound test call to a number they
enter. Prefer the in-browser Web SDK (no telephony cost, instant). Those calls already land in the
webhook and produce artifacts (webcall detection).

## E. (minor) Auto-reconcile on Vapi sync failure

When `updateAgentConfiguration` catches a Vapi sync error it still returns `ok:true` with
`vapi_sync_status:"error:…"`. Add a lightweight retry/reconcile so a saved config can't silently
diverge from the live assistant (today only the internal reconcile endpoint fixes it).

---

### Definition of done for this workstream
- A new customer finishes onboarding with an agent that already knows their business + speaks their language.
- Hiring an employee yields a fully-configured Vapi assistant with tools, no manual save needed.
- A customer can upload a PDF and the agent uses it.
- A customer can test their agent from the dashboard.
- All changes additive, idempotent, never weaken never-dead-end; `tsc` clean + tests green.
