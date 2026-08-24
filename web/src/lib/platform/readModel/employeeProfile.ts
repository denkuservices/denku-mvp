import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Employee configuration, read-only (Phase 5 — the Setup and Knowledge tabs).
 *
 * Deliberately a **read** model, not an edit surface. Editing lives in the existing agent
 * settings pages, which own validation, the Vapi sync and manifest minting; duplicating any of
 * that here would create a second way to change how a live assistant behaves. The tabs show what
 * is configured and link through to change it (folding those forms in properly is R-094).
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
