import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CalendarClock, Clock, User } from "lucide-react";
import type { AppointmentDetailView } from "@/lib/platform/readModel/requests";
import { getContactView } from "@/lib/platform/readModel/contacts";
import { formatWhen, titleCase } from "../../../_platform/format";
import { Surface, Pill } from "../../../_platform/ui";
import RequestIcon from "../../../_platform/crm/RequestIcon";
import { splitAppointmentNotes } from "../../../_platform/crm/appointmentNotes";
import TranscriptPanel from "../../../_platform/crm/TranscriptPanel";

/**
 * Appointment detail.
 *
 * **What was wrong with it.** The page was a definition list of four fields — Starts, Ends,
 * Booked, Status — with the raw contents of `appointments.notes` dropped underneath. For a
 * booking made by the deterministic path, `notes` is the entire call transcript with an
 * internal marker appended, so the page rendered a wall of `AI: … User: …` and a line reading
 * `[System] created_by=deterministic`, with three of the four fields showing an em-dash. It
 * showed a database row, not an appointment.
 *
 * **What it shows now.** When it starts and who it is with, first and largest, because those are
 * the two things anyone opens an appointment to find out. The conversation is rendered as a
 * conversation, through the same splitter and the same panel the request page uses. And the
 * internal provenance marker is dropped, not printed at a customer.
 */

export default async function AppointmentDetailBody({
  orgId,
  appointment,
}: {
  orgId: string;
  appointment: AppointmentDetailView;
}) {
  const contact = appointment.contactId ? await getContactView(orgId, appointment.contactId) : null;
  const contactName =
    contact?.displayName || contact?.primaryHandle || appointment.who || null;

  const status = (appointment.status ?? "").toLowerCase();
  const statusTone =
    status === "scheduled"
      ? "info"
      : status === "completed"
        ? "ok"
        : status === "cancelled" || status === "no_show"
          ? "critical"
          : "neutral";

  const { note, transcript: notesTranscript } = splitAppointmentNotes(appointment.body);
  // The linked call's own transcript is the better source; the notes dump is the fallback for a
  // booking whose call row has since been trimmed.
  const transcript = appointment.transcript ?? notesTranscript;

  const start = appointment.occursAt ? new Date(appointment.occursAt) : null;
  const startValid = start && !Number.isNaN(start.getTime()) ? start : null;

  /*
   * The headline is the actual date and time, spelled out.
   *
   * "3d ago" is the right format in a list, where it is one column among many and the reader is
   * scanning. On the page for one booking it is the wrong one: nobody turns up to an appointment
   * at "3d ago", and a relative time is precisely the thing you cannot act on.
   */
  const whenLine = startValid
    ? startValid.toLocaleString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
      })
    : "No time recorded";

  const endsAt = appointment.endsAt ? new Date(appointment.endsAt) : null;
  const endValid = endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null;

  return (
    <div className="p-4 md:p-6">
      <Link
        href="/dashboard/crm/requests?type=appointment"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-brand-500"
      >
        <ArrowLeft className="h-4 w-4" /> Requests
      </Link>

      {/* ── Header ───────────────────────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <RequestIcon type="appointment" size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-navy-700 dark:text-white md:text-2xl">
            {contactName ? `${contactName}` : "Appointment"}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {whenLine}
            {endValid ? (
              <>
                {" – "}
                {endValid.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </>
            ) : null}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {appointment.status ? (
              <Pill tone={statusTone} dot>
                {titleCase(appointment.status)}
              </Pill>
            ) : null}
            <span className="text-xs text-gray-400">Booked {formatWhen(appointment.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Surface>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              What was agreed
            </p>
            <TranscriptPanel
              notes={note}
              transcript={transcript}
              conversationHref={appointment.callId ? `/dashboard/calls/${appointment.callId}` : null}
              emptyLabel="Nothing was recorded about this booking. It has no conversation attached — most likely it was added by hand."
            />
          </Surface>

          {/*
            Kept, but demoted.
            The exact timestamps still matter when two bookings look alike or a status is being
            queried — they are just no longer the whole page.
          */}
          <Surface>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Booking details
            </p>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Starts</dt>
                <dd className="mt-0.5 text-sm text-navy-700 dark:text-white">
                  {startValid ? startValid.toLocaleString() : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Ends</dt>
                <dd className="mt-0.5 text-sm text-navy-700 dark:text-white">
                  {endValid ? (
                    endValid.toLocaleString()
                  ) : (
                    // An unspecified end is normal for a phone booking; saying so beats an
                    // em-dash the reader has to interpret.
                    <span className="text-gray-500">Open-ended</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Booked</dt>
                <dd className="mt-0.5 text-sm text-navy-700 dark:text-white">
                  {new Date(appointment.createdAt).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Status</dt>
                <dd className="mt-0.5 text-sm text-navy-700 dark:text-white">
                  {titleCase(appointment.status)}
                </dd>
              </div>
            </dl>
          </Surface>
        </div>

        <aside className="space-y-4">
          <Surface>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Customer
            </p>
            {appointment.contactId ? (
              <>
                <p className="flex items-center gap-2 text-sm font-medium text-navy-700 dark:text-white">
                  <User className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="min-w-0 truncate">{contactName || "Unknown contact"}</span>
                </p>
                {contact?.primaryHandle && contact.primaryHandle !== contactName ? (
                  <p className="mt-1 pl-6 text-sm text-gray-500">{contact.primaryHandle}</p>
                ) : null}
                <Link
                  href={`/dashboard/crm/contacts/${appointment.contactId}`}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 transition hover:underline dark:text-brand-300"
                >
                  View full history <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </>
            ) : appointment.who ? (
              <p className="flex items-center gap-2 text-sm text-navy-700 dark:text-white">
                <User className="h-4 w-4 shrink-0 text-gray-400" />
                {appointment.who}
              </p>
            ) : (
              <p className="text-sm text-gray-500">No contact is linked to this appointment.</p>
            )}
          </Surface>

          <Surface>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Where it came from
            </p>
            {appointment.callId ? (
              <Link
                href={`/dashboard/calls/${appointment.callId}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 transition hover:underline dark:text-brand-300"
              >
                <Clock className="h-4 w-4 shrink-0" />
                Open the call it was booked on
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
