import { redirect } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";

/**
 * The system prompt override moved into Setup → Advanced (Sprint 10 · R-094).
 *
 * It is still the one place "agent" language is sanctioned and still the one control that can
 * override everything else, so it kept its own disclosure — it just no longer lives a page away
 * from the employee it belongs to. This URL redirects to that tab.
 *
 * With the platform experience off it forwards to the legacy agent detail; the override editor
 * itself is not available on that path (see the Sprint 10 report).
 */
export default async function SettingsAgentAdvancedPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  redirect(platformUxEnabled() ? `/dashboard/team/${agentId}?tab=setup` : `/dashboard/agents/${agentId}`);
}
