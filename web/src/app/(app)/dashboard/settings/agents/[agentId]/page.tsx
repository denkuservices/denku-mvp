import { redirect } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";

/**
 * Employee configuration moved onto the employee (Sprint 10 · R-094).
 *
 * This page owned the editor while the employee's own Setup tab showed a read-only mirror of it;
 * the phone line's Advanced tab wrote the same row through the same action. One door now: AI Team
 * → the employee → Setup. The URL redirects there so nothing that ever shipped breaks.
 *
 * Falls back to the legacy agent detail when the platform experience is off, so the rollback path
 * never redirects into a 404.
 */
export default async function SettingsAgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  redirect(platformUxEnabled() ? `/dashboard/team/${agentId}?tab=setup` : `/dashboard/agents/${agentId}`);
}
