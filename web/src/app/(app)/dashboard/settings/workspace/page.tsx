import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getWorkspaceGeneral } from "@/app/(app)/dashboard/settings/_actions/workspace";
import { PausedWorkspaceBanner } from "@/app/(app)/dashboard/_components/PausedWorkspaceBanner";
import { WorkspaceGeneralContent } from "./general/_components/WorkspaceGeneralContent";
import { WebhooksCard } from "./general/_components/WebhooksCard";
import { WorkspaceControlsCard } from "./general/_components/WorkspaceControlsCard";
import MembersSection from "./_components/MembersSection";

export const dynamic = "force-dynamic";

/** The webhook URL we tell customers to point integrations at. */
function getWebhookUrl(): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return null;
  return `${appUrl.replace(/\/$/, "")}/api/webhooks/vapi`;
}

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-navy-700 dark:text-white">{title}</h2>
        {hint ? <p className="mt-0.5 text-sm text-gray-500">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Workspace — identity, access and controls on one page (Settings 9 → 4).
 *
 * General and Members were separate routes joined by quick-links, each with its own back button,
 * breadcrumb trail and shell — three navigation affordances on top of the settings rail that
 * already lists both. They are sections here.
 *
 * The **audit log stays its own page** and is linked rather than embedded: it is a paginated
 * record, not a setting, and inlining it would give this page no bottom.
 */
export default async function WorkspaceSettingsPage() {
  const { orgId, role, orgName, settings } = await getWorkspaceGeneral();

  const accessLabel = role === "owner" ? "Owner" : role === "admin" ? "Admin" : role || "Member";
  const workspaceStatus = (settings?.workspace_status as "active" | "paused") || "active";
  const pausedReason = settings?.paused_reason as "manual" | "hard_cap" | "past_due" | null | undefined;

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy-700 dark:text-white">Workspace</h1>
        <p className="mt-1 text-sm text-gray-500">Your business, who can access it, and how it runs.</p>
      </div>

      <PausedWorkspaceBanner workspaceStatus={workspaceStatus} />

      <Section id="identity" title="Identity">
        <WorkspaceGeneralContent
          initialSettings={settings}
          role={role}
          orgId={orgId}
          orgName={orgName}
          accessLabel={accessLabel}
          workspaceStatus={workspaceStatus}
        />
      </Section>

      <Section id="members" title="Members" hint="Who can sign in to this workspace.">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-navy-800">
          <MembersSection />
        </div>
      </Section>

      <Section id="controls" title="Controls">
        <div className="space-y-6">
          <WorkspaceControlsCard role={role} workspaceStatus={workspaceStatus} pausedReason={pausedReason} />
          <WebhooksCard webhookUrl={getWebhookUrl()} events={["end-of-call-report", "call-started", "call-ended"]} />
        </div>
      </Section>

      <Link
        href="/dashboard/settings/workspace/audit"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 transition hover:underline dark:text-brand-300"
      >
        View the audit log <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
