import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LayoutList,
  Search,
  Sparkles,
  TimerOff,
} from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { listRequestViews } from "@/lib/platform/readModel/requests";
import CrmMetricCard from "../../_platform/crm/CrmMetricCard";
import RequestCalendar from "../../_platform/crm/RequestCalendar";
import RequestIcon from "../../_platform/crm/RequestIcon";
import { formatWhen, titleCase } from "../../_platform/format";
import { CONTROL_CLASS, EmptyState, Pill, SearchField } from "../../_platform/ui";

export const dynamic = "force-dynamic";

function one(value: string | string[] | undefined): string {
  if (!value) return "";
  return (Array.isArray(value) ? value[0] : value).trim();
}

function statusTone(status: string | null): "ok" | "neutral" | "info" {
  const value = (status ?? "").toLowerCase();
  if (["scheduled", "open", "pending"].includes(value)) return "info";
  if (["completed", "closed"].includes(value)) return "ok";
  return "neutral";
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!platformUxEnabled()) notFound();

  const sp = searchParams ? await searchParams : undefined;
  const status = one(sp?.status);
  const search = one(sp?.q);
  const view = one(sp?.view) === "list" ? "list" : "calendar";

  const now = new Date();
  const monthParam = one(sp?.month);
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(monthParam);
  const year = monthMatch ? Number(monthMatch[1]) : now.getUTCFullYear();
  const month = monthMatch ? Number(monthMatch[2]) - 1 : now.getUTCMonth();
  const validMonth = year >= 1970 && year <= 2999 && month >= 0 && month <= 11;

  const orgId = await resolveActiveOrgId();
  const { items, counts } = orgId
    ? await listRequestViews(orgId, { type: "appointment", status, search })
    : { items: [], counts: { all: 0, ticket: 0, appointment: 0 } };

  const hrefWith = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      status,
      q: search,
      view: view === "list" ? "list" : undefined,
      month: monthMatch && validMonth ? monthParam : undefined,
      ...patch,
    };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    const query = params.toString();
    return `/dashboard/crm/appointments${query ? `?${query}` : ""}`;
  };
  const hrefForMonth = (nextYear: number, nextMonth: number) =>
    hrefWith({ view: undefined, month: `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}` });

  const nowTime = now.getTime();
  const upcoming = items.filter((item) => item.occursAt && Date.parse(item.occursAt) >= nowTime);
  const completed = items.filter((item) => ["completed", "closed"].includes((item.status ?? "").toLowerCase())).length;
  const cancelled = items.filter((item) => ["cancelled", "canceled", "no_show"].includes((item.status ?? "").toLowerCase())).length;
  const unscheduled = items.filter((item) => !item.occursAt).length;
  const hasFilters = Boolean(status || search);

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">
            <Sparkles className="h-3.5 w-3.5" /> Calendar intelligence
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-700 dark:text-white md:text-3xl">Appointments</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Your complete booking calendar, upcoming agenda and appointment history in one focused workspace.
          </p>
        </div>
        <div className="inline-flex self-start rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-navy-800">
          <Link href={hrefWith({ view: undefined })} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${view === "calendar" ? "bg-navy-700 text-white shadow-sm dark:bg-white dark:text-navy-900" : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"}`}>
            <CalendarDays className="h-3.5 w-3.5" /> Agenda
          </Link>
          <Link href={hrefWith({ view: "list", month: undefined })} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${view === "list" ? "bg-navy-700 text-white shadow-sm dark:bg-white dark:text-navy-900" : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"}`}>
            <LayoutList className="h-3.5 w-3.5" /> List
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <CrmMetricCard label="All bookings" value={counts.appointment} detail="Appointments in your CRM" icon={CalendarCheck2} tone="violet" />
        <CrmMetricCard label="Upcoming" value={upcoming.length} detail="Customer commitments ahead" icon={Clock3} tone="teal" />
        <CrmMetricCard label="Completed" value={completed} detail="Finished appointments" icon={CheckCircle2} tone="sky" />
        <CrmMetricCard label="Needs attention" value={unscheduled} detail={`${cancelled} cancelled or no-show`} icon={TimerOff} tone="amber" />
      </div>

      <section className="mb-4 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-navy-800">
        <form method="get" className="flex flex-col gap-3 p-4 md:flex-row">
          {view === "list" ? <input type="hidden" name="view" value="list" /> : null}
          <SearchField className="min-w-[220px] flex-1" defaultValue={search} placeholder="Search customer or appointment detail…" label="Search appointments" />
          <select name="status" defaultValue={status} aria-label="Status" className={`${CONTROL_CLASS} md:min-w-44`}>
            <option value="">Any status</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600">
            <Search className="h-4 w-4" /> Apply
          </button>
          {hasFilters ? <Link href="/dashboard/crm/appointments" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5">Clear</Link> : null}
        </form>
      </section>

      {view === "calendar" ? (
        <RequestCalendar year={validMonth ? year : now.getUTCFullYear()} month={validMonth ? month : now.getUTCMonth()} items={items} hrefForMonth={hrefForMonth} />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-navy-800">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-white/10">
            <p className="text-sm font-semibold text-navy-700 dark:text-white">{items.length === 0 ? "No appointments" : `${items.length} appointment${items.length === 1 ? "" : "s"}`}</p>
            <span className="text-xs text-gray-400">Ordered by appointment time</span>
          </div>
          {items.length === 0 ? (
            hasFilters ? <EmptyState icon={Search} title="No appointments match these filters" description="Try another status or clear the current filters." action={{ label: "Clear filters", href: "/dashboard/crm/appointments" }} /> : <EmptyState icon={CalendarCheck2} title="No appointments yet" description="Appointments booked by your AI team will appear here and in the agenda automatically." action={{ label: "View conversations", href: "/dashboard/inbox" }} />
          ) : (
            <div>
              <div className="hidden grid-cols-[minmax(280px,1.4fr)_minmax(170px,.8fr)_minmax(120px,.55fr)_minmax(120px,.55fr)_28px] gap-4 border-b border-gray-100 bg-gray-50/70 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:border-white/10 dark:bg-white/[0.025] md:grid">
                <span>Customer & detail</span><span>Appointment time</span><span>Status</span><span>Booked</span><span />
              </div>
              <div className="divide-y divide-gray-100 dark:divide-white/10">
                {items.map((item) => (
                  <Link key={item.id} href={item.href} className="group grid gap-3 px-4 py-4 transition hover:bg-brand-50/50 dark:hover:bg-white/[0.035] md:grid-cols-[minmax(280px,1.4fr)_minmax(170px,.8fr)_minmax(120px,.55fr)_minmax(120px,.55fr)_28px] md:items-center md:gap-4 md:px-5">
                    <div className="flex min-w-0 items-center gap-3"><RequestIcon type="appointment" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-navy-700 dark:text-white">{item.who || "Unknown customer"}</p><p className="mt-0.5 truncate text-xs text-gray-500">{item.body?.trim() || "Appointment"}</p></div></div>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{item.occursAt ? formatWhen(item.occursAt) : "Time not confirmed"}</span>
                    <div className="flex items-center justify-between md:block"><span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 md:hidden">Status</span>{item.status ? <Pill tone={statusTone(item.status)} dot>{titleCase(item.status)}</Pill> : <span className="text-xs text-gray-400">Not set</span>}</div>
                    <span className="hidden text-xs font-medium text-gray-500 dark:text-gray-400 md:block">{formatWhen(item.createdAt)}</span>
                    <ArrowUpRight className="hidden h-4 w-4 text-gray-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-500 md:block" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
