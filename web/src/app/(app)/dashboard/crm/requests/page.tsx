import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Inbox,
  Plus,
  Search,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { listRequestViews } from "@/lib/platform/readModel/requests";
import CrmMetricCard from "../../_platform/crm/CrmMetricCard";
import RequestIcon from "../../_platform/crm/RequestIcon";
import { formatWhen, titleCase } from "../../_platform/format";
import { CONTROL_CLASS, EmptyState, Pill, SearchField } from "../../_platform/ui";

export const dynamic = "force-dynamic";

function one(value: string | string[] | undefined): string {
  if (!value) return "";
  return (Array.isArray(value) ? value[0] : value).trim();
}

function statusTone(status: string | null): "ok" | "warn" | "neutral" | "info" {
  const value = (status ?? "").toLowerCase();
  if (["open", "pending"].includes(value)) return "info";
  if (["closed", "completed", "resolved"].includes(value)) return "ok";
  if (["cancelled", "canceled"].includes(value)) return "neutral";
  return "neutral";
}

/** Service requests — appointments live in their own peer CRM workspace. */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!platformUxEnabled()) notFound();

  const sp = searchParams ? await searchParams : undefined;
  const status = one(sp?.status);
  const search = one(sp?.q);

  // Preserve old shared-list bookmarks while making Appointments a first-class CRM section.
  if (one(sp?.type) === "appointment") {
    const params = new URLSearchParams();
    for (const key of ["status", "q", "view", "month"] as const) {
      const value = one(sp?.[key]);
      if (value) params.set(key, value);
    }
    redirect(`/dashboard/crm/appointments${params.size ? `?${params.toString()}` : ""}`);
  }

  const orgId = await resolveActiveOrgId();
  const { items, counts } = orgId
    ? await listRequestViews(orgId, { type: "ticket", status, search })
    : { items: [], counts: { all: 0, ticket: 0, appointment: 0 } };

  const openItems = items.filter((item) => ["open", "pending"].includes((item.status ?? "").toLowerCase()));
  const urgentItems = items.filter((item) => ["high", "urgent"].includes((item.priority ?? "").toLowerCase()));
  const resolvedItems = items.filter((item) => ["closed", "completed", "resolved"].includes((item.status ?? "").toLowerCase()));
  const hasFilters = Boolean(status || search);

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">
            <Sparkles className="h-3.5 w-3.5" /> Service operations
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-700 dark:text-white md:text-3xl">Requests</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Track every customer need from first contact to completed work without mixing it into your calendar.
          </p>
        </div>
        <Link href="/dashboard/crm/requests/new" className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl bg-navy-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-600 hover:shadow-md dark:bg-white dark:text-navy-900 dark:hover:bg-brand-200">
          <Plus className="h-4 w-4" /> New request
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <CrmMetricCard label="All requests" value={counts.ticket} detail="Service requests in your CRM" icon={Inbox} tone="violet" />
        <CrmMetricCard label="Open now" value={openItems.length} detail="Waiting for action" icon={TimerReset} tone="sky" />
        <CrmMetricCard label="High priority" value={urgentItems.length} detail="Requires faster attention" icon={AlertCircle} tone="amber" />
        <CrmMetricCard label="Resolved" value={resolvedItems.length} detail="Completed in this view" icon={CheckCircle2} tone="teal" />
      </div>

      <section className="mb-4 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-navy-800">
        <form method="get" className="flex flex-col gap-3 p-4 md:flex-row">
          <SearchField className="min-w-[220px] flex-1" defaultValue={search} placeholder="Search customer, subject or detail…" label="Search requests" />
          <select name="status" defaultValue={status} aria-label="Status" className={`${CONTROL_CLASS} md:min-w-40`}>
            <option value="">Any status</option>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600">
            <Search className="h-4 w-4" /> Apply
          </button>
          {hasFilters ? <Link href="/dashboard/crm/requests" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5">Clear</Link> : null}
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-navy-800">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-white/10">
          <p className="text-sm font-semibold text-navy-700 dark:text-white">{items.length === 0 ? "Nothing here" : `${items.length} request${items.length === 1 ? "" : "s"}`}</p>
          <span className="text-xs text-gray-400">Newest activity first</span>
        </div>

        {items.length === 0 ? (
          hasFilters ? <EmptyState icon={Search} title="No requests match these filters" description="Try a different status or clear the filters to see every service request." action={{ label: "Clear filters", href: "/dashboard/crm/requests" }} /> : <EmptyState icon={Inbox} title="No requests yet" description="Customer requests created by your AI team will appear here automatically." action={{ label: "View conversations", href: "/dashboard/inbox" }} />
        ) : (
          <div>
            <div className="hidden grid-cols-[minmax(300px,1.5fr)_minmax(110px,.5fr)_minmax(120px,.55fr)_minmax(120px,.55fr)_28px] gap-4 border-b border-gray-100 bg-gray-50/70 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:border-white/10 dark:bg-white/[0.025] md:grid">
              <span>Customer & request</span><span>Priority</span><span>Status</span><span>Created</span><span />
            </div>
            <div className="divide-y divide-gray-100 dark:divide-white/10">
              {items.map((item) => (
                <Link key={item.id} href={item.href} className="group grid gap-3 px-4 py-4 transition hover:bg-brand-50/50 dark:hover:bg-white/[0.035] md:grid-cols-[minmax(300px,1.5fr)_minmax(110px,.5fr)_minmax(120px,.55fr)_minmax(120px,.55fr)_28px] md:items-center md:gap-4 md:px-5">
                  <div className="flex min-w-0 items-center gap-3"><RequestIcon type="ticket" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-navy-700 dark:text-white">{item.who || item.title}</p><p className="mt-0.5 truncate text-xs text-gray-500">{item.body?.trim() || item.title}</p></div></div>
                  <div className="hidden md:block">{item.priority && item.priority !== "normal" ? <Pill tone="warn">{titleCase(item.priority)}</Pill> : <span className="text-xs text-gray-400">Normal</span>}</div>
                  <div className="flex items-center justify-between md:block"><span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 md:hidden">Status</span>{item.status ? <Pill tone={statusTone(item.status)} dot>{titleCase(item.status)}</Pill> : <span className="text-xs text-gray-400">Not set</span>}</div>
                  <span className="hidden text-xs font-medium text-gray-500 dark:text-gray-400 md:block">{formatWhen(item.createdAt)}</span>
                  <ArrowUpRight className="hidden h-4 w-4 text-gray-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-500 md:block" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
