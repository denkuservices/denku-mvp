import Link from "next/link";
import { notFound } from "next/navigation";
import { Contact as ContactIcon, Search } from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { listContactViews } from "@/lib/platform/readModel/contacts";
import PageHeader from "../../_platform/PageHeader";
import ChannelBadge from "../../_platform/ChannelBadge";
import { formatWhen, titleCase } from "../../_platform/format";
import { Surface, ListContainer, ListHeader, ListRow, EmptyState, Pill } from "../../_platform/ui";

export const dynamic = "force-dynamic";

const SCAN_LIMIT = 500;

function one(v: string | string[] | undefined): string {
  if (!v) return "";
  return (Array.isArray(v) ? v[0] : v).trim();
}

/**
 * Contacts — the people your AI Employees talk to, unified across channels.
 * Sprint 8.5: search + truthful counts (audit Y-003/Y-004); rendered through the shared platform
 * primitives so it matches the rest of the dashboard.
 */
export default async function ContactsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!platformUxEnabled()) notFound();

  const sp = searchParams ? await searchParams : undefined;
  const search = one(sp?.q).toLowerCase();

  const orgId = await resolveActiveOrgId();
  const all = orgId ? await listContactViews(orgId, { limit: SCAN_LIMIT }) : [];
  const bounded = all.length >= SCAN_LIMIT;

  const contacts = search
    ? all.filter((c) =>
        [c.displayName, c.primaryHandle, c.source].filter(Boolean).join(" ").toLowerCase().includes(search)
      )
    : all;

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Contacts"
        subtitle="Everyone your AI team has spoken with, unified across every channel."
      />

      <form method="get" className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            name="q"
            defaultValue={one(sp?.q)}
            placeholder="Search by name, phone, or email…"
            aria-label="Search contacts"
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 dark:border-white/10 dark:bg-navy-800 dark:text-white"
          />
        </div>
        <button
          type="submit"
          className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600"
        >
          Search
        </button>
        {search ? (
          <Link
            href="/dashboard/crm/contacts"
            className="inline-flex h-10 items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <Surface padded={false}>
        <ListHeader>
          <p className="text-sm font-medium text-navy-700 dark:text-white">
            {/* Truthful: "N+" when the scan was bounded, never a fabricated exact total (R-018). */}
            {contacts.length === 0
              ? "No matching contacts"
              : `${contacts.length}${bounded && !search ? "+" : ""} contact${contacts.length === 1 ? "" : "s"}`}
          </p>
          {bounded && !search ? <Pill tone="neutral">Most recent {SCAN_LIMIT} — search to narrow</Pill> : null}
        </ListHeader>

        {contacts.length === 0 ? (
          search ? (
            <EmptyState
              icon={Search}
              title="No contacts match that search"
              description="Try a different name, phone number, or email address."
              action={{ label: "Clear search", href: "/dashboard/crm/contacts" }}
            />
          ) : (
            <EmptyState
              icon={ContactIcon}
              title="No contacts yet"
              description="Every person your AI Employees speak with is saved here automatically, with their history across every channel."
              action={{ label: "View conversations", href: "/dashboard/inbox" }}
            />
          )
        ) : (
          <ListContainer>
            {contacts.map((c) => (
              <ListRow key={c.id} href={`/dashboard/crm/contacts/${c.id}`}>
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
                  <Pill tone="neutral" className="hidden md:inline-flex">
                    {titleCase(c.status)}
                  </Pill>
                ) : null}
                <span className="shrink-0 text-xs text-gray-400">{formatWhen(c.lastSeenAt)}</span>
              </ListRow>
            ))}
          </ListContainer>
        )}
      </Surface>
    </div>
  );
}
