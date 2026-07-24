import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  CALL_MAX_DURATION_SECONDS,
  CALL_SILENCE_TIMEOUT_SECONDS,
  DENKU_TOOL_IDS,
  resolveVoice,
  resolveTranscriber,
} from "@/lib/vapi/assistantConfig";
import { buildEmployeeManifest, manifestContentHash, validateManifest, type AgentRowForManifest } from "@/lib/platform/manifest/build";
import type { EmployeeManifest, ManifestRevision } from "@/lib/platform/manifest/types";

/**
 * Manifest revision store (Sprint 8 / R-107).
 *
 * `ensureCurrentRevision(employeeId)` returns the id of the revision describing an employee's
 * CURRENT configuration, minting a new one only when the content actually changed (content-hash
 * dedupe). It is the entry point for provenance: the caller stamps the returned id onto the
 * conversation/call it is recording.
 *
 * Safety, in the house style: **never throws**, and returns `null` when the `employee_manifests`
 * migration hasn't been applied — so the whole feature is inert until an operator applies it, and
 * the voice path is unaffected either way.
 */

const UNDEFINED_TABLE = "42P01";
const PG_UNIQUE_VIOLATION = "23505";

function tableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  return error.code === UNDEFINED_TABLE || msg.includes("does not exist") || msg.includes("could not find the table");
}

/** The columns a manifest is derived from. */
const AGENT_COLUMNS =
  "id, org_id, name, language, voice, timezone, first_message, system_prompt_override, effective_system_prompt, router_persona_key, default_persona_key, business_context";

/** Build the manifest for an employee from its current stored config + runtime bindings. */
export function manifestForAgent(agent: AgentRowForManifest): EmployeeManifest {
  const voice = resolveVoice(agent.language, agent.voice);
  const transcriber = resolveTranscriber(agent.language);
  return buildEmployeeManifest(agent, {
    // Recorded descriptively — these live in code today; R-108 makes them authoritative.
    brainProvider: "openai",
    brainModel: "gpt-4o",
    voiceProvider: voice.provider,
    voiceId: voice.voiceId,
    transcriberProvider: transcriber.provider,
    transcriberModel: transcriber.model,
    maxDurationSeconds: CALL_MAX_DURATION_SECONDS,
    silenceTimeoutSeconds: CALL_SILENCE_TIMEOUT_SECONDS,
    toolRefs: [...DENKU_TOOL_IDS],
  });
}

/**
 * Ensure a revision exists for the employee's current config; return its id (or null if the
 * feature isn't available / the employee is unknown). Idempotent: identical content reuses the
 * existing revision instead of minting a new one.
 */
export async function ensureCurrentRevision(
  employeeId: string,
  opts: { reason?: string } = {},
  db: SupabaseClient = supabaseAdmin
): Promise<string | null> {
  if (!employeeId) return null;

  try {
    const { data: agent, error: agentErr } = await db
      .from("agents")
      .select(AGENT_COLUMNS)
      .eq("id", employeeId)
      .maybeSingle<AgentRowForManifest>();
    if (agentErr || !agent) return null;

    const manifest = manifestForAgent(agent);
    const errors = validateManifest(manifest);
    if (errors.length > 0) {
      console.error("[PLATFORM][MANIFEST][INVALID]", errors.join("; "));
      return null;
    }
    const contentHash = manifestContentHash(manifest);

    // Already have a revision with this exact content?
    const existing = await db
      .from("employee_manifests")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("content_hash", contentHash)
      .maybeSingle<{ id: string }>();
    if (tableMissing(existing.error)) return null; // migration not applied → feature inert
    if (existing.data?.id) return existing.data.id;

    // Next revision number for this employee.
    const latest = await db
      .from("employee_manifests")
      .select("revision")
      .eq("employee_id", employeeId)
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle<{ revision: number }>();
    const nextRevision = (latest.data?.revision ?? 0) + 1;

    const inserted = await db
      .from("employee_manifests")
      .insert({
        org_id: agent.org_id,
        employee_id: employeeId,
        revision: nextRevision,
        manifest,
        content_hash: contentHash,
        reason: opts.reason ?? null,
      })
      .select("id")
      .single<{ id: string }>();

    if (inserted.error) {
      if (tableMissing(inserted.error)) return null;
      // Race: another writer minted the same content or revision number — re-read the winner.
      if ((inserted.error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        const winner = await db
          .from("employee_manifests")
          .select("id")
          .eq("employee_id", employeeId)
          .eq("content_hash", contentHash)
          .maybeSingle<{ id: string }>();
        return winner.data?.id ?? null;
      }
      console.error("[PLATFORM][MANIFEST][INSERT][FAILED]", inserted.error.message);
      return null;
    }

    console.info("[PLATFORM][MANIFEST][REVISION][CREATED]", { employeeId, revision: nextRevision });
    return inserted.data?.id ?? null;
  } catch (err) {
    console.error("[PLATFORM][MANIFEST][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** The employee's latest revision, for inspection/diffing. Null when unavailable. */
export async function getCurrentRevision(
  employeeId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<ManifestRevision | null> {
  if (!employeeId) return null;
  try {
    const { data, error } = await db
      .from("employee_manifests")
      .select("id, org_id, employee_id, revision, manifest, content_hash, reason, created_at")
      .eq("employee_id", employeeId)
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle<{
        id: string; org_id: string; employee_id: string; revision: number;
        manifest: EmployeeManifest; content_hash: string; reason: string | null; created_at: string;
      }>();
    if (error || !data) return null;
    return {
      id: data.id,
      orgId: data.org_id,
      employeeId: data.employee_id,
      revision: data.revision,
      manifest: data.manifest,
      contentHash: data.content_hash,
      reason: data.reason,
      createdAt: data.created_at,
    };
  } catch {
    return null;
  }
}
