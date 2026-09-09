/**
 * Apply a Knowledge payload to ONE employee, exactly as the dashboard would.
 *
 *   npx vite-node --config vitest.config.ts scripts/apply-employee-knowledge.mts <payload.json>
 *   npx vite-node --config vitest.config.ts scripts/apply-employee-knowledge.mts <payload.json> --dry-run
 *
 * A script rather than "type it into the dashboard for them", because the dashboard is behind the
 * CUSTOMER's login and this is operator work. What it must not become is a second way of writing
 * an employee: it calls the same `deriveEffectivePrompt` and the same `ensureAssistantConfig` the
 * Setup form calls, so what lands in Vapi is byte-identical to what the customer would get by
 * pressing save. Anything it did differently would drift the moment either path changed.
 *
 * The payload names its own `agentId` and `orgId`, and the row is matched on BOTH — an operator
 * script with a service-role key and a single-column WHERE is one typo away from rewriting
 * somebody else's assistant.
 *
 * Environment: read from `web/.env.local` (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VAPI_API_KEY).
 * Note it deliberately does NOT require VAPI_WEBHOOK_BASE_URL: without it `buildAssistantConfigPatch`
 * omits `server` entirely and the assistant keeps the webhook URL it already has, which is the
 * safe direction for a machine that is not the deployment (R-077).
 */

import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const payloadPath = process.argv.slice(2).find((a) => !a.startsWith("--"));

if (!payloadPath) {
  console.error("\n  Usage: apply-employee-knowledge.mts <payload.json> [--dry-run]\n");
  process.exit(1);
}

/** Load `.env.local` into `process.env` before anything reads it. */
function loadEnv(): void {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

type Payload = {
  agentId: string;
  orgId: string;
  business_context: Record<string, string>;
  emphasis_points: string[];
};

const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8")) as Payload;

async function main() {
  // Imported after the environment is loaded: the service-role client fails fast at import time.
  const { supabaseAdmin } = await import("../src/lib/supabase/admin");
  const { deriveEffectivePrompt } = await import("../src/app/(app)/dashboard/settings/_lib/prompt-derivation");
  const { ensureAssistantConfig } = await import("../src/lib/vapi/assistantConfig");

  const { data: agent, error } = await supabaseAdmin
    .from("agents")
    .select("*")
    .eq("id", payload.agentId)
    .eq("org_id", payload.orgId)
    .single();

  if (error || !agent) {
    console.error("\n  Employee not found for that (agentId, orgId).\n", error?.message ?? "");
    process.exit(1);
  }

  const { data: org } = await supabaseAdmin
    .from("orgs")
    .select("name")
    .eq("id", payload.orgId)
    .single<{ name: string }>();

  const prompt = deriveEffectivePrompt({
    orgName: org?.name || "your company",
    agentName: agent.name || "Agent",
    agentType: agent.agent_type ?? null,
    behaviorPreset: agent.behavior_preset ?? null,
    emphasisPoints: payload.emphasis_points,
    language: agent.language ?? null,
    additionalLanguages: agent.additional_languages ?? [],
    timezone: agent.timezone ?? null,
    firstMessage: agent.first_message ?? null,
    businessContext: payload.business_context,
    // Structured hours are left alone: this script changes Knowledge, and reading them here would
    // make it silently depend on a setting the operator did not ask it to touch.
    businessHoursSummary: null,
    afterHoursInstruction: null,
  });

  console.log(`\n${"─".repeat(70)}\n${prompt}\n${"─".repeat(70)}`);
  console.log(`\nemployee: ${agent.name} (${agent.language}) · prompt: ${prompt.length} chars`);
  console.log(`vapi assistant: ${agent.vapi_assistant_id ?? "(none)"}`);

  if (DRY) {
    console.log("\n  --dry-run: nothing written.\n");
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from("agents")
    .update({
      business_context: payload.business_context,
      emphasis_points: payload.emphasis_points,
      effective_system_prompt: prompt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.agentId)
    .eq("org_id", payload.orgId);

  if (updateError) {
    console.error("\n  DB update failed:", updateError.message, "\n");
    process.exit(1);
  }
  console.log("\n  ✓ employee row updated");

  if (!agent.vapi_assistant_id) {
    console.log("  · no Vapi assistant on this employee — nothing to sync\n");
    return;
  }

  const result = await ensureAssistantConfig({
    assistantId: agent.vapi_assistant_id,
    systemPrompt: prompt,
    firstMessage: agent.first_message ?? null,
    language: agent.language ?? null,
    additionalLanguages: agent.additional_languages ?? null,
    voiceId: agent.voice || null,
    modelTier: agent.model_tier || null,
  });

  if (!result.ok) {
    console.error("\n  Vapi sync FAILED:", result.error);
    console.error("  The DB row is updated; re-run to retry the sync.\n");
    process.exit(1);
  }

  await supabaseAdmin
    .from("agents")
    .update({ vapi_sync_status: "synced", vapi_synced_at: new Date().toISOString() })
    .eq("id", payload.agentId)
    .eq("org_id", payload.orgId);

  console.log("  ✓ synced to Vapi\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
