import Link from "next/link";
import { notFound } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { listContactViews } from "@/lib/platform/readModel/contacts";
import PageHeader from "../_platform/PageHeader";
import ChannelBadge from "../_platform/ChannelBadge";
import { formatWhen, statusPillClass, titleCase } from "../_platform/format";

export const dynamic = "force-dynamic";

/**
 * Contacts (Sprint 5.5) — the people your AI Employees talk to, unified across channels.
 * Reads the contacts read model (over `leads` today; contacts/contact_identities once
 * backfilled). Reachable only under PLATFORM_UX_ENABLED.
 */
export default async function ContactsPage() {
  if (!platformUxEnabled()) notFound();

  const orgId = await resolveActiveOrgId();
  const contacts = orgId ? await listContactViews(orgId, { limit: 200 }) : [];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Contacts"
        subtitle="Everyone your AI Employees have spoken with, unified across every channel."
      />

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-navy-800">
        <div className="border-b border-gray-100 p-4 dark:border-white/10">
          <p className="text-sm font-medium text-navy-700 dark:text-white">
            {contacts.length} contact{contacts.length === 1 ? "" : "s"}
          </p>
        </div>

        {contacts.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-navy-700 dark:text-white">No contacts yet</p>
            <p className="mt-1 text-sm text-gray-500">
              People appear here as your AI Employees handle conversations.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-white/10">
            {contacts.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/contacts/${c.id}`}
                  className="flex items-center gap-4 px-4 py-3 transition hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-navy-700 dark:text-white">
                      {c.displayName || c.primaryHandle || "Unknown contact"}
                    </p>
                    {c.primaryHandle && c.displayName ? (
                      <p className="truncate text-xs text-gray-500">{c.primaryHandle}</p>
                    ) : null}
                  </div>
                  <div className="hidden shrink-0 gap-1.5 md:flex">
                    {c.channels.map((ch) => (
                      <ChannelBadge key={ch} channel={ch} />
                    ))}
                  </div>
                  {c.status ? (
                    <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium md:inline ${statusPillClass(c.status)}`}>
                      {titleCase(c.status)}
                    </span>
                  ) : null}
                  <span className="shrink-0 text-xs text-gray-400">{formatWhen(c.lastSeenAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
