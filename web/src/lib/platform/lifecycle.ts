/**
 * Contact lifecycle (Phase 4).
 *
 * **Deliberately reuses `leads.status`** rather than introducing a `lifecycle_stage` column. That
 * column already IS the lifecycle — the lead create action has enforced
 * `new | contacted | qualified | unqualified` via zod since it was written — so a second column
 * would mean two sources of truth for one fact, and every existing lead would start with the new
 * one blank. The CRM presents the existing value as the lifecycle instead.
 *
 * Pure and dependency-free so the vocabulary has exactly one definition, shared by the read
 * model, the UI and the server action.
 */

export const LIFECYCLE_STAGES = ["new", "contacted", "qualified", "unqualified"] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export interface LifecycleMeta {
  value: LifecycleStage;
  label: string;
  /** What this stage means, so the UI never has to guess or invent copy. */
  description: string;
  tone: "neutral" | "info" | "ok" | "warn";
}

export const LIFECYCLE: Record<LifecycleStage, LifecycleMeta> = {
  new: {
    value: "new",
    label: "New",
    description: "Your AI has heard from them, but nobody has followed up yet.",
    tone: "info",
  },
  contacted: {
    value: "contacted",
    label: "Contacted",
    description: "Someone — your AI or your team — has been in touch.",
    tone: "neutral",
  },
  qualified: {
    value: "qualified",
    label: "Qualified",
    description: "A real opportunity worth your team's time.",
    tone: "ok",
  },
  unqualified: {
    value: "unqualified",
    label: "Unqualified",
    description: "Not a fit — kept for history, not for follow-up.",
    tone: "warn",
  },
};

export function isLifecycleStage(value: string | null | undefined): value is LifecycleStage {
  return typeof value === "string" && (LIFECYCLE_STAGES as readonly string[]).includes(value);
}

/**
 * Present any stored status safely. Legacy rows can hold values outside the enum (the column is
 * free text and predates the zod guard), so unknown values are shown as-is rather than coerced
 * to "new" — silently relabelling someone's data is worse than showing an unfamiliar word.
 */
export function lifecycleMeta(status: string | null | undefined): LifecycleMeta | null {
  if (!status) return null;
  if (isLifecycleStage(status)) return LIFECYCLE[status];
  return {
    value: status as LifecycleStage,
    label: status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " "),
    description: "A status recorded before the current lifecycle stages.",
    tone: "neutral",
  };
}
