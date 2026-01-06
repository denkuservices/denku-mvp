import Link from "next/link";
import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";
import { getWorkspaceGeneral } from "@/app/(app)/dashboard/settings/_actions/workspace";
import { WorkspaceGeneralContent } from "./_components/WorkspaceGeneralContent";
import { WebhooksCard } from "./_components/WebhooksCard";
import { WorkspaceControlsCard } from "./_components/WorkspaceControlsCard";

/**
 * Get webhook URL from environment variable.
 * Uses NEXT_PUBLIC_APP_URL as the single source of truth.
 */
function getWebhookUrl(): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return null;
  }
  // Ensure no trailing slash
  const baseUrl = appUrl.replace(/\/$/, "");
  return `${baseUrl}/api/webhooks/vapi`;
}

export default async function WorkspaceGeneralPage() {
  // Fetch initial data
  const { orgId, role, orgName, settings } = await getWorkspaceGeneral();

  // Compute webhook URL
  const webhookUrl = getWebhookUrl();
  const webhookEvents = ["end-of-call-report", "call-started", "call-ended"];

  // Determine access badge
  const accessLabel = role === "owner" ? "Owner" : role === "admin" ? "Admin" : role || "Member";

  // Get workspace status (default to 'active' if not set)
  const workspaceStatus = (settings?.workspace_status as "active" | "paused") || "active";

  return (
    <SettingsShell
      title="Workspace"
      subtitle="Company identity, defaults, and operational settings."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Workspace" },
        { label: "General" },
      ]}
    >
      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <QuickLink href="/dashboard/settings/workspace/members" label="Members" />
        <QuickLink href="/dashboard/settings/workspace/audit" label="Audit log" />
      </div>

      {/* Top: Identity + Runtime */}
      <WorkspaceGeneralContent
        initialSettings={settings}
        role={role}
        orgId={orgId}
        orgName={orgName}
        accessLabel={accessLabel}
        workspaceStatus={workspaceStatus}
      />

      {/* Webhooks */}
      <WebhooksCard webhookUrl={webhookUrl} events={webhookEvents} />

      {/* Workspace controls */}
      <WorkspaceControlsCard role={role} workspaceStatus={workspaceStatus} />
    </SettingsShell>
  );
}

/* ----------------------------- UI bits ----------------------------- */

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
    >
      {label}
    </Link>
  );
}
