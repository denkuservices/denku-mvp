"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";
import { vapiFetch } from "@/lib/vapi/server";
import { deriveEffectivePrompt } from "../_lib/prompt-derivation";
import { isWorkspacePaused } from "@/lib/workspace-status";

// Validation schema for agent configuration update
const UpdateAgentConfigSchema = z.object({
  agentId: z.string().uuid(),
  language: z.string().nullable(),
  timezone: z.string().nullable(),
  behavior_preset: z.string().nullable(),
  agent_type: z.string().nullable(),
  first_message: z.string().nullable(),
  emphasis_points: z.array(z.string()).nullable(),
});

type UpdateAgentConfigInput = z.infer<typeof UpdateAgentConfigSchema>;

export type UpdateAgentConfigResult =
  | {
      ok: true;
      data: {
        agentId: string;
        vapiSyncStatus: string | null;
        effective_system_prompt: string | null;
        language: string | null;
        timezone: string | null;
        behavior_preset: string | null;
        agent_type: string | null;
        first_message: string | null;
        emphasis_points: string[] | null;
        vapi_synced_at: string | null;
      };
    }
  | { ok: false; error: string };

/**
 * Update agent configuration and sync to Vapi
 */
export async function updateAgentConfiguration(
  input: UpdateAgentConfigInput
): Promise<UpdateAgentConfigResult> {
  const supabase = await createSupabaseServerClient();

  // 1) Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized: Please log in" };
  }

  // 2) Get profile with org_id
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single<{ id: string; org_id: string | null; role: string | null }>();

  if (profErr || !profile || !profile.org_id) {
    return { ok: false, error: "Organization not found" };
  }

  // 3) Enforce role-based access (owner/admin only)
  if (profile.role !== "owner" && profile.role !== "admin") {
    return { ok: false, error: "Forbidden: Only owners and admins can update agent settings" };
  }

  const orgId = profile.org_id;

  // 4) Check if workspace is paused (block mutations)
  const paused = await isWorkspacePaused(orgId);
  if (paused) {
    return { ok: false, error: "Workspace is paused. Resume to make changes." };
  }

  // 5) Validate input
  const validation = UpdateAgentConfigSchema.safeParse(input);
  if (!validation.success) {
    return { ok: false, error: `Validation error: ${validation.error.message}` };
  }

  const validated = validation.data;

  // 5) Fetch existing agent (enforce org ownership)
  const { data: existingAgent, error: fetchErr } = await supabase
    .from("agents")
    .select("*")
    .eq("id", validated.agentId)
    .eq("org_id", orgId)
    .single();

  if (fetchErr || !existingAgent) {
    return { ok: false, error: "Agent not found or unauthorized" };
  }

  // 6) Get organization name for prompt derivation (using orgs table as source of truth)
  const { data: org } = await supabase
    .from("orgs")
    .select("name")
    .eq("id", orgId)
    .single<{ name: string }>();

  const orgName = org?.name || "your company";

  // 7) Derive effective system prompt
  // Note: behaviorPreset is stored as ID (e.g., "professional"), not label
  const effectivePrompt = deriveEffectivePrompt({
    orgName,
    agentName: existingAgent.name || "Agent",
    agentType: validated.agent_type || existingAgent.agent_type || null,
    behaviorPreset: validated.behavior_preset || existingAgent.behavior_preset || null,
    emphasisPoints: validated.emphasis_points || (Array.isArray(existingAgent.emphasis_points) ? existingAgent.emphasis_points : typeof existingAgent.emphasis_points === "string" ? JSON.parse(existingAgent.emphasis_points) : null) || null,
    language: validated.language || existingAgent.language || null,
    timezone: validated.timezone || existingAgent.timezone || null,
    firstMessage: validated.first_message || existingAgent.first_message || null,
  });

  // 8) Prepare update payload
  const updatePayload: Record<string, unknown> = {
    language: validated.language,
    timezone: validated.timezone,
    behavior_preset: validated.behavior_preset,
    agent_type: validated.agent_type,
    first_message: validated.first_message,
    emphasis_points: validated.emphasis_points || null,
    effective_system_prompt: effectivePrompt,
    updated_at: new Date().toISOString(),
  };

  // 9) Compute diff for audit log
  const configDiff: Record<string, { before: unknown; after: unknown }> = {};

  const fieldsToTrack = [
    "language",
    "timezone",
    "behavior_preset",
    "agent_type",
    "first_message",
    "emphasis_points",
  ] as const;

  for (const field of fieldsToTrack) {
    const before = existingAgent[field];
    const after = validated[field as keyof typeof validated];

    if (field === "emphasis_points") {
      // Normalize before comparison: handle both array and string (for legacy data)
      const beforeArray = before
        ? Array.isArray(before)
          ? before
          : typeof before === "string"
          ? JSON.parse(before)
          : null
        : null;
      const afterArray = after; // Already an array from validation
      // Compare arrays by JSON stringification for deep equality
      if (JSON.stringify(beforeArray || []) !== JSON.stringify(afterArray || [])) {
        configDiff[field] = { before: beforeArray, after: afterArray };
      }
    } else if (before !== after) {
      configDiff[field] = { before, after };
    }
  }

  // 10) Update agent in database
  const { data: updatedAgent, error: updateErr } = await supabase
    .from("agents")
    .update(updatePayload)
    .eq("id", validated.agentId)
    .eq("org_id", orgId)
    .select("*")
    .single();

  if (updateErr || !updatedAgent) {
    return { ok: false, error: `Database update failed: ${updateErr?.message || "Unknown error"}` };
  }

  // 11) Write audit log if changes detected
  if (Object.keys(configDiff).length > 0) {
    await logAuditEvent({
      org_id: orgId,
      actor_user_id: user.id,
      action: "agent.update",
      entity_type: "agent.configuration",
      entity_id: validated.agentId,
      diff: configDiff,
    });
  }

  // 12) Sync to Vapi (if assistant ID exists)
  let vapiSyncStatus: string | null = null;
  if (updatedAgent.vapi_assistant_id) {
    try {
      // Use override if exists, otherwise use effective prompt
      const systemPromptToUse = updatedAgent.system_prompt_override || effectivePrompt;
      await syncAgentToVapi({
        assistantId: updatedAgent.vapi_assistant_id,
        systemPrompt: systemPromptToUse,
        firstMessage: validated.first_message || updatedAgent.first_message || null,
        language: validated.language || updatedAgent.language || null,
      });

      // Update sync status on success
      await supabase
        .from("agents")
        .update({
          vapi_sync_status: "success",
          vapi_synced_at: new Date().toISOString(),
        })
        .eq("id", validated.agentId)
        .eq("org_id", orgId);

      vapiSyncStatus = "success";
    } catch (vapiErr) {
      const errorMessage = vapiErr instanceof Error ? vapiErr.message : "Unknown Vapi error";
      vapiSyncStatus = `error: ${errorMessage}`;

      // Update sync status on error
      await supabase
        .from("agents")
        .update({
          vapi_sync_status: `error: ${errorMessage}`,
        })
        .eq("id", validated.agentId)
        .eq("org_id", orgId);

      // Log error but don't fail the entire operation
      console.error("[AgentConfig] Vapi sync failed:", errorMessage);
    }
  }

  // Fetch updated agent to return full data
  const { data: finalAgent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", validated.agentId)
    .eq("org_id", orgId)
    .single();

  return {
    ok: true,
    data: {
      agentId: validated.agentId,
      vapiSyncStatus,
      effective_system_prompt: finalAgent?.effective_system_prompt || null,
      language: finalAgent?.language || null,
      timezone: finalAgent?.timezone || null,
      behavior_preset: finalAgent?.behavior_preset || null,
      agent_type: finalAgent?.agent_type || null,
      first_message: finalAgent?.first_message || null,
      emphasis_points: finalAgent?.emphasis_points
        ? Array.isArray(finalAgent.emphasis_points)
          ? finalAgent.emphasis_points
          : typeof finalAgent.emphasis_points === "string"
          ? JSON.parse(finalAgent.emphasis_points)
          : null
        : null,
      vapi_synced_at: finalAgent?.vapi_synced_at || null,
    },
  };
}

