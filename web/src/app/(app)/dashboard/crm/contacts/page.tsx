import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Contact as ContactIcon,
  Download,
  Inbox,
  Plus,
  Search,
  UsersRound,
} from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { listContactViews } from "@/lib/platform/readModel/contacts";
import { loadContactInsights } from "@/lib/platform/readModel/contactInsights";
import {
  CONTACTS_PAGE_SIZE,
  SEGMENTS,
  contactsHref,
  matchesSearch,
  matchesSegment,
  parseContactsQuery,
  sortRows,
  withInsights,
} from "@/lib/platform/crm/contactRows";
import CrmMetricCard from "../../_platform/crm/CrmMetricCard";
import ContactsFilters from "../../_platform/crm/ContactsFilters";
import ContactsTable from "../../_platform/crm/ContactsTable";
import { EmptyState } from "../../_platform/ui";

export const dynamic = "force-dynamic";

const SCAN_LIMIT = 500;

function one(v: string | string[] | undefined): string {
  if (!v) return "";
  return (Array.isArray(v) ? v[0] : v).trim();
}

/**
 * Contacts — the customer workspace.
 *
 * It used to be a name, a lifecycle pill, a one-word source and a date: four columns of which one
 * carried anything, so a screen holding real people read as a single column of names. The work
 * those people had generated — every request, call and appointment — sat in the same database,
 * linked to the same rows, and was nowhere on this screen.
 *
 * What a CRM list is FOR is deciding who to deal with next, and that needs three things the old
 * page had none of: what is outstanding for each person, a way to cut the list down to the ones
 * that matter, and a way to act without leaving. So:
 *
 *   * **Rows carry the work.** Open requests, next appointment, calls and talk time — joined in
 *     one batched pass (`loadContactInsights`), never per row.
 *   * **Segments answer real questions.** "Needs attention" is anyone with a request still open;
 *     "Gone quiet" deliberately excludes them, because a customer waiting on you is neglected
 *     rather than dormant. The metric cards ARE those segments, so a number you can see is a list
 *     you can open.
 *   * **The list is actionable.** Select rows and move them through the lifecycle in one go, peek
 *     at a person beside the list rather than navigating away, dial or email from the row, and
 *     take the whole thing away as CSV.
 *
 * Filtering and sorting run in memory over a bounded scan (500), matching the read model this
 * page has always used. That is honest at the volumes Denku workspaces actually hold and is
 * marked as bounded in the UI when it bites; pushing it into Postgres is the right next step and
 * a different change.
 */
