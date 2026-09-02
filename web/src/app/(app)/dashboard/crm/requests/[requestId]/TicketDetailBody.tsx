import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Clock, DollarSign, Phone } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveOrgId, isAdminOrOwner } from "@/lib/analytics/params";
import { getWorkspaceStatus } from "@/lib/workspace-status";
import {
  getTicketDetail,
  getDistinctStatuses,
  getDistinctPriorities,
  listCustomerRequestHistory,
} from "@/lib/tickets/queries";
import { formatDateInTZ, formatTimeAgo } from "@/lib/tickets/utils.client";
import { getOrgTimezone } from "@/lib/tickets/utils.server";
import { TicketDetailQuickActions } from "@/components/tickets/TicketDetailQuickActions";
import { TicketDetailForm } from "@/components/tickets/TicketDetailForm";
import { TicketPrimaryAction } from "@/components/tickets/TicketPrimaryAction";
import { TicketComments } from "@/components/tickets/TicketComments";
import { TicketActivity } from "@/components/tickets/TicketActivity";
import { CopyButton } from "@/components/tickets/CopyButton";
import { TicketRequester } from "@/components/tickets/TicketRequester";
import { listTicketComments } from "@/lib/tickets/comments.queries";
import { listTicketActivity } from "@/lib/tickets/activity.queries";
import { Surface, Pill } from "../../../_platform/ui";
import RequestIcon from "../../../_platform/crm/RequestIcon";
import TranscriptPanel from "../../../_platform/crm/TranscriptPanel";

/**
 * The ticket half of the unified Request detail.
 *
 * **Rebuilt in Sprint 14 for two reasons, and the second one is the real one.**
 *
 * *Theme.* It was moved here verbatim from the legacy `/dashboard/tickets/[ticketId]` page, which
 * meant it also brought the legacy design system with it: raw shadcn `rounded-xl border bg-white`
 * panels and `text-muted-foreground`, sitting inside a section built entirely from the platform's
 * `Surface`/`Pill` primitives. One click from Requests changed the visual language of the product.
 * It now renders through the same primitives as everything around it — dark mode included, which
 * the hardcoded `bg-white` panels never supported.
 *
 * *Content.* It rendered the subject, two timestamps, a call cost and an id, and **never rendered
 * `tickets.description` at all**. For a ticket the voice webhook raises deterministically — no
 * tool call, a templated "Support Request" subject, an empty description — that left a page which
 * proved a ticket existed and said nothing about why. The transcript of the call that caused it
 * was one join away and is now the body of the page.
 *
 * Everything that could mutate the ticket — status and priority transitions, the subject editor,
 * comments, the activity log — is unchanged and still owned by the same components.
 */
