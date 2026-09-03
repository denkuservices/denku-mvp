import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/org/getActiveOrgId";
import { listConnectedChannelViews } from "@/lib/platform/readModel/channels";
import { getActiveConnection } from "@/lib/commerce/connections";
import { LANGUAGES, toLanguageCode } from "@/lib/language/registry";
import { parseBusinessHours } from "@/lib/business-hours/schema";
import { buildWorkspaceLaunchpad, type WorkspaceLaunchpadModel } from "./workspaceLaunchpadModel";

type SettingsRow = {
  default_timezone: string | null;
  business_hours: unknown;
  onboarding_language: string | null;
  onboarding_goal: string | null;
  business_description: string | null;
  main_agent_id: string | null;
};

type AgentRow = {
  id: string;
  name: string | null;
  language: string | null;
  first_message: string | null;
  emphasis_points: unknown;
  business_context: unknown;
};

/**
 * Read first-run progress without ever blocking the dashboard. Every service-role read is scoped
 * to the active org before its result is used; failures degrade to an absent launchpad.
 */
export async function getWorkspaceLaunchpad(): Promise<WorkspaceLaunchpadModel | null> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return null;

    const [org, settings, agents, channels, businessTool, members, conversations, calls] = await Promise.all([
      supabaseAdmin.from("orgs").select("name").eq("id", orgId).maybeSingle<{ name: string | null }>(),
      supabaseAdmin
        .from("organization_settings")
        .select(
          "default_timezone, business_hours, onboarding_language, onboarding_goal, business_description, main_agent_id"
        )
        .eq("org_id", orgId)
        .maybeSingle<SettingsRow>(),
      supabaseAdmin
        .from("agents")
        .select("id, name, language, first_message, emphasis_points, business_context")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true })
        .limit(20),
      listConnectedChannelViews(orgId),
      getActiveConnection(orgId),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      supabaseAdmin.from("conversations").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      supabaseAdmin.from("calls").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    ]);

    const settingsRow = settings.data ?? null;
    const agentRows = (agents.data ?? []) as AgentRow[];
    const agent =
      agentRows.find((row) => row.id === settingsRow?.main_agent_id) ?? agentRows[0] ?? null;
    const connectedChannels = channels.filter((channel) => {
      const health = channel.meta?.health as { actionRequired?: boolean } | undefined;
      return channel.status === "connected" && !health?.actionRequired;
    });
    const languageCode = toLanguageCode(settingsRow?.onboarding_language ?? agent?.language ?? null);
    const languageLabel = languageCode ? LANGUAGES[languageCode].label : null;

    return buildWorkspaceLaunchpad({
      orgName: org.data?.name ?? "",
      languageLabel,
      onboardingGoal: settingsRow?.onboarding_goal ?? null,
      businessDescription: settingsRow?.business_description ?? null,
      agentId: agent?.id ?? null,
      agentName: agent?.name ?? null,
      firstMessage: agent?.first_message ?? null,
      emphasisPoints: agent?.emphasis_points ?? null,
      businessContext: agent?.business_context ?? null,
      defaultTimezone: settingsRow?.default_timezone ?? null,
      businessHoursConfigured: parseBusinessHours(settingsRow?.business_hours) !== null,
      connectedChannelLabels: [...new Set(connectedChannels.map((channel) => channel.label))],
      conversationCount: Math.max(conversations.count ?? 0, calls.count ?? 0),
      connectedBusinessTool: Boolean(businessTool),
      memberCount: members.count ?? 0,
    });
  } catch (error) {
    console.error("[WORKSPACE_LAUNCHPAD][FAILED]", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
