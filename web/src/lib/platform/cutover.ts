/**
 * Platform cutover readiness — the pure gate engine (Phase 1 of the authenticated redesign).
 *
 * Flipping `PLATFORM_MODEL_ENABLED` / `PLATFORM_UX_ENABLED` is an **operator** action, and the
 * two flags have DIFFERENT preconditions that are easy to get backwards. This module encodes
 * the ordering as data so `/admin/readiness` can give a real go/no-go instead of guesswork.
 *
 * The single most important fact it encodes, verified against the read model:
 *
 *   **`PLATFORM_UX_ENABLED` does NOT depend on `PLATFORM_MODEL_ENABLED`.**
 *
 * The Platform Read Model reads where data actually lives today — voice from `calls`, chat from
 * `conversations`, employees from `agents`, contacts from `leads`, artifacts from
 * `tickets`/`appointments` — all of which predate the platform migrations. So the new IA shows
 * real data with the model flag OFF. Sequencing the UX behind the dual-writes would block the
 * whole redesign on production traffic that only exists after the model flag is on.
 *
 * Pure + synchronous: every environmental fact is passed in, so this is fully unit-tested.
 * The probe layer lives in `cutoverProbe.ts`.
 */

export type StageStatus =
  /** Precondition satisfied and the step is complete. */
  | "done"
  /** Not done, but every precondition is met — the operator can act now. */
  | "ready"
  /** Not done and a precondition is missing — acting now is unsafe. */
  | "blocked"
  /** Deliberately not built yet (tracked work), so it can be neither ready nor blocked. */
  | "not_implemented"
  /** A probe could not answer (permissions, timeout). Never assume pass or fail. */
  | "unknown";

export type StageId =
  | "platform_migrations"
  | "model_dual_write"
  | "dual_write_parity"
  | "identity_backfill"
  | "platform_ux"
  | "read_cutover";

export interface CutoverStage {
  id: StageId;
  label: string;
  status: StageStatus;
  /** Does the redesign roadmap depend on this stage? Optional stages never block a phase. */
  required: boolean;
  detail: string;
  /** Stage ids that must be `done` first. Empty means independently flippable. */
  dependsOn: StageId[];
  /** The concrete operator action, when there is one. */
  action?: string;
}

export interface CutoverFacts {
  /** `employee_channels` present → the 20260724* platform migrations were applied. */
  platformMigrationsApplied: boolean | null;
  /** `contacts` present (migration 2 of 4). */
  contactsTablePresent: boolean | null;
  modelFlagOn: boolean;
  uxFlagOn: boolean;
  /** Rows in `conversations`. >0 with the flag on is evidence dual-writes are landing. */
  conversationCount: number | null;
  /** Calls carrying `conversation_id`. Compared against `recentCallCount` for parity. */
  linkedCallCount: number | null;
  /** Calls in the same window, whatever their link state. */
  recentCallCount: number | null;
  /** Rows in `employee_channels` — R-081 backfill evidence. */
  employeeChannelCount: number | null;
}

const UNPROBED = "Could not probe (permissions or timeout) — verify manually before acting.";

/**
 * Evaluate the cutover sequence. Ordering rules, stated once:
 *
 * - migrations → model flag → parity evidence: a strict chain. Dual-writes target tables the
 *   migrations create, and parity can only be observed after real traffic flows.
 * - backfill (R-081) needs the migrations but NOT the model flag — it is a data-shape task.
 * - UX flag depends on nothing (see the module header).
 * - read cutover (R-085) needs proven parity; it is not implemented, by decision.
 */
