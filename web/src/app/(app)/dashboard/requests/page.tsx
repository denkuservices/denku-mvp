import Link from "next/link";
import { notFound } from "next/navigation";
import { Inbox, Ticket, Calendar, Search, Plus } from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { listRequestViews, type RequestType } from "@/lib/platform/readModel/requests";
import PageHeader from "../_platform/PageHeader";
import { formatWhen, titleCase } from "../_platform/format";
import { Surface, ListContainer, ListHeader, ListRow, EmptyState, Pill } from "../_platform/ui";

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

  const orgId = await resolveActiveOrgId();
  const { items, counts } = orgId
    ? await listRequestViews(orgId, { type, status, search })
    : { items: [], counts: { all: 0, ticket: 0, appointment: 0 } };

  const hasFilters = Boolean(type || status || search);

  const hrefWith = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { type: typeParam, status, q: search, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return `/dashboard/requests${qs ? `?${qs}` : ""}`;
  };

  const tabs: Array<{ label: string; value?: RequestType; count: number }> = [
    { label: "All", value: undefined, count: counts.all },
    { label: "Requests", value: "ticket", count: counts.ticket },
    { label: "Appointments", value: "appointment", count: counts.appointment },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Requests"
        subtitle="Everything your AI Employees produced from a conversation — questions to answer and appointments to keep."
        action={
          <Link
            href="/dashboard/tickets/new"
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
      </div>

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        {typeParam ? <input type="hidden" name="type" value={typeParam} /> : null}
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search requests…"
            aria-label="Search requests"
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 dark:border-white/10 dark:bg-navy-800 dark:text-white"
          />
        </div>
        <select
          name="status"
          defaultValue={status}
          aria-label="Status"
          className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
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
            href="/dashboard/requests"
            className="inline-flex h-10 items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200"
          >
            Clear
          </Link>
        ) : null}
      </form>

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
              action={{ label: "Clear filters", href: "/dashboard/requests" }}
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title="No requests yet"
              description="Every call and message your AI Employees handle becomes a request here — a question to answer, or an appointment to keep. Nothing ever dead-ends."
              action={{ label: "View conversations", href: "/dashboard/conversations" }}
            />
          )
        ) : (
          <ListContainer>
            {items.map((r) => {
              const Icon = r.type === "appointment" ? Calendar : Ticket;
              return (
                <ListRow key={`${r.type}:${r.id}`} href={r.href}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-white/10">
                    <Icon className="h-4 w-4 text-gray-500 dark:text-gray-300" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-navy-700 dark:text-white">{r.title}</p>
                    <p className="truncate text-xs text-gray-500">
                      {r.occursAt ? `Scheduled ${formatWhen(r.occursAt)}` : r.body || "—"}
                    </p>
                  </div>
                  {r.priority && r.priority !== "normal" ? (
                    <Pill tone="warn" className="hidden md:inline-flex">
                      {titleCase(r.priority)}
                    </Pill>
                  ) : null}
                  {r.status ? (
                    <Pill tone={statusTone(r.status)} className="hidden md:inline-flex">
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
    </div>
  );
}