/**
 * Sync agent configuration to Vapi assistant
 */
async function syncAgentToVapi(input: {
  assistantId: string;
  systemPrompt: string;
  firstMessage: string | null;
  language: string | null;
}): Promise<void> {
  const updatePayload: Record<string, unknown> = {};

  // Update system prompt in model.messages
  if (input.systemPrompt) {
    updatePayload.model = {
      provider: "openai",
      model: "gpt-4o",
      messages: [{ role: "system", content: input.systemPrompt }],
    };
  }

  // Update first message
  if (input.firstMessage) {
    updatePayload.firstMessage = input.firstMessage;
  }

  // Note: Vapi language support may vary; include if supported
  // For now, we'll update what we can

  await vapiFetch(`/assistant/${input.assistantId}`, {
    method: "PATCH",
    body: JSON.stringify(updatePayload),
  });
}

// Validation schema for system prompt override update
const UpdateAgentPromptOverrideSchema = z.object({
  agentId: z.string().uuid(),
  system_prompt_override: z.string().nullable(),
});

type UpdateAgentPromptOverrideInput = z.infer<typeof UpdateAgentPromptOverrideSchema>;

export type UpdateAgentPromptOverrideResult =
  | {
      ok: true;
      data: {
        agentId: string;
        vapiSyncStatus: string | null;
        effective_system_prompt: string | null;
        system_prompt_override: string | null;
        vapi_synced_at: string | null;
      };
    }
  | { ok: false; error: string };

