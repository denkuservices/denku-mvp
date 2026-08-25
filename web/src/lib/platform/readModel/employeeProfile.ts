import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Employee configuration reads (Phase 5 · extended for Sprint 10 / R-094).
 *
 * `getEmployeeProfile` renders the *display* shape. `getEmployeeConfig` returns the raw stored
 * values the Setup and Knowledge editors need to populate their inputs.
 *
 * Both are reads only. Writing still goes through `updateAgentConfiguration` /
 * `updateAgentPromptOverride`, which own validation, the role and paused gates, prompt
 * derivation and the Vapi sync — Sprint 10 moved the forms onto the employee, it did not give
 * the read model a way to change a live assistant.
 *
 * Org-scoped and never throws — a failed read renders an honest empty state.
 */

export interface BusinessContextField {
  key: string;
  label: string;
  value: string;
}

export interface EmployeeProfile {
  id: string;
  name: string;
  language: string | null;
  voice: string | null;
  timezone: string | null;
  /** The opening line customers hear. */
  firstMessage: string | null;
  /** True when an operator has overridden the derived prompt. */
  hasPromptOverride: boolean;
  personaKey: string | null;
  /** Business knowledge, flattened for display. Empty when nothing has been filled in. */
  businessContext: BusinessContextField[];
}

const COLUMNS =
  "id, name, language, voice, timezone, first_message, system_prompt_override, router_persona_key, default_persona_key, business_context";

/** Turn a `business_context` jsonb blob into displayable rows. Pure + testable. */
export function flattenBusinessContext(raw: unknown): BusinessContextField[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: BusinessContextField[] = [];

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    // Only render values a person can read. Nested objects are configuration detail, not
    // knowledge, and rendering "[object Object]" would be worse than omitting them.
    if (value == null) continue;
    const text =
      typeof value === "string"
        ? value.trim()
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : Array.isArray(value)
            ? value.filter((v) => typeof v === "string" || typeof v === "number").join(", ")
            : "";
    if (!text) continue;

    out.push({
      key,
      label: key.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      value: text,
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export async function getEmployeeProfile(
  orgId: string,
  employeeId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<EmployeeProfile | null> {
  if (!orgId || !employeeId) return null;
  try {
    const { data, error } = await db
      .from("agents")
      .select(COLUMNS)
      .eq("org_id", orgId)
      .eq("id", employeeId)
      .maybeSingle<{
        id: string;
        name: string | null;
        language: string | null;
        voice: string | null;
        timezone: string | null;
        first_message: string | null;
        system_prompt_override: string | null;
        router_persona_key: string | null;
        default_persona_key: string | null;
        business_context: unknown;
      }>();

    if (error || !data) return null;

    return {
      id: String(data.id),
      name: data.name ?? "AI Employee",
      language: data.language,
      voice: data.voice,
      timezone: data.timezone,
      firstMessage: data.first_message,
      hasPromptOverride: Boolean((data.system_prompt_override ?? "").trim()),
      personaKey: data.router_persona_key ?? data.default_persona_key ?? null,
      businessContext: flattenBusinessContext(data.business_context),
    };
  } catch (err) {
    console.error("[PLATFORM][READMODEL][EMPLOYEE_PROFILE]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * The raw, editable configuration for one employee (Sprint 10 · the Setup/Knowledge editors).
 *
 * Deliberately separate from `EmployeeProfile`: that one is shaped for reading (a flattened
 * business context, a `hasPromptOverride` boolean), while an editor needs the stored values
 * themselves. Sync status rides along so Setup can report the last Vapi sync exactly as the
 * page it replaces did.
 */
export interface EmployeeConfig {
  id: string;
  name: string;
  language: string | null;
  timezone: string | null;
  behaviorPreset: string | null;
  agentType: string | null;
  firstMessage: string | null;
  emphasisPoints: unknown;
  businessContext: unknown;
  systemPromptOverride: string | null;
  effectiveSystemPrompt: string | null;
  vapiSyncStatus: string | null;
  vapiSyncedAt: string | null;
}

const CONFIG_COLUMNS =
  "id, name, language, timezone, behavior_preset, agent_type, first_message, emphasis_points, " +
  "business_context, system_prompt_override, effective_system_prompt, vapi_sync_status, vapi_synced_at";

export async function getEmployeeConfig(
  orgId: string,
  employeeId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<EmployeeConfig | null> {
  if (!orgId || !employeeId) return null;
  try {
    const { data, error } = await db
      .from("agents")
      .select(CONFIG_COLUMNS)
      .eq("org_id", orgId)
      .eq("id", employeeId)
      .maybeSingle<{
        id: string;
        name: string | null;
        language: string | null;
        timezone: string | null;
        behavior_preset: string | null;
        agent_type: string | null;
        first_message: string | null;
        emphasis_points: unknown;
        business_context: unknown;
        system_prompt_override: string | null;
        effective_system_prompt: string | null;
        vapi_sync_status: string | null;
        vapi_synced_at: string | null;
      }>();

    if (error || !data) return null;

    return {
      id: String(data.id),
      name: data.name ?? "AI Employee",
      language: data.language,
      timezone: data.timezone,
      behaviorPreset: data.behavior_preset,
      agentType: data.agent_type,
      firstMessage: data.first_message,
      emphasisPoints: data.emphasis_points,
      businessContext: data.business_context,
      systemPromptOverride: data.system_prompt_override,
      effectiveSystemPrompt: data.effective_system_prompt,
      vapiSyncStatus: data.vapi_sync_status,
      vapiSyncedAt: data.vapi_synced_at,
    };
  } catch (err) {
    console.error("[PLATFORM][READMODEL][EMPLOYEE_CONFIG]", err instanceof Error ? err.message : String(err));
    return null;
  }
}
