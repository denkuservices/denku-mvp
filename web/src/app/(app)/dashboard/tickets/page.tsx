import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listTickets, getDistinctStatuses, getDistinctPriorities } from "@/lib/tickets/queries";
import { resolveOrgId } from "@/lib/analytics/params";
import { isAdminOrOwner } from "@/lib/analytics/params";
import { getWorkspaceStatus } from "@/lib/workspace-status";
import { formatDateInTZ } from "@/lib/tickets/utils.client";
import { getOrgTimezone } from "@/lib/tickets/utils.server";
import { TicketFilters } from "@/components/tickets/TicketFilters";
import { StatusBadge, PriorityBadge } from "@/components/tickets/TicketBadges";
import { TicketQuickActions } from "@/components/tickets/TicketQuickActions";
import { Phone } from "lucide-react";

function asString(v: string | string[] | undefined) {
  if (!v) return "";
  return Array.isArray(v) ? v[0] : v;
}

export const dynamic = "force-dynamic";

export default async function TicketsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Next.js 16.1.1: searchParams must be awaited before accessing properties
  const sp = searchParams ? await searchParams : undefined;
  const q = asString(sp?.q).trim();
  const status = asString(sp?.status).trim();
  const priority = asString(sp?.priority).trim();
  const page = Math.max(1, parseInt(asString(sp?.page) || "1", 10));
  const pageSize = Math.min(50, Math.max(10, parseInt(asString(sp?.pageSize) || "50", 10)));

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

  // Fetch data
  const [ticketsResult, statusOptions, priorityOptions] = await Promise.all([
    listTickets({
      orgId,
      page,
      pageSize,
      q: q || undefined,
      status: status || undefined,
      priority: priority || undefined,
    }),
    getDistinctStatuses(orgId),
    getDistinctPriorities(orgId),
  ]);

  const { rows, total, totalPages } = ticketsResult;

  // Calculate KPIs
  const openCount = rows.filter((item) => {
    const s = item.ticket.status.toLowerCase();
    return s === "open" || s === "in_progress";
  }).length;

  const needsAttentionCount = rows.filter((item) => {
    const s = item.ticket.status.toLowerCase();
    const p = item.ticket.priority.toLowerCase();
    return (s === "open" || s === "in_progress") && (p === "high" || p === "urgent");
  }).length;

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
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
          <p className="text-sm text-muted-foreground">
            Operational follow-ups and escalations created from calls and lead activity.
          </p>
        </div>

        {canMutate && (
          isPaused ? (
            <span
              className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white opacity-60 cursor-not-allowed"
              title="Workspace is paused"
            >
              New ticket
            </span>
          ) : (
            <Link
              href="/dashboard/tickets/new"
              className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              title="Create new ticket"
            >
              New ticket
            </Link>
          )
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Open</p>
          <p className="mt-1 text-2xl font-semibold">{openCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Requires attention</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Needs attention</p>
          <p className="mt-1 text-2xl font-semibold">{needsAttentionCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Open + High/Urgent priority</p>
        </div>
      </div>

      {/* Filters */}
      <TicketFilters
        initialQ={q}
        initialStatus={status}
        initialPriority={priority}
        statusOptions={statusOptions}
        priorityOptions={priorityOptions}
      />

      {/* Table */}
      <div className="rounded-xl border bg-white">
        <div className="border-b p-4">
          <p className="text-sm font-medium">Results</p>
          <p className="text-xs text-muted-foreground">
            {total} ticket{total !== 1 ? "s" : ""}
            {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium">No tickets found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {q || status || priority ? "Try adjusting your filters." : "Create your first ticket to get started."}
            </p>
            {canMutate && !isPaused && (
              <Link
                href="/dashboard/tickets/new"
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                New ticket
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const { ticket, lead, call } = item;
                  return (
                    <tr
                      key={ticket.id}
                      className="border-b last:border-b-0 hover:bg-zinc-50"
                    >
                      <td className="px-4 py-3">
                        {/* RSC: Cannot pass onClick handlers from Server to Client. Use Link for navigation instead. */}
                        <Link href={`/dashboard/tickets/${ticket.id}`} className="block">
                          <div className="font-medium">{ticket.subject}</div>
                          <div className="text-xs text-muted-foreground">Ticket ID: {ticket.id.slice(0, 8)}...</div>
                        </Link>
                      </td>

                      <td className="px-4 py-3">
                        {lead ? (
                          <div>
                            <div className="font-medium">{lead.name || "—"}</div>
                            {lead.phone && (
                              <div className="text-xs text-muted-foreground">{lead.phone}</div>
                            )}
                            {lead.email && (
                              <div className="text-xs text-muted-foreground">{lead.email}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge status={ticket.status} />
                      </td>

                      <td className="px-4 py-3">
                        <PriorityBadge priority={ticket.priority} />
                      </td>

                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDateInTZ(ticket.created_at, timezone)}
                      </td>

                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDateInTZ(ticket.updated_at, timezone)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {/* RSC: No onClick handlers needed - Links handle navigation natively */}
                        <div className="flex items-center justify-end gap-2">
                          {call && (
                            <Link
                              href={`/dashboard/calls/${call.id}`}
                              className="rounded-md border bg-white p-1.5 hover:bg-zinc-50"
                              title="View call"
                            >
                              <Phone className="h-4 w-4" />
                            </Link>
                          )}
                          {canMutate && (
                            <TicketQuickActions
                              ticketId={ticket.id}
                              orgId={orgId}
                              userId={userId}
                              currentStatus={ticket.status}
                              currentPriority={ticket.priority}
                              statusOptions={statusOptions}
                              priorityOptions={priorityOptions}
                              canMutate={!isPaused}
                            />
                          )}
                          <Link
                            href={`/dashboard/tickets/${ticket.id}`}
                            className="rounded-md border bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
                          >
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t p-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total}
            </div>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/dashboard/tickets?${new URLSearchParams({
                    ...(q && { q }),
                    ...(status && { status }),
                    ...(priority && { priority }),
                    page: String(page - 1),
                  }).toString()}`}
                  className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/dashboard/tickets?${new URLSearchParams({
                    ...(q && { q }),
                    ...(status && { status }),
                    ...(priority && { priority }),
                    page: String(page + 1),
                  }).toString()}`}
                  className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