export function evaluateCutover(facts: CutoverFacts): CutoverStage[] {
  const stages: CutoverStage[] = [];

  // --- 1. Migrations -------------------------------------------------------
  const migrations = facts.platformMigrationsApplied;
  stages.push({
    id: "platform_migrations",
    label: "Platform model migrations applied",
    status: migrations === true ? "done" : migrations === false ? "ready" : "unknown",
    required: false, // the UX phases do not need them; the dual-writes do
    dependsOn: [],
    detail:
      migrations === true
        ? "employee_channels present — the 20260724* migrations are applied."
        : migrations === false
          ? "Not applied. Required before PLATFORM_MODEL_ENABLED, not before PLATFORM_UX_ENABLED."
          : UNPROBED,
    action: migrations === false ? "Apply the 4 platform migrations (docs/SPRINT_4.5_MIGRATION.md)." : undefined,
  });

  // --- 2. Model dual-writes ------------------------------------------------
  const canFlipModel = migrations === true;
  stages.push({
    id: "model_dual_write",
    label: "PLATFORM_MODEL_ENABLED (voice/IG dual-write)",
    status: facts.modelFlagOn ? "done" : canFlipModel ? "ready" : migrations === false ? "blocked" : "unknown",
    required: false,
    dependsOn: ["platform_migrations"],
    detail: facts.modelFlagOn
      ? "On — voice and Instagram mirror into conversations/messages."
      : canFlipModel
        ? "Off. Migrations are applied, so this is safe to flip; legacy behaviour is unchanged either way."
        : migrations === false
          ? "Blocked — flipping this before the migrations would write into tables that do not exist."
          : UNPROBED,
    action: !facts.modelFlagOn && canFlipModel ? "Set PLATFORM_MODEL_ENABLED=true in Vercel and redeploy." : undefined,
  });

  // --- 3. Dual-write parity evidence ---------------------------------------
  stages.push({ ...parityStage(facts) });

  // --- 4. Identity backfill (R-081) ----------------------------------------
  const channels = facts.employeeChannelCount;
  stages.push({
    id: "identity_backfill",
    label: "Employee↔Channel + contact backfill (R-081)",
    status:
      channels === null
        ? "unknown"
        : channels > 0
          ? "done"
          : migrations === true
            ? "not_implemented"
            : "blocked",
    required: false,
    dependsOn: ["platform_migrations"],
    detail:
      channels === null
        ? UNPROBED
        : channels > 0
          ? `${channels} employee_channels row(s) — ownership is populated.`
          : migrations === true
            ? "No rows. Until backfilled, Instagram connections stay org-level and are never attributed to an employee (the UI must not invent ownership)."
            : "Blocked — needs the platform migrations first.",
  });

  // --- 5. Platform UX ------------------------------------------------------
  // Independent by design. Stated loudly because assuming otherwise blocks the roadmap.
  stages.push({
    id: "platform_ux",
    label: "PLATFORM_UX_ENABLED (new information architecture)",
    status: facts.uxFlagOn ? "done" : "ready",
    required: true,
    dependsOn: [],
    detail: facts.uxFlagOn
      ? "On — the platform IA is served."
      : "Off. Independent of the model flag: the read model sources calls/conversations/agents/leads/tickets/appointments, all of which predate the platform migrations, so the new IA shows real data now.",
    action: facts.uxFlagOn
      ? undefined
      : "Run the functional-parity suite, then set PLATFORM_UX_ENABLED=true in a preview/staging env first.",
  });

  // --- 6. Read cutover (R-085) ---------------------------------------------
  stages.push({
    id: "read_cutover",
    label: "Read cutover to the shared model (R-085)",
    status: "not_implemented",
    required: false,
    dependsOn: ["dual_write_parity"],
    detail:
      "Deliberately last. The read model already presents legacy stores in platform shape, so cutting reads over is a source swap behind ConversationView — safest once the UI reads one stable interface and parity is proven.",
  });

  return stages;
}

/**
 * Parity is the one stage that cannot be asserted from configuration — it needs observed rows.
 * With the flag off there is nothing to compare, which is "waiting", not "failing".
 */
function parityStage(facts: CutoverFacts): CutoverStage {
  const base = {
    id: "dual_write_parity" as const,
    label: "Dual-write parity observed",
    required: false,
    dependsOn: ["model_dual_write"] as StageId[],
  };

  if (!facts.modelFlagOn) {
    return {
      ...base,
      status: "blocked",
      detail: "Blocked — nothing writes to conversations until PLATFORM_MODEL_ENABLED is on.",
    };
  }
  if (facts.conversationCount === null || facts.linkedCallCount === null || facts.recentCallCount === null) {
    return { ...base, status: "unknown", detail: UNPROBED };
  }
  if (facts.recentCallCount === 0) {
    return {
      ...base,
      status: "ready",
      detail: "No calls in the sampled window yet — place a test call, then re-check.",
      action: "Place one test call and confirm a conversations row plus calls.conversation_id.",
    };
  }
  if (facts.linkedCallCount >= facts.recentCallCount) {
    return {
      ...base,
      status: "done",
      detail: `All ${facts.recentCallCount} sampled call(s) carry conversation_id; ${facts.conversationCount} conversation row(s) recorded.`,
    };
  }
  return {
    ...base,
    status: "ready",
    detail: `${facts.linkedCallCount}/${facts.recentCallCount} sampled call(s) linked to a conversation. Calls that predate the flag are expected to be unlinked — confirm the gap is only historical before cutting reads over.`,
    action: "Compare the unlinked calls' started_at against when the flag was enabled.",
  };
}

export interface CutoverSummary {
  /** Can the operator flip PLATFORM_UX_ENABLED now? (Phase 2+ gate.) */
  uxReady: boolean;
  /** Stages the operator can act on right now. */
  actionable: StageId[];
  blocked: StageId[];
  unknown: StageId[];
}

export function summarizeCutover(stages: CutoverStage[]): CutoverSummary {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const ux = byId.get("platform_ux");
  return {
    uxReady: ux?.status === "done" || ux?.status === "ready",
    actionable: stages.filter((s) => s.status === "ready").map((s) => s.id),
    blocked: stages.filter((s) => s.status === "blocked").map((s) => s.id),
    unknown: stages.filter((s) => s.status === "unknown").map((s) => s.id),
  };
}