/**
 * Update agent system prompt override and sync to Vapi
 */
export async function updateAgentPromptOverride(
  input: UpdateAgentPromptOverrideInput
): Promise<UpdateAgentPromptOverrideResult> {
  const supabase = await createSupabaseServerClient();

  // 1) Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized: Please log in" };
  }

  // 2) Get profile with org_id
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single<{ id: string; org_id: string | null; role: string | null }>();

  if (profErr || !profile || !profile.org_id) {
    return { ok: false, error: "Organization not found" };
  }

  // 3) Enforce role-based access (owner/admin only)
  if (profile.role !== "owner" && profile.role !== "admin") {
    return { ok: false, error: "Forbidden: Only owners and admins can update agent settings" };
  }

  const orgId = profile.org_id;

  // 4) Check if workspace is paused (block mutations)
  const paused = await isWorkspacePaused(orgId);
  if (paused) {
    return { ok: false, error: "Workspace is paused. Resume to make changes." };
  }

  // 5) Validate input
  const validation = UpdateAgentPromptOverrideSchema.safeParse(input);
  if (!validation.success) {
    return { ok: false, error: `Validation error: ${validation.error.message}` };
  }

  const validated = validation.data;

  // 5) Fetch existing agent (enforce org ownership)
  const { data: existingAgent, error: fetchErr } = await supabase
    .from("agents")
    .select("*")
    .eq("id", validated.agentId)
    .eq("org_id", orgId)
    .single();

  if (fetchErr || !existingAgent) {
    return { ok: false, error: "Agent not found or unauthorized" };
  }

  // 6) Get organization name for prompt derivation (using orgs table as source of truth)
  const { data: org } = await supabase
    .from("orgs")
    .select("name")
    .eq("id", orgId)
    .single<{ name: string }>();

  const orgName = org?.name || "your company";

  // 7) Derive effective system prompt (if override is cleared, use derived)
  let effectivePrompt = existingAgent.effective_system_prompt || "";
  if (!validated.system_prompt_override || validated.system_prompt_override.trim() === "") {
    // Re-derive prompt from current config
    effectivePrompt = deriveEffectivePrompt({
      orgName,
      agentName: existingAgent.name || "Agent",
      agentType: existingAgent.agent_type || null,
      behaviorPreset: existingAgent.behavior_preset || null,
      emphasisPoints: Array.isArray(existingAgent.emphasis_points)
        ? existingAgent.emphasis_points
        : typeof existingAgent.emphasis_points === "string"
        ? JSON.parse(existingAgent.emphasis_points)
        : null,
      language: existingAgent.language || null,
      timezone: existingAgent.timezone || null,
      firstMessage: existingAgent.first_message || null,
    });
  } else {
    // Override is set, use it as effective
    effectivePrompt = validated.system_prompt_override;
  }

  // 8) Prepare update payload
  const updatePayload: Record<string, unknown> = {
    system_prompt_override: validated.system_prompt_override || null,
    effective_system_prompt: effectivePrompt,
    updated_at: new Date().toISOString(),
  };

  // 9) Compute diff for audit log
  const configDiff: Record<string, { before: unknown; after: unknown }> = {};

  const beforeOverride = existingAgent.system_prompt_override;
  const afterOverride = validated.system_prompt_override;

  if (beforeOverride !== afterOverride) {
    configDiff.system_prompt_override = { before: beforeOverride, after: afterOverride };
  }

  // 10) Update agent in database
  const { data: updatedAgent, error: updateErr } = await supabase
    .from("agents")
    .update(updatePayload)
    .eq("id", validated.agentId)
    .eq("org_id", orgId)
    .select("*")
    .single();

  if (updateErr || !updatedAgent) {
    return { ok: false, error: `Database update failed: ${updateErr?.message || "Unknown error"}` };
  }

  // 11) Write audit log if changes detected
  if (Object.keys(configDiff).length > 0) {
    await logAuditEvent({
      org_id: orgId,
      actor_user_id: user.id,
      action: "agent.update",
      entity_type: "agent.prompt_override",
      entity_id: validated.agentId,
      diff: configDiff,
    });
  }

  // 12) Sync to Vapi (if assistant ID exists)
  let vapiSyncStatus: string | null = null;
  if (updatedAgent.vapi_assistant_id) {
    try {
      // Use override if exists, otherwise use effective prompt
      const systemPromptToUse = updatedAgent.system_prompt_override || effectivePrompt;
      await syncAgentToVapi({
        assistantId: updatedAgent.vapi_assistant_id,
        systemPrompt: systemPromptToUse,
        firstMessage: updatedAgent.first_message || null,
        language: updatedAgent.language || null,
      });

      // Update sync status on success
      await supabase
        .from("agents")
        .update({
          vapi_sync_status: "success",
          vapi_synced_at: new Date().toISOString(),
        })
        .eq("id", validated.agentId)
        .eq("org_id", orgId);

      vapiSyncStatus = "success";
    } catch (vapiErr) {
      const errorMessage = vapiErr instanceof Error ? vapiErr.message : "Unknown Vapi error";
      vapiSyncStatus = `error: ${errorMessage}`;

      // Update sync status on error
      await supabase
        .from("agents")
        .update({
          vapi_sync_status: `error: ${errorMessage}`,
        })
        .eq("id", validated.agentId)
        .eq("org_id", orgId);

      // Log error but don't fail the entire operation
      console.error("[AgentPromptOverride] Vapi sync failed:", errorMessage);
    }
  }

  // Fetch updated agent to return full data
  const { data: finalAgent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", validated.agentId)
    .eq("org_id", orgId)
    .single();

  return {
    ok: true,
    data: {
      agentId: validated.agentId,
      vapiSyncStatus,
      effective_system_prompt: finalAgent?.effective_system_prompt || null,
      system_prompt_override: finalAgent?.system_prompt_override || null,
      vapi_synced_at: finalAgent?.vapi_synced_at || null,
    },
  };
}

