import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/currentUser";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listConnections } from "@/lib/email/channel/connections";
import { inboundDomain } from "@/lib/email/channel/address";
import { getDomainRecords, type DnsRecord } from "@/lib/email/channel/domains";
import { llmConfigured } from "@/lib/llm/provider";
import EmployeeAssignmentNotice from "../../_platform/channels/EmployeeAssignmentNotice";
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
  const user = await getCachedUser();

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

  /**
   * The DNS records the customer must publish, fetched here rather than left to the client.
   *
   * The card used to tell them to "add the records from your Resend dashboard" — a dashboard
   * they cannot open, because Resend is Denku's account, not theirs. Without this the whole
   * sending setup dead-ends on a step nobody outside Denku can perform.
   *
   * Only fetched while there is something to do: a verified domain needs no instructions.
   */
  let dnsRecords: DnsRecord[] = [];
  if (connection?.resendDomainId && connection.sendingDomainStatus !== "verified") {
    dnsRecords = await getDomainRecords(connection.resendDomainId);
  }

  const receivingConfigured = Boolean(inboundDomain());

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/dashboard/channels"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-brand-500"
      >
        <ArrowLeft className="h-4 w-4" /> Channels
      </Link>
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

      <EmployeeAssignmentNotice
        employeeCount={employees.length}
        assignedAgentId={connection?.assignedAgentId ?? null}
        channelLabel="Email"
        connected={Boolean(connection)}
      />

      <EmailConnectionCard
        connection={
          connection
            ? {
                id: connection.id,
                inboundAddress: connection.inboundAddress,
                forwardFromAddress: connection.forwardFromAddress,
                forwardVerifiedAt: connection.forwardVerifiedAt,
                forwardVerificationCode: connection.forwardVerificationCode,
                forwardVerificationUrl: connection.forwardVerificationUrl,
                sendingDomain: connection.sendingDomain,
                sendingDomainStatus: connection.sendingDomainStatus,
                fromAddress: connection.fromAddress,
                fromName: connection.fromName,
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
        dnsRecords={dnsRecords}
      />
    </div>
  );
}
