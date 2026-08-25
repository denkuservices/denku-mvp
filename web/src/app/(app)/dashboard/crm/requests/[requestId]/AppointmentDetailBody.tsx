import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CalendarClock, MessageSquare, User } from "lucide-react";
import type { AppointmentDetailView } from "@/lib/platform/readModel/requests";
import { getContactView } from "@/lib/platform/readModel/contacts";
import PageHeader from "../../../_platform/PageHeader";
import { formatWhen, titleCase } from "../../../_platform/format";
import { Surface, Pill } from "../../../_platform/ui";

/**
 * Appointment detail (Sprint 9 · T4) — the interim fix for a circular dead end.
 *
 * Appointment rows in Requests linked to `/dashboard/appointments`, which the platform
 * middleware redirects back to Requests: clicking an appointment returned you to the page you
 * clicked from, and an appointment's own details were reachable **nowhere** in the product.
 *
 * Deliberately minimal and read-only: it shows what the `appointments` row actually holds and
 * links to the people and conversation around it. **Sprint 13 replaces this** with the unified
 * Request detail that serves tickets and appointments together — this is not that surface, and
 * should not grow into it.
 */
export default async function AppointmentDetailBody({
  orgId,
  appointment,
}: {
  orgId: string;
  appointment: AppointmentDetailView;
}) {
  const contact = appointment.contactId ? await getContactView(orgId, appointment.contactId) : null;
  const contactName = contact?.displayName || contact?.primaryHandle || null;

  const statusTone =
    appointment.status === "scheduled"
      ? "info"
      : appointment.status === "completed"
        ? "ok"
        : appointment.status === "cancelled" || appointment.status === "no_show"
          ? "neutral"
          : "neutral";

  return (
    <div className="p-4 md:p-6">
      <Link
        href="/dashboard/crm/requests?type=appointment"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-brand-500"
      >
        <ArrowLeft className="h-4 w-4" /> Requests
      </Link>

      <PageHeader
        title="Appointment"
        subtitle={
          appointment.occursAt
            ? `Scheduled ${formatWhen(appointment.occursAt)}`
            : "No time recorded on this booking."
        }
        action={
          appointment.status ? <Pill tone={statusTone}>{titleCase(appointment.status)}</Pill> : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Surface>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Details</p>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Starts</dt>
                <dd className="mt-0.5 text-sm text-navy-700 dark:text-white">
                  {appointment.occursAt ? formatWhen(appointment.occursAt) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Ends</dt>
                <dd className="mt-0.5 text-sm text-navy-700 dark:text-white">
                  {appointment.endsAt ? formatWhen(appointment.endsAt) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Booked</dt>
                <dd className="mt-0.5 text-sm text-navy-700 dark:text-white">
                  {formatWhen(appointment.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Status</dt>
                <dd className="mt-0.5 text-sm text-navy-700 dark:text-white">
                  {appointment.status ? titleCase(appointment.status) : "—"}
                </dd>
              </div>
            </dl>

            <div className="mt-5 border-t border-gray-100 pt-4 dark:border-white/10">
              <p className="text-xs uppercase tracking-wide text-gray-400">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-navy-700 dark:text-white">
                {appointment.body?.trim() || "No notes were recorded for this appointment."}
              </p>
            </div>
          </Surface>
        </div>

        <aside className="space-y-4">
          <Surface>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Customer</p>
            {appointment.contactId ? (
              <>
                <p className="flex items-center gap-2 text-sm font-medium text-navy-700 dark:text-white">
                  <User className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="min-w-0 truncate">{contactName || "Unknown contact"}</span>
                </p>
                <Link
                  href={`/dashboard/crm/contacts/${appointment.contactId}`}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 transition hover:underline dark:text-brand-300"
                >
                  View full history <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </>
            ) : (
              // Honest about the gap rather than rendering a dead link.
              <p className="text-sm text-gray-500">No contact is linked to this appointment.</p>
            )}
          </Surface>

          <Surface>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Where it came from
            </p>
            {appointment.callId ? (
              <Link
                href={`/dashboard/inbox/${appointment.callId}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 transition hover:underline dark:text-brand-300"
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                Open the conversation
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <p className="flex items-start gap-2 text-sm text-gray-500">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                This appointment isn&apos;t linked to a conversation.
              </p>
            )}
          </Surface>
        </aside>
      </div>
    </div>
  );
}