export default async function TicketDetailBody({ ticketId }: { ticketId: string }) {
  const orgId = await resolveOrgId();
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? "";

  const canMutate = userId ? await isAdminOrOwner(orgId, userId) : false;
  const workspaceStatus = await getWorkspaceStatus(orgId);
  const isPaused = workspaceStatus === "paused";
  const timezone = await getOrgTimezone(orgId);

  let ticketDetail;
  try {
    ticketDetail = await getTicketDetail(orgId, ticketId);
  } catch {
    notFound();
  }

  const [statusOptions, priorityOptions, comments, activities] = await Promise.all([
    getDistinctStatuses(orgId),
    getDistinctPriorities(orgId),
    listTicketComments({ orgId, ticketId }),
    listTicketActivity({ orgId, ticketId, limit: 50 }).catch(() => []),
  ]);

  const { ticket, lead, call, agent } = ticketDetail;

  // Whether this caller has been here before is the first thing a person needs and the last thing
  // the page used to say. Loaded after the ticket because it depends on its links.
  const history = await listCustomerRequestHistory(orgId, {
    leadId: ticket.lead_id ?? null,
    contactId: (ticket as { contact_id?: string | null }).contact_id ?? null,
    excludeTicketId: ticket.id,
  });

  /** Brand-safe: the provider's name is never a thing a customer reads (CLAUDE.md). */
  const formatLeadSource = (source: string | null): string => {
    switch ((source ?? "").toLowerCase()) {
      case "web":
        return "Web";
      case "inbound_call":
      case "vapi":
        return "Phone call";
      case "referral":
        return "Referral";
      case "import":
        return "Import";
      default:
        return source ? "Other" : "—";
    }
  };

  const statusTone =
    ["closed", "resolved", "completed"].includes((ticket.status ?? "").toLowerCase())
      ? "ok"
      : ["open", "new"].includes((ticket.status ?? "").toLowerCase())
        ? "info"
        : "neutral";

  /*
   * WHO the request is from, as the page's title.
   *
   * The subject stays — it is editable and sometimes meaningful — but it is not the headline when
   * every AI-raised ticket shares the same one. A page called "Support Request" is a page you
   * cannot tell from the last four you opened.
   */
  const headline =
    ticket.requester_name?.trim() ||
    lead?.name?.trim() ||
    ticket.requester_phone?.trim() ||
    lead?.phone?.trim() ||
    ticket.subject;

  const durationLabel =
    call?.duration_seconds == null
      ? null
      : call.duration_seconds < 60
        ? `${call.duration_seconds}s`
        : `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s`;

  return (
    <div className="p-4 md:p-6">
      <Link
        href="/dashboard/crm/requests?type=ticket"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-brand-500"
      >
        <ArrowLeft className="h-4 w-4" /> Requests
      </Link>

      {isPaused && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Workspace is paused. Changes are disabled.
          </p>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <RequestIcon type="ticket" size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-navy-700 dark:text-white md:text-2xl">
            {headline}
          </h1>
          <p className="mt-0.5 truncate text-sm text-gray-500">
            {ticket.subject}
            <span className="mx-1.5 text-gray-300">·</span>
            <span title={formatDateInTZ(ticket.updated_at, timezone)}>
              updated {formatTimeAgo(ticket.updated_at)}
            </span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {ticket.status ? (
              <Pill tone={statusTone} dot>
                {ticket.status}
              </Pill>
            ) : null}
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ── Left: why it exists, then what happened to it ─────────────────────────── */}
        <div className="space-y-4 lg:col-span-2">
          <Surface>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Why this was raised
            </p>
            <TranscriptPanel
              notes={ticket.description}
              transcript={call?.transcript ?? null}
              conversationHref={call?.id ? `/dashboard/calls/${call.id}` : null}
              emptyLabel="Nothing was recorded about this request. It was created without a conversation attached — most likely by hand."
            />
          </Surface>

          <Surface>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Subject</p>
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
              <p className="text-sm font-medium text-navy-700 dark:text-white">{ticket.subject}</p>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 dark:border-white/10">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Created</dt>
                <dd className="mt-0.5 text-sm text-navy-700 dark:text-white">
                  {formatDateInTZ(ticket.created_at, timezone)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Last updated</dt>
                <dd className="mt-0.5 text-sm text-navy-700 dark:text-white">
                  {formatDateInTZ(ticket.updated_at, timezone)}
                </dd>
              </div>
            </dl>
          </Surface>

          <TicketActivity activities={activities} timezone={timezone} />

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

        {/* ── Right: who, and where it came from ────────────────────────────────────── */}
        <aside className="space-y-4">
          <TicketRequester
            ticketId={ticket.id}
            orgId={orgId}
            userId={userId}
            requesterName={ticket.requester_name}
            requesterPhone={ticket.requester_phone}
            requesterEmail={ticket.requester_email}
            requesterAddress={ticket.requester_address}
            canMutate={canMutate}
            isPaused={isPaused}
          />

          {lead && (
            <Surface>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Contact
              </p>
              <p className="text-sm font-medium text-navy-700 dark:text-white">{lead.name || "—"}</p>
              {lead.phone ? <p className="mt-0.5 text-sm text-gray-500">{lead.phone}</p> : null}
              {lead.email ? <p className="mt-0.5 text-sm text-gray-500">{lead.email}</p> : null}
              {lead.source ? (
                <p className="mt-2 text-xs text-gray-400">
                  First reached you by {formatLeadSource(lead.source).toLowerCase()}
                </p>
              ) : null}
              <Link
                href={`/dashboard/crm/contacts/${lead.id}`}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 transition hover:underline dark:text-brand-300"
              >
                View full history <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Surface>
          )}

          {history.length > 0 && (
            <Surface>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Earlier from this customer
              </p>
              <p className="mb-3 text-xs text-gray-400">
                {history.length === 1
                  ? "One earlier request."
                  : `${history.length} earlier requests.`}
              </p>
              <ul className="space-y-2">
                {history.map((h) => (
                  <li key={h.id}>
                    <Link
                      href={`/dashboard/crm/requests/${h.id}?type=ticket`}
                      className="group flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 -mx-2 transition hover:bg-gray-50 dark:hover:bg-white/5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-navy-700 dark:text-white">
                          {h.subject}
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-400">
                          {formatTimeAgo(h.createdAt)}
                          {h.status ? ` · ${h.status}` : ""}
                        </span>
                      </span>
                      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-300 transition group-hover:text-brand-500" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Surface>
          )}

          {call && (
            <Surface>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                The call behind it
              </p>
              <dl className="space-y-2.5 text-sm">
                {call.started_at ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-400">Started</dt>
                    <dd className="mt-0.5 text-navy-700 dark:text-white">
                      {formatDateInTZ(call.started_at, timezone)}
                    </dd>
                  </div>
                ) : null}
                {durationLabel ? (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="text-navy-700 dark:text-white">{durationLabel}</span>
                  </div>
                ) : null}
                {call.cost_usd !== null ? (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="text-navy-700 dark:text-white">
                      ${call.cost_usd.toFixed(4)}
                    </span>
                  </div>
                ) : null}
                {agent?.name ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-400">Answered by</dt>
                    <dd className="mt-0.5 text-navy-700 dark:text-white">{agent.name}</dd>
                  </div>
                ) : null}
              </dl>
              <Link
                href={`/dashboard/calls/${call.id}`}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 transition hover:underline dark:text-brand-300"
              >
                <Phone className="h-3.5 w-3.5" />
                Open the call
              </Link>
            </Surface>
          )}

          {/*
            The id is support-desk plumbing, not information — kept because it is genuinely needed
            when someone writes in, and kept quiet for the same reason.
          */}
          <Surface>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Reference
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-mono text-xs text-gray-400">{ticket.id}</p>
              <CopyButton text={ticket.id} />
            </div>
          </Surface>
        </aside>
      </div>
    </div>
  );
}
