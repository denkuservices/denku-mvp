import {
  Building2,
  CreditCard,
  History,
  ScrollText,
  ShieldAlert,
  UserRound,
  Users,
  Webhook,
} from "lucide-react";
import { getWorkspaceGeneral } from "@/app/(app)/dashboard/settings/_actions/workspace";
import { PausedWorkspaceBanner } from "@/app/(app)/dashboard/_components/PausedWorkspaceBanner";
import { supabaseAdmin } from "@/lib/supabase/admin";
import Avatar from "@/app/(app)/dashboard/_platform/Avatar";
import {
  Panel,
  PanelHeader,
  SettingsHero,
  SettingsLinkButton,
  SettingsSection,
  StatusPill,
} from "@/app/(app)/dashboard/_platform/settings/ui";
import { WorkspaceGeneralForm } from "./general/_components/WorkspaceGeneralForm";
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

/**
 * The plan code, for the header pill only.
 *
 * `org_plan_limits.plan_code IS NULL` is the definition of preview mode (the same source of truth
 * `isPreviewMode` reads). Service-role, so the `org_id` filter is the only thing standing between
 * this and a cross-tenant read — it is not optional. Failure is silent by design: a missing pill
 * is a cosmetic loss, and a settings page that 500s because a decoration failed is a real one.
 */
async function getPlanCode(orgId: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("org_plan_limits")
      .select("plan_code")
      .eq("org_id", orgId)
      .maybeSingle<{ plan_code: string | null }>();
    return data?.plan_code ?? null;
  } catch {
    return null;
  }
}

/**
 * Workspace — identity, access and controls on one page (Settings 9 → 4).
 *
 * General and Members were separate routes joined by quick-links, each with its own back button,
 * breadcrumb trail and shell — three navigation affordances on top of the settings rail that
 * already lists both. They are sections here.
 *
 * **The visual pass.** Two things changed beyond skin. First, the *Runtime* card is gone: it was a
 * white box whose entire content was "Status: Active" and "Access: Owner" — two facts a customer
 * wants on arrival, parked below the fold in the least prominent shape on the page. They are
 * header pills now, alongside the plan, and the card (plus the `window.__updateRuntime…` global
 * that kept it in sync) went with them. Second, **pausing the workspace moved into a danger
 * zone**. It stops inbound calls being answered; it was rendered in the same neutral card as the
 * webhook URL, which is a control that reads as a preference.
 *
 * The **audit log stays its own page** and is linked rather than embedded: it is a paginated
 * record, not a setting, and inlining it would give this page no bottom. It is now a card with a
 * reason to click rather than a bare link under the last section.
 */
export default async function WorkspaceSettingsPage() {
  const { orgId, role, orgName, settings } = await getWorkspaceGeneral();

  const accessLabel = role === "owner" ? "Owner" : role === "admin" ? "Admin" : role || "Member";
  const workspaceStatus = (settings?.workspace_status as "active" | "paused") || "active";
  const pausedReason = settings?.paused_reason as "manual" | "hard_cap" | "past_due" | null | undefined;
  const planCode = await getPlanCode(orgId);
  const displayName = orgName?.trim() || "Your workspace";

  return (
    <div className="space-y-8">
      <SettingsHero
        icon={Building2}
        badge={<Avatar name={displayName} seed={orgId} size="lg" />}
        title={displayName}
        subtitle="Your business, who can access it, and how it runs."
        pills={
          <>
            <StatusPill tone={workspaceStatus === "active" ? "ok" : "warn"} dot>
              {workspaceStatus === "active" ? "Active" : "Paused"}
            </StatusPill>
            <StatusPill tone="neutral" icon={UserRound}>
              {accessLabel}
            </StatusPill>
            <StatusPill tone={planCode ? "brand" : "warn"} icon={CreditCard}>
              {planCode ? `${planCode[0].toUpperCase()}${planCode.slice(1)} plan` : "No plan yet"}
            </StatusPill>
          </>
        }
        action={
          <SettingsLinkButton href="/dashboard/settings/workspace/billing" variant="secondary">
            <CreditCard />
            Billing &amp; usage
          </SettingsLinkButton>
        }
      />

      <PausedWorkspaceBanner workspaceStatus={workspaceStatus} />

      <SettingsSection
        id="identity"
        icon={Building2}
        title="Identity"
        hint="How your AI introduces your business, and the defaults it starts from."
      >
        <Panel>
          <WorkspaceGeneralForm
            initialSettings={settings}
            role={role}
            orgId={orgId}
            orgName={orgName}
          />
        </Panel>
      </SettingsSection>

      <SettingsSection
        id="members"
        icon={Users}
        title="Members"
        hint="Who can sign in to this workspace."
      >
        <Panel padded={false}>
          <MembersSection />
        </Panel>
      </SettingsSection>

      <SettingsSection
        id="developers"
        icon={Webhook}
        title="Developers"
        hint="Wire Denku into your own systems."
      >
        <WebhooksCard
          webhookUrl={getWebhookUrl()}
          events={["end-of-call-report", "call-started", "call-ended"]}
        />
      </SettingsSection>

      <SettingsSection
        id="activity"
        icon={History}
        title="Activity"
        hint="A record of what changed, and who changed it."
      >
        <Panel>
          <PanelHeader
            icon={ScrollText}
            tone="info"
            title="Audit log"
            description="Every settings change, plan change and member action, with the value before and after."
            action={
              <SettingsLinkButton href="/dashboard/settings/workspace/audit" variant="secondary">
                <History />
                Open
              </SettingsLinkButton>
            }
          />
        </Panel>
      </SettingsSection>

      <SettingsSection
        id="danger"
        icon={ShieldAlert}
        title="Danger zone"
        hint="These controls change whether your AI answers at all."
      >
        <WorkspaceControlsCard
          role={role}
          workspaceStatus={workspaceStatus}
          pausedReason={pausedReason}
        />
      </SettingsSection>
    </div>
  );
}
