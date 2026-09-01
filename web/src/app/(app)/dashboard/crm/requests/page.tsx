import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Inbox, Search, Plus } from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { listRequestViews, type RequestType } from "@/lib/platform/readModel/requests";
import PageHeader from "../../_platform/PageHeader";
import RequestIcon, { requestTypeLabel } from "../../_platform/crm/RequestIcon";
import RequestCalendar from "../../_platform/crm/RequestCalendar";
import { formatWhen, titleCase } from "../../_platform/format";
import {
  Surface,
  ListContainer,
  ListHeader,
  ListRow,
  EmptyState,
  Pill,
  SearchField,
  CONTROL_CLASS,
} from "../../_platform/ui";

export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string {
  if (!v) return "";
  return (Array.isArray(v) ? v[0] : v).trim();
}

function statusTone(status: string | null): "ok" | "warn" | "neutral" | "info" {
  const s = (status ?? "").toLowerCase();
  if (["open", "scheduled"].includes(s)) return "info";
  if (["closed", "completed", "resolved"].includes(s)) return "ok";
  if (["cancelled", "canceled", "no_show"].includes(s)) return "neutral";
  return "neutral";
}

/**
 * Requests — everything your AI Employees produced from a conversation (Sprint 8.5 / R-122).
 *
 * Replaces two nav items (Tickets, Appointments) that were the **same concept** split across two
 * tables. Nothing is lost: type + status filters, search, the "New request" action, and the
 * existing ticket/appointment detail pages are all preserved and linked.
 *
 * Deliberately **not** called "Tasks" — that noun is reserved for pending work (R-113).
 */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!platformUxEnabled()) notFound();

  const sp = searchParams ? await searchParams : undefined;
  const typeParam = one(sp?.type);
  const type: RequestType | undefined =
    typeParam === "ticket" || typeParam === "appointment" ? typeParam : undefined;
  const status = one(sp?.status);
  const search = one(sp?.q);

  /*
   * List or calendar.
   *
   * Only offered for appointments, and that is a deliberate limit rather than an unfinished one:
   * a ticket has no time it happens at, so a calendar of tickets would be a calendar of the
   * moments they were logged — which is a chart of our own inbox, not of the customer's week.
   */
  const view = one(sp?.view) === "calendar" && type === "appointment" ? "calendar" : "list";

  const now = new Date();
  const monthParam = one(sp?.month); // `YYYY-MM`
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(monthParam);
  const year = monthMatch ? Number(monthMatch[1]) : now.getUTCFullYear();
  const month = monthMatch ? Number(monthMatch[2]) - 1 : now.getUTCMonth();
  const validMonth = year >= 1970 && year <= 2999 && month >= 0 && month <= 11;

  const orgId = await resolveActiveOrgId();
  const { items, counts } = orgId
    ? await listRequestViews(orgId, { type, status, search })
    : { items: [], counts: { all: 0, ticket: 0, appointment: 0 } };

  const hasFilters = Boolean(type || status || search);

  const hrefWith = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      type: typeParam,
      status,
      q: search,
      view: view === "calendar" ? "calendar" : undefined,
      month: monthMatch && validMonth ? monthParam : undefined,
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return `/dashboard/crm/requests${qs ? `?${qs}` : ""}`;
  };

  const hrefForMonth = (y: number, m: number) =>
    hrefWith({ view: "calendar", month: `${y}-${String(m + 1).padStart(2, "0")}` });

  const tabs: Array<{ label: string; value?: RequestType; count: number }> = [
    { label: "All", value: undefined, count: counts.all },
    { label: "Requests", value: "ticket", count: counts.ticket },
    { label: "Appointments", value: "appointment", count: counts.appointment },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Requests"
        subtitle="Everything your AI team produced from a conversation — questions to answer and appointments to keep."
        action={
          <Link
            href="/dashboard/crm/requests/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            <Plus className="h-4 w-4" /> New request
          </Link>
        }
      />

      {/* Type tabs with real counts. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = type === t.value;
          return (
            <Link
              key={t.label}
              href={hrefWith({ type: t.value })}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-brand-500 text-white"
                  : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-navy-800 dark:text-gray-200"
              }`}
            >
              {t.label}
              <span className={active ? "opacity-80" : "text-gray-400"}>{t.count}</span>
            </Link>
          );
        })}

        {/*
          The calendar switch appears only on the Appointments tab — where a calendar means
          something — rather than sitting greyed out on the other two.
        */}
        {type === "appointment" ? (
          <div className="ml-auto inline-flex overflow-hidden rounded-full border border-gray-200 dark:border-white/10">
            <Link
              href={hrefWith({ view: undefined, month: undefined })}
              className={`px-3 py-1.5 text-sm font-medium transition ${
                view === "list"
                  ? "bg-brand-500 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-navy-800 dark:text-gray-300"
              }`}
            >
              List
            </Link>
            <Link
              href={hrefWith({ view: "calendar" })}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition ${
                view === "calendar"
                  ? "bg-brand-500 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-navy-800 dark:text-gray-300"
              }`}
            >
              <CalendarDays className="h-4 w-4" />
              Calendar
            </Link>
          </div>
        ) : null}
      </div>

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        {typeParam ? <input type="hidden" name="type" value={typeParam} /> : null}
        <SearchField
          className="min-w-[200px] flex-1"
          defaultValue={search}
          placeholder="Search requests…"
          label="Search requests"
        />
        <select
          name="status"
          defaultValue={status}
          aria-label="Status"
          className={CONTROL_CLASS}
        >
          <option value="">Any status</option>
          <option value="open">Open</option>
          <option value="scheduled">Scheduled</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button
          type="submit"
          className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600"
        >
          Filter
        </button>
        {hasFilters ? (
          <Link
            href="/dashboard/crm/requests"
            className="inline-flex h-10 items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {view === "calendar" ? (
        <Surface>
          <RequestCalendar
            year={validMonth ? year : now.getUTCFullYear()}
            month={validMonth ? month : now.getUTCMonth()}
            items={items}
            hrefForMonth={hrefForMonth}
          />
        </Surface>
      ) : (
      <Surface padded={false}>
        <ListHeader>
          <p className="text-sm font-medium text-navy-700 dark:text-white">
            {items.length === 0 ? "Nothing here" : `${items.length} request${items.length === 1 ? "" : "s"}`}
          </p>
        </ListHeader>

        {items.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={Search}
              title="No requests match these filters"
              description="Try a different status, or clear the filters to see everything your AI Employees have produced."
              action={{ label: "Clear filters", href: "/dashboard/crm/requests" }}
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title="No requests yet"
              description="Every call and message your AI Employees handle becomes a request here — a question to answer, or an appointment to keep. Nothing ever dead-ends."
              action={{ label: "View conversations", href: "/dashboard/inbox" }}
            />
          )
        ) : (
          <ListContainer>
            {items.map((r) => {
              /*
               * The row leads with WHO, not with the subject.
               *
               * Every deterministic ticket the voice webhook creates is titled "Support Request",
               * so a list keyed on the title was a column of one repeated phrase — nothing to
               * scan, nothing to recognise, no way to find the caller you remember. The person is
               * the headline; what kind of request it is, is the badge; the subject falls to the
               * second line where it belongs beside the time it is happening.
               */
              const headline = r.who || r.title;
              const detail = r.occursAt
                ? `${requestTypeLabel(r.type)} · ${formatWhen(r.occursAt)}`
                : r.body?.trim() || r.title;

              return (
                <ListRow key={`${r.type}:${r.id}`} href={r.href}>
                  <RequestIcon type={r.type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-navy-700 dark:text-white">
                      {headline}
                    </p>
                    <p className="truncate text-xs text-gray-500">{detail}</p>
                  </div>
                  {r.priority && r.priority !== "normal" ? (
                    <Pill tone="warn" className="hidden md:inline-flex">
                      {titleCase(r.priority)}
                    </Pill>
                  ) : null}
                  {r.status ? (
                    <Pill tone={statusTone(r.status)} dot className="hidden sm:inline-flex">
                      {titleCase(r.status)}
                    </Pill>
                  ) : null}
                  <span className="shrink-0 text-xs text-gray-400">{formatWhen(r.createdAt)}</span>
                </ListRow>
              );
            })}
          </ListContainer>
        )}
      </Surface>
      )}
    </div>
  );
}
