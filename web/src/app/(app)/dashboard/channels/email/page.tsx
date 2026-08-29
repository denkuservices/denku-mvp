import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listConnections } from "@/lib/email/channel/connections";
import { inboundDomain } from "@/lib/email/channel/address";
import { llmConfigured } from "@/lib/llm/provider";
import PageHeader from "../../_platform/PageHeader";
import { EmailConnectionCard, type EmployeeOption } from "./_components/EmailConnectionCard";

export const dynamic = "force-dynamic";

/**
 * Email channel surface: forward a business address here, choose who answers on it.
 *
 * Reached from Settings → Channels, never from the sidebar — connecting a channel is
 * configuration you do once, and a nav item per channel is what stops the sidebar from surviving
 * WhatsApp and SMS (see skills/platform-architecture.md).
 */
export default async function EmailPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let orgId: string | null = null;
  let canManage = false;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, role")
      .eq("auth_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ org_id: string | null; role: string | null }>();

    orgId = profile?.org_id ?? null;
    canManage = profile?.role === "owner" || profile?.role === "admin";
  }

  const connections = orgId ? await listConnections(orgId) : [];
  const connection = connections[0] ?? null;

  let employees: EmployeeOption[] = [];
  if (orgId) {
    const { data } = await supabaseAdmin
      .from("agents")
      .select("id, name")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });
    employees = (data ?? []).map((a) => ({ id: a.id as string, name: (a.name as string) || "Assistant" }));
  }

  const receivingConfigured = Boolean(inboundDomain());

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Email"
        subtitle="Forward a customer-facing address like info@ to Denku. Every email becomes a conversation in your Inbox, where your AI Employee drafts a reply for you to send — or you write it yourself."
      />

      {/* Issuing an address at a domain that receives nothing would send the customer off to
          configure forwarding into a black hole, then blame their own mail settings. */}
      {!receivingConfigured ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Email receiving is not configured on this environment yet. Contact support before
          connecting an address.
        </div>
      ) : null}

      {!llmConfigured() ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          No AI model is configured on this environment yet, so forwarded email would arrive
          without a drafted reply. Contact support before connecting.
        </div>
      ) : null}

      {!canManage ? (
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
          Only owners and admins can connect an email address.
        </div>
      ) : null}

      <EmailConnectionCard
        connection={
          connection
            ? {
                id: connection.id,
                inboundAddress: connection.inboundAddress,
                forwardFromAddress: connection.forwardFromAddress,
                forwardVerifiedAt: connection.forwardVerifiedAt,
                sendingDomain: connection.sendingDomain,
                sendingDomainStatus: connection.sendingDomainStatus,
                replyMode: connection.replyMode,
                status: connection.status,
                lastError: connection.lastError,
                lastInboundAt: connection.lastInboundAt,
                assignedAgentId: connection.assignedAgentId,
              }
            : null
        }
        employees={employees}
        canManage={canManage}
      />
    </div>
  );
}