export default async function ContactsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!platformUxEnabled()) notFound();

  const sp = searchParams ? await searchParams : undefined;
  const query = parseContactsQuery({
    q: one(sp?.q),
    segment: one(sp?.segment),
    sort: one(sp?.sort),
    page: one(sp?.page),
  });

  const orgId = await resolveActiveOrgId();
  const contacts = orgId ? await listContactViews(orgId, { limit: SCAN_LIMIT }) : [];
  const bounded = contacts.length >= SCAN_LIMIT;

  // One batched pass for the whole scan, so the segment counts below describe the same universe
  // the table does.
  const insights = orgId
    ? await loadContactInsights(orgId, contacts.map((c) => c.id))
    : new Map();
  const all = withInsights(contacts, insights);

  /*
   * Reading the clock is the point here, not a purity slip: "Gone quiet" and "Upcoming" are
   * defined relative to now, and this is an async Server Component rendered per request
   * (`force-dynamic`), so there is no re-render for an unstable value to disagree with. The rule
   * is written for client components, where it is right.
   */
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const searched = all.filter((row) => matchesSearch(row, query.q));
  const filtered = searched.filter((row) => matchesSegment(row, query.segment, now));
  const sorted = sortRows(filtered, query.sort);

  const pageCount = Math.max(1, Math.ceil(sorted.length / CONTACTS_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const rows = sorted.slice((page - 1) * CONTACTS_PAGE_SIZE, page * CONTACTS_PAGE_SIZE);

  /** Counts are over the SEARCHED set, so a segment tab never promises rows a search has hidden. */
  const countFor = (segment: string) =>
    searched.filter((row) => matchesSegment(row, segment, now)).length;
  const segmentCounts = Object.fromEntries(
    SEGMENTS.map((segment) => [segment.value, countFor(segment.value)]),
  ) as Record<(typeof SEGMENTS)[number]["value"], number>;

  const needsAttention = countFor("attention");
  const upcoming = countFor("upcoming");
  const qualified = countFor("qualified");

  const exportParams = new URLSearchParams();
  if (query.q) exportParams.set("q", query.q);
  if (query.segment) exportParams.set("segment", query.segment);
  if (query.sort !== "recent") exportParams.set("sort", query.sort);
  const exportHref = `/api/crm/contacts/export${exportParams.toString() ? `?${exportParams}` : ""}`;

  const hasFilters = Boolean(query.q || query.segment);

  return (
    <div className="p-4 md:p-6">
      {/* ------------------------------------------------------------- header */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-700 dark:text-white md:text-3xl">
            Customers
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Everyone your AI team has spoken to, and what is still open for them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={exportHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 px-3.5 text-sm font-semibold text-navy-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
          >
            <Download className="h-4 w-4" /> Export
          </a>
          <Link
            href="/dashboard/crm/contacts/new"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-navy-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-600 hover:shadow-md dark:bg-white dark:text-navy-900 dark:hover:bg-brand-200"
          >
            <Plus className="h-4 w-4" /> Add contact
          </Link>
        </div>
      </div>

      {/* --------------------------------------------- metrics, which are filters */}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <CrmMetricCard
          label="Total contacts"
          value={`${all.length}${bounded ? "+" : ""}`}
          detail="Everyone on record"
          icon={UsersRound}
          tone="violet"
          href={contactsHref(query, { segment: "", page: 1 })}
          active={query.segment === ""}
        />
        <CrmMetricCard
          label="Needs attention"
          value={needsAttention}
          detail="Has a request still open"
          icon={Inbox}
          tone="amber"
          href={contactsHref(query, { segment: "attention", page: 1 })}
          active={query.segment === "attention"}
        />
        <CrmMetricCard
          label="Upcoming"
          value={upcoming}
          detail="Appointment still to come"
          icon={Activity}
          tone="sky"
          href={contactsHref(query, { segment: "upcoming", page: 1 })}
          active={query.segment === "upcoming"}
        />
        <CrmMetricCard
          label="Qualified"
          value={qualified}
          detail={`${all.length ? Math.round((qualified / all.length) * 100) : 0}% of your CRM`}
          icon={BadgeCheck}
          tone="teal"
          href={contactsHref(query, { segment: "qualified", page: 1 })}
          active={query.segment === "qualified"}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-navy-800">
        {/* ------------------------------------------------------------ toolbar */}
        <div className="border-b border-gray-100 dark:border-white/10">
          <ContactsFilters query={query} counts={segmentCounts} />
        </div>

        {/* --------------------------------------------------------------- body */}
        {rows.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={Search}
              title="No customers match these filters"
              description="Try a different name, or widen the segment."
              action={{ label: "Clear filters", href: "/dashboard/crm/contacts" }}
            />
          ) : (
            <EmptyState
              icon={ContactIcon}
              title="No customers yet"
              description="Every person your AI Employees speak with is saved here automatically, with their history across every channel."
              action={{ label: "View conversations", href: "/dashboard/inbox" }}
            />
          )
        ) : (
          <>
            <ContactsTable rows={rows} />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 dark:border-white/10">
              <p className="text-xs text-gray-500">
                {sorted.length === 0
                  ? "No customers"
                  : `${(page - 1) * CONTACTS_PAGE_SIZE + 1}–${
                      (page - 1) * CONTACTS_PAGE_SIZE + rows.length
                    } of ${sorted.length}${bounded && !hasFilters ? "+" : ""}`}
                {bounded && !hasFilters ? (
                  <span className="text-gray-400"> · most recent {SCAN_LIMIT} scanned</span>
                ) : null}
              </p>

              {pageCount > 1 ? (
                <nav aria-label="Customer pages" className="flex items-center gap-2">
                  {page > 1 ? (
                    <Link
                      href={contactsHref(query, { page: page - 1 })}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-navy-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Previous
                    </Link>
                  ) : null}
                  <span className="text-xs text-gray-500">
                    Page {page} of {pageCount}
                  </span>
                  {page < pageCount ? (
                    <Link
                      href={contactsHref(query, { page: page + 1 })}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-navy-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                    >
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </nav>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
