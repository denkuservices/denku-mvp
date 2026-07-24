import type { Channel } from "@/lib/platform/channels";

/**
 * Employee Manifest — versioned desired state (Sprint 8 / R-107, audit E-001).
 *
 * **Two rules define this shape, and both come from the audit:**
 *
 * 1. **Desired state only.** `cost`, `KPIs` and `health` are deliberately ABSENT. They are computed
 *    from the data plane (conversations, usage, connection health). A revision must be immutable;
 *    costs and metrics change by the minute. Conflating them is what makes systems unversionable.
 *
 * 2. **Reference, never embed.** Knowledge and tools are `*Refs` — ids of org-scoped, independently
 *    versioned entities. Embedding them would mean 500 employees = 500 copies of the same FAQ, and
 *    "employees share knowledge" would be impossible.
 *
 * **Descriptive first, authoritative later.** This sprint RECORDS what an employee was configured
 * with (so history stops being lost); it does not yet DRIVE behavior from the manifest. When provider
 * binding lands (R-108), the same fields become authoritative — no shape change, no migration.
 */

/** Bump when the manifest shape changes incompatibly; old revisions keep their own version. */
export const MANIFEST_SCHEMA_VERSION = 1 as const;

/** Which model actually produced the employee's language behavior. */
export interface BrainBinding {
  /** e.g. "openai" — hardcoded in code today (R-108 will make this authoritative). */
  provider: string;
  /** e.g. "gpt-4o-mini". */
  model: string;
  temperature?: number | null;
}

/** Voice-channel synthesis/transcription binding (null for non-voice employees). */
export interface VoiceBinding {
  provider: string | null;
  voiceId: string | null;
  transcriberProvider?: string | null;
  transcriberModel?: string | null;
  /** Guardrails that shape behavior + cost (R-052). */
  maxDurationSeconds?: number | null;
  silenceTimeoutSeconds?: number | null;
}

export interface ManifestIdentity {
  name: string;
  timezone: string | null;
  /** BCP-47-ish codes the employee operates in. */
  languages: string[];
}

export interface ManifestPersonality {
  /** Persona selection (multi-persona modelling is R-116). */
  personaKey: string | null;
  routerPersonaKey: string | null;
  firstMessage: string | null;
  /** Operator's raw override, when set. */
  promptOverride: string | null;
  /** The derived prompt that actually ran — the thing that used to be silently overwritten. */
  effectivePrompt: string | null;
}

export interface ManifestKnowledge {
  /** Ids of shared, versioned knowledge entities (R-109). Empty until that lands. */
  refs: string[];
  /**
   * Transitional: today knowledge is a per-employee JSONB blob (`agents.business_context`).
   * Captured here so revisions are complete; migrates to `refs` under R-109.
   */
  inlineBusinessContext: Record<string, unknown> | null;
}

export interface ManifestChannelBinding {
  channel: Channel;
  /** Connection row id (phone_lines.id / instagram_connections.id), when known. */
  connectionRef: string | null;
}

/** Declarative policy — hours/escalation/permissions live here, not in code branches (R-114). */
export interface ManifestPolicies {
  workingHours: Record<string, unknown> | null;
  escalation: Record<string, unknown> | null;
  permissions: Record<string, unknown> | null;
}

export interface EmployeeManifest {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  identity: ManifestIdentity;
  personality: ManifestPersonality;
  brain: BrainBinding;
  voice: VoiceBinding | null;
  knowledge: ManifestKnowledge;
  /** Tool ids the employee may use (registry + grants = R-111). */
  toolRefs: string[];
  /** Reusable automation ids (R-106/R-113). Empty until those land. */
  automationRefs: string[];
  channels: ManifestChannelBinding[];
  policies: ManifestPolicies;
  /** Free-form business goals (KPIs are measured, not declared — see rule 1). */
  goals: string[];
}

/** A stored, immutable revision. */
export interface ManifestRevision {
  id: string;
  orgId: string;
  employeeId: string;
  revision: number;
  manifest: EmployeeManifest;
  contentHash: string;
  reason: string | null;
  createdAt: string;
}
