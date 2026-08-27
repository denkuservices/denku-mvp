import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { getContactView } from "@/lib/platform/readModel/contacts";
import { getContactTimeline } from "@/lib/platform/readModel/timeline";
import { contactNotesAvailable } from "@/lib/platform/contactNotes";
import { lifecycleMeta } from "@/lib/platform/lifecycle";
import PageHeader from "../../../_platform/PageHeader";
import ChannelBadge from "../../../_platform/ChannelBadge";
import { formatWhen } from "../../../_platform/format";
import { Pill } from "../../../_platform/ui";
import Timeline from "../../../_platform/crm/Timeline";
import LifecycleControl from "../../../_platform/crm/LifecycleControl";
import NameControl from "../../../_platform/crm/NameControl";
import NoteComposer from "../../../_platform/crm/NoteComposer";

export const dynamic = "force-dynamic";

/**
 * Contact detail — the flagship CRM surface (Phase 4).
 *
 * Layout is **timeline spine + facts rail**. The timeline is the point: every conversation,
 * request and note in one reverse-chronological stream, so the arc
 * `DM → AI qualifies → call → appointment booked` reads as one journey instead of four tables.
 *
 * Sourced from `leads` today (contact id = lead id, which is what makes /leads/:id →
 * /crm/contacts/:id lossless); moves to `contacts` after the R-081 backfill with no UI change.
 *
 * Honest by construction: no AI summary card, no lead score, no "engagement" metric. Those are
 * not built, and a plausible-looking invented panel would be worse than its absence.
 */
export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  if (!platformUxEnabled()) notFound();

  const { contactId } = await params;
  const orgId = await resolveActiveOrgId();
  const contact = orgId ? await getContactView(orgId, contactId) : null;
  if (!contact) notFound();

  // Notes are inert until migrated — the timeline still renders, the composer goes read-only.
  const [timeline, notesAvailable] = await Promise.all([
    getContactTimeline(orgId!, contact.id, contact.conversations),
    contactNotesAvailable(orgId!),
  ]);

  const stage = lifecycleMeta(contact.status);

  return (
    <div className="p-4 md:p-6">
      <Link
        href="/dashboard/crm/contacts"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-brand-500"
      >
        <ArrowLeft className="h-4 w-4" /> Contacts
      </Link>

      <PageHeader
        title={contact.displayName || contact.primaryHandle || "Contact"}
        subtitle={contact.primaryHandle && contact.displayName ? contact.primaryHandle : undefined}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {stage ? <Pill tone={stage.tone}>{stage.label}</Pill> : null}
            {contact.channels.map((ch) => (
              <ChannelBadge key={ch} channel={ch} />
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* The spine. */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-navy-800">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">History</p>
            <div className="mb-5 border-b border-gray-100 pb-5 dark:border-white/10">
              <NoteComposer contactRef={contact.id} available={notesAvailable} />
            </div>
            <Timeline entries={timeline} />
          </div>
        </div>

        {/* What we hold about them. */}
        <aside className="space-y-4">
          {/* Naming the person comes before classifying them: an owner who opens this page
              because the Inbox said "Unknown contact" should find the fix at the top. */}
          <NameControl
            contactRef={contact.id}
            name={contact.displayName ?? null}
            handle={contact.primaryHandle ?? null}
          />

          <LifecycleControl contactRef={contact.id} status={contact.status} />

          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-800">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              How to reach them
            </p>
            {contact.identities.length === 0 ? (
              <p className="text-sm text-gray-500">No contact details on file.</p>
            ) : (
              <ul className="space-y-2">
                {contact.identities.map((idn) => (
                  <li key={`${idn.channel}:${idn.value}`} className="flex items-center justify-between gap-2">
                    <ChannelBadge channel={idn.channel} />
                    <span className="min-w-0 truncate text-sm text-gray-600 dark:text-gray-300">{idn.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-800">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Summary</p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Conversations</dt>
                <dd className="font-medium text-navy-700 dark:text-white">{contact.conversations.length}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Last seen</dt>
                <dd className="text-navy-700 dark:text-white">{formatWhen(contact.lastSeenAt)}</dd>
              </div>
              {contact.source ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">First reached you via</dt>
                  <dd className="text-navy-700 dark:text-white">{contact.source.replace(/_/g, " ")}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          {/* The lead's own free-form description. Distinct from timeline notes — left in place
              rather than migrated, so nothing anyone wrote is lost. */}
          {contact.notes ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-800">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Description</p>
              <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{contact.notes}</p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
