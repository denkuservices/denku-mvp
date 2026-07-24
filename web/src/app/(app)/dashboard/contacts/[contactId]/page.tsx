import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { getContactView } from "@/lib/platform/readModel/contacts";
import PageHeader from "../../_platform/PageHeader";
import ChannelBadge from "../../_platform/ChannelBadge";
import { formatWhen, titleCase } from "../../_platform/format";

export const dynamic = "force-dynamic";

/**
 * Contact detail (Sprint 5.5) — a person with per-channel identities and full conversation
 * history. Sourced from `leads` today (id = lead id). Reachable only under PLATFORM_UX_ENABLED.
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

  return (
    <div className="p-4 md:p-6">
      <Link
        href="/dashboard/contacts"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-brand-500"
      >
        <ArrowLeft className="h-4 w-4" /> Contacts
      </Link>

      <PageHeader
        title={contact.displayName || contact.primaryHandle || "Contact"}
        subtitle={contact.status ? `Status: ${titleCase(contact.status)}` : undefined}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Identities */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-800">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Identities</p>
            {contact.identities.length === 0 ? (
              <p className="text-sm text-gray-500">No channel identities on file.</p>
            ) : (
              <ul className="space-y-2">
                {contact.identities.map((idn) => (
                  <li key={`${idn.channel}:${idn.value}`} className="flex items-center justify-between gap-2">
                    <ChannelBadge channel={idn.channel} />
                    <span className="truncate text-sm text-gray-600 dark:text-gray-300">{idn.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {contact.notes ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-800">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</p>
              <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{contact.notes}</p>
            </div>
          ) : null}
        </aside>

        {/* Conversation history */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 lg:col-span-2 dark:border-white/10 dark:bg-navy-800">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Conversation history</p>
          {contact.conversations.length === 0 ? (
            <p className="text-sm text-gray-500">No conversations yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-white/10">
              {contact.conversations.map((c) => (
                <li key={`${c.source}:${c.id}`}>
                  <Link
                    href={`/dashboard/conversations/${c.id}`}
                    className="flex items-center gap-3 py-2.5 transition hover:opacity-80"
                  >
                    <ChannelBadge channel={c.channel} />
                    <span className="min-w-0 flex-1 truncate text-sm text-navy-700 dark:text-white">
                      {c.summary || (c.intent ? titleCase(c.intent) : "Conversation")}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">{formatWhen(c.lastActivityAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
