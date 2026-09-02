import { Plug } from "lucide-react";
import { SettingsHero } from "../../_platform/settings/ui";
import { getViewer, roleCan } from "@/lib/auth/permissions";
import { listConnections } from "@/lib/commerce/connections";
import { providerMeta } from "@/lib/commerce/registry";
import { ideasoftRedirectUri } from "@/lib/commerce/providers/ideasoft/oauth";
import { IdeaSoftCard, type CommerceConnectionView } from "./_components/IdeaSoftCard";

export const dynamic = "force-dynamic";

/**
 * Integrations — where a business connects the systems its AI should be able to read.
 *
 * This page was a redirect stub for two sprints, kept deliberately empty because a settings
 * destination advertising "Coming soon" cards is a destination that cannot be used. IdeaSoft is
 * the first real one, so it becomes a page.
 *
 * **Not Channels.** A channel is where a customer talks to the business; an integration is where
 * the business keeps its facts. See `skills/commerce-integrations.md` for why that distinction is
 * load-bearing rather than pedantic.
 */

/** What the callback route told us on the way back from the store's approval page. */
function bannerFor(status: string | undefined, detail: string | undefined) {
  switch (status) {
    case "connected":
      return { tone: "ok" as const, title: "Your store is connected.", detail: undefined };
    case "unverified":
      return {
        tone: "warn" as const,
        title: "Approved, but we could not read the catalogue yet.",
        detail: detail ?? "Check that the API app has read access to Katalog, then press Test.",
      };
    case "denied":
      return { tone: "warn" as const, title: "The approval was declined.", detail };
    case "expired":
      return { tone: "warn" as const, title: "That approval link had expired.", detail };
    case "error":
      return { tone: "critical" as const, title: "The store could not be connected.", detail };
    default:
      return null;
  }
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ideasoft?: string; detail?: string }>;
}) {
  // Next 16: searchParams is a Promise.
  const params = await searchParams;
  const viewer = await getViewer();
  const canManage = roleCan(viewer.role, "manage_integrations");

  const connections = viewer.orgId ? await listConnections(viewer.orgId) : [];
  const ideasoft = connections.find((c) => c.provider === "ideasoft") ?? null;
  const meta = providerMeta("ideasoft");

  const view: CommerceConnectionView | null = ideasoft
    ? {
        id: ideasoft.id,
        storeBaseUrl: ideasoft.storeBaseUrl,
        storeLabel: ideasoft.storeLabel,
        clientId: ideasoft.clientId,
        status: ideasoft.status,
        lastError: ideasoft.lastError,
        lastVerifiedAt: ideasoft.lastVerifiedAt,
        grantedScope: ideasoft.grantedScope,
      }
    : null;

  return (
    <div className="space-y-6 p-6">
      <SettingsHero
        icon={Plug}
        title="Integrations"
        subtitle="Connect the systems your AI should be able to read, so it answers from your real data instead of guessing."
      />

      <IdeaSoftCard
        connection={view}
        redirectUri={ideasoftRedirectUri()}
        credentialPath={meta.credentialPath}
        docsUrl={meta.docsUrl}
        canManage={canManage}
        banner={bannerFor(params.ideasoft, params.detail)}
      />

      {!canManage ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Only an owner or admin can connect a store.
        </p>
      ) : null}
    </div>
  );
}
