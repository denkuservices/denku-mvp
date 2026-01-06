import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveOrgId } from "@/lib/analytics/params";
import { isAdminOrOwner } from "@/lib/analytics/params";
import { getWorkspaceStatus } from "@/lib/workspace-status";
import { getTicketDetail, getDistinctStatuses, getDistinctPriorities } from "@/lib/tickets/queries";
import { formatDateInTZ, formatTimeAgo } from "@/lib/tickets/utils.client";
import { getOrgTimezone } from "@/lib/tickets/utils.server";
import { TicketDetailQuickActions } from "@/components/tickets/TicketDetailQuickActions";
import { TicketDetailForm } from "@/components/tickets/TicketDetailForm";
import { TicketPrimaryAction } from "@/components/tickets/TicketPrimaryAction";
import { TicketComments } from "@/components/tickets/TicketComments";
import { TicketActivity } from "@/components/tickets/TicketActivity";
import { CopyButton } from "@/components/tickets/CopyButton";
import { listTicketComments } from "@/lib/tickets/comments.queries";
import { listTicketActivity } from "@/lib/tickets/activity.queries";
import { Phone, DollarSign, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const resolvedParams = await params;
  const { ticketId } = resolvedParams;

  // Resolve org and user
  const orgId = await resolveOrgId();
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? "";

  // Get user role and workspace status
  const canMutate = userId ? await isAdminOrOwner(orgId, userId) : false;
  const workspaceStatus = await getWorkspaceStatus(orgId);
  const isPaused = workspaceStatus === "paused";

  // Get timezone for date formatting
  const timezone = await getOrgTimezone(orgId);

  // Fetch ticket detail and filter options
  let ticketDetail;
  try {
    ticketDetail = await getTicketDetail(orgId, ticketId);
  } catch (error) {
    notFound();
  }

  const [statusOptions, priorityOptions, comments, activities] = await Promise.all([
    getDistinctStatuses(orgId),
    getDistinctPriorities(orgId),
    listTicketComments({ orgId, ticketId }),
    listTicketActivity({ orgId, ticketId, limit: 50 }).catch(() => []), // Non-blocking error handling
  ]);

  const { ticket, lead, call, agent } = ticketDetail;

  // Helper to format lead source (brand-safe: never show "vapi" in UI)
  const formatLeadSource = (source: string | null): string => {
    if (!source) return "—";
    const lower = source.toLowerCase();
    switch (lower) {
      case "web":
        return "Web";
      case "inbound_call":
        return "Inbound call";
      case "vapi":
        return "Phone call"; // Map vapi to Phone call (brand-safe)
      case "referral":
        return "Referral";
      case "import":
        return "Import";
      default:
        return "Other"; // Unknown sources show as "Other" (brand-safe)
    }
  };

  // Helper to format lead status
  const formatLeadStatus = (status: string | null): string => {
    if (!status) return "—";
    const lower = status.toLowerCase();
    switch (lower) {
      case "new":
        return "New";
      case "contacted":
        return "Contacted";
      case "qualified":
        return "Qualified";
      case "unqualified":
        return "Unqualified";
      default:
        return status;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Workspace Paused Banner */}
      {isPaused && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Workspace is paused. Changes are disabled.</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <Link href="/dashboard/tickets" className="text-sm text-muted-foreground hover:underline">
              Tickets
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <h1 className="text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <TicketDetailQuickActions
              ticketId={ticket.id}
              orgId={orgId}
              userId={userId}
              currentStatus={ticket.status}
              currentPriority={ticket.priority}
              statusOptions={statusOptions}
              priorityOptions={priorityOptions}
              canMutate={canMutate}
              isPaused={isPaused}
            />
            <div className="text-xs text-muted-foreground" title={formatDateInTZ(ticket.updated_at, timezone)}>
              Last updated {formatTimeAgo(ticket.updated_at)}
            </div>
          </div>
        </div>
        <TicketPrimaryAction
          ticketId={ticket.id}
          orgId={orgId}
          userId={userId}
          currentStatus={ticket.status}
          canMutate={canMutate}
          isPaused={isPaused}
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Summary + Activity + Notes */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Card */}
          <div className="rounded-xl border bg-white p-4 space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Subject</p>
              {canMutate && !isPaused ? (
                <TicketDetailForm
                  ticketId={ticket.id}
                  orgId={orgId}
                  userId={userId}
                  field="subject"
                  value={ticket.subject}
                  label="Subject"
                />
              ) : (
                <p className="text-sm font-medium">{ticket.subject}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Created</p>
                <p className="text-sm text-muted-foreground">{formatDateInTZ(ticket.created_at, timezone)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Last updated</p>
                <p className="text-sm text-muted-foreground">{formatDateInTZ(ticket.updated_at, timezone)}</p>
              </div>
            </div>
          </div>

          {/* Activity Timeline */}
          <TicketActivity activities={activities} timezone={timezone} />

          {/* Notes Section (formerly Comments) */}
          <TicketComments
            ticketId={ticket.id}
            orgId={orgId}
            userId={userId}
            comments={comments}
            timezone={timezone}
            canMutate={canMutate}
            isPaused={isPaused}
          />
        </div>

        {/* Right Column: Related Data */}
        <div className="space-y-6">
          {/* Linked Lead Card */}
          {lead && (
            <div className="rounded-xl border bg-white p-4 space-y-3">
              <p className="text-sm font-medium">Linked Lead</p>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="text-sm font-medium">{lead.name || "—"}</p>
                </div>
                {lead.phone && (
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <Link
                      href={`/dashboard/leads/${lead.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {lead.phone}
                    </Link>
                  </div>
                )}
                {lead.email && (
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <Link
                      href={`/dashboard/leads/${lead.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {lead.email}
                    </Link>
                  </div>
                )}
                <div className="flex items-center gap-4 pt-1">
                  {lead.source && (
                    <div>
                      <p className="text-xs text-muted-foreground">Source</p>
                      <p className="text-xs">{formatLeadSource(lead.source)}</p>
                    </div>
                  )}
                  {lead.status && (
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="text-xs">{formatLeadStatus(lead.status)}</p>
                    </div>
                  )}
                </div>
                <div className="pt-2 border-t">
                  <Link
                    href={`/dashboard/leads/${lead.id}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View lead →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Linked Call Card */}
          {call && (
            <div className="rounded-xl border bg-white p-4 space-y-3">
              <p className="text-sm font-medium">Linked Call</p>
              <div className="space-y-2">
                {call.started_at && (
                  <div>
                    <p className="text-xs text-muted-foreground">Started</p>
                    <p className="text-sm">{formatDateInTZ(call.started_at, timezone)}</p>
                  </div>
                )}
                {call.duration_seconds !== null && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Duration</p>
                      <p className="text-sm">
                        {call.duration_seconds < 60
                          ? `${call.duration_seconds}s`
                          : `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s`}
                      </p>
                    </div>
                  </div>
                )}
                {call.cost_usd !== null && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Cost</p>
                      <p className="text-sm">${call.cost_usd.toFixed(4)}</p>
                    </div>
                  </div>
                )}
                {call.outcome && (
                  <div>
                    <p className="text-xs text-muted-foreground">Outcome</p>
                    <p className="text-sm">{call.outcome}</p>
                  </div>
                )}
                {agent && (
                  <div>
                    <p className="text-xs text-muted-foreground">Agent</p>
                    <p className="text-sm">{agent.name ?? "—"}</p>
                  </div>
                )}
                <div className="pt-2 border-t">
                  <Link
                    href={`/dashboard/calls/${call.id}`}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <Phone className="h-3 w-3" />
                    View call →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Metadata Card (Reduced Prominence) */}
          <div className="rounded-xl border bg-white p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Metadata</p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-mono text-muted-foreground truncate">{ticket.id}</p>
              <CopyButton text={ticket.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
