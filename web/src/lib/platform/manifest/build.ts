import { createHash } from "node:crypto";
import {
  MANIFEST_SCHEMA_VERSION,
  type EmployeeManifest,
  type ManifestChannelBinding,
} from "@/lib/platform/manifest/types";

/**
 * Build an EmployeeManifest from today's storage (Sprint 8 / R-107). **Pure** — no I/O — so the
 * shape is fully unit-testable and the hash is deterministic.
 *
 * This is the bridge from "config scattered across `agents` columns + code constants" to "one
 * versioned document". Where a value currently lives in code rather than data (the LLM model, the
 * voice/transcriber defaults, the tool ids), we record what *actually runs* — the manifest is
 * DESCRIPTIVE now and becomes AUTHORITATIVE under R-108/R-111 without changing shape.
 */

/** The agent row columns the manifest is derived from. */
export interface AgentRowForManifest {
  id: string;
  org_id: string;
  name: string;
  language?: string | null;
  voice?: string | null;
  timezone?: string | null;
  first_message?: string | null;
  system_prompt_override?: string | null;
  effective_system_prompt?: string | null;
  router_persona_key?: string | null;
  default_persona_key?: string | null;
  business_context?: Record<string, unknown> | null;
}

/** Runtime values that live in code today; passed in so this stays pure + honest. */
export interface RuntimeBindings {
  brainProvider: string;
  brainModel: string;
  voiceProvider?: string | null;
  voiceId?: string | null;
  transcriberProvider?: string | null;
  transcriberModel?: string | null;
  maxDurationSeconds?: number | null;
  silenceTimeoutSeconds?: number | null;
  toolRefs?: string[];
  channels?: ManifestChannelBinding[];
}

export function buildEmployeeManifest(
  agent: AgentRowForManifest,
  runtime: RuntimeBindings
): EmployeeManifest {
  const languages = [agent.language ?? "en"].filter(Boolean) as string[];

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    identity: {
      name: agent.name,
      timezone: agent.timezone ?? null,
      languages,
    },
    personality: {
      personaKey: agent.default_persona_key ?? null,
      routerPersonaKey: agent.router_persona_key ?? null,
      firstMessage: agent.first_message ?? null,
      promptOverride: agent.system_prompt_override ?? null,
      // The value that used to be silently overwritten on every edit — now captured per revision.
      effectivePrompt: agent.effective_system_prompt ?? null,
    },
    brain: {
      provider: runtime.brainProvider,
      model: runtime.brainModel,
      temperature: null,
    },
    voice: {
      provider: runtime.voiceProvider ?? null,
      voiceId: runtime.voiceId ?? agent.voice ?? null,
      transcriberProvider: runtime.transcriberProvider ?? null,
      transcriberModel: runtime.transcriberModel ?? null,
      maxDurationSeconds: runtime.maxDurationSeconds ?? null,
      silenceTimeoutSeconds: runtime.silenceTimeoutSeconds ?? null,
    },
    knowledge: {
      refs: [], // populated when knowledge becomes a shared entity (R-109)
      inlineBusinessContext: agent.business_context ?? null,
    },
    toolRefs: runtime.toolRefs ?? [],
    automationRefs: [],
    channels: runtime.channels ?? [],
    policies: { workingHours: null, escalation: null, permissions: null },
    goals: [],
  };
}

/**
 * Deterministic content hash of a manifest. Key ordering is normalized so semantically identical
 * manifests hash identically — that's what stops a no-op save from minting a revision.
 */
export function manifestContentHash(manifest: EmployeeManifest): string {
  return createHash("sha256").update(stableStringify(manifest)).digest("hex");
}

/** JSON.stringify with deterministic key order (recursive). Pure. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Minimal structural validation — a revision must never be stored malformed. Pure. */
export function validateManifest(manifest: EmployeeManifest): string[] {
  const errors: string[] = [];
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    errors.push(`Unsupported schemaVersion: ${String(manifest.schemaVersion)}`);
  }
  if (!manifest.identity?.name?.trim()) errors.push("identity.name is required");
  if (!Array.isArray(manifest.identity?.languages) || manifest.identity.languages.length === 0) {
    errors.push("identity.languages must be non-empty");
  }
  if (!manifest.brain?.provider || !manifest.brain?.model) {
    errors.push("brain.provider and brain.model are required");
  }
  for (const key of ["refs"] as const) {
    if (!Array.isArray(manifest.knowledge?.[key])) errors.push(`knowledge.${key} must be an array`);
  }
  if (!Array.isArray(manifest.toolRefs)) errors.push("toolRefs must be an array");
  if (!Array.isArray(manifest.channels)) errors.push("channels must be an array");
  // Guard rule 1 from the audit: observed state must never leak into desired state.
  for (const forbidden of ["cost", "kpis", "health", "metrics"]) {
    if (forbidden in (manifest as unknown as Record<string, unknown>)) {
      errors.push(`Manifest must not contain observed state: ${forbidden}`);
    }
  }
  return errors;
}
