"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpDown, ListFilter, Search, X } from "lucide-react";
import { useDashboardLocale } from "@/components/dashboard-i18n/DashboardLocaleProvider";
import {
  SEGMENTS,
  SORTS,
  contactsHref,
  type ContactsQuery,
  type SegmentValue,
} from "@/lib/platform/crm/contactQuery";
import { SearchField } from "../ui";

type SegmentCounts = Record<SegmentValue, number>;

export default function ContactsFilters({
  query,
  counts,
}: {
  query: ContactsQuery;
  counts: SegmentCounts;
}) {
  const router = useRouter();
  const { translate } = useDashboardLocale();
  const [isPending, startTransition] = useTransition();
  const hasChanges = Boolean(query.q || query.segment || query.sort !== "recent");

  function changeSort(value: string) {
    startTransition(() => {
      router.push(contactsHref(query, { sort: value, page: 1 }));
    });
  }

  return (
    <div data-dashboard-no-translate="true" className="p-4 sm:p-5">
      <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {query.segment ? <input type="hidden" name="segment" value={query.segment} /> : null}
        {query.sort !== "recent" ? <input type="hidden" name="sort" value={query.sort} /> : null}
        <SearchField
          className="min-w-0 flex-1 sm:min-w-[260px]"
          defaultValue={query.q}
          placeholder={translate("Search name, phone, email, source…")}
          label={translate("Search contacts")}
        />
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          {translate("Search")}
        </button>
        {hasChanges ? (
          <Link
            href="/dashboard/crm/contacts"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {translate("Clear filters")}
          </Link>
        ) : null}
      </form>

      <div className="mt-4 grid gap-4 rounded-xl border border-gray-100 bg-gray-50/70 p-3.5 dark:border-white/5 dark:bg-white/[0.025] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
            <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
            {translate("Customer segment")}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
            {SEGMENTS.map((segment) => {
              const active = query.segment === segment.value;
              return (
                <Link
                  key={segment.value || "all"}
                  href={contactsHref(query, { segment: segment.value, page: 1 })}
                  title={translate(segment.hint)}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 ${
                    active
                      ? "border-navy-700 bg-navy-700 text-white shadow-sm dark:border-white dark:bg-white dark:text-navy-900"
                      : "border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:text-brand-700 dark:border-white/10 dark:bg-navy-800 dark:text-gray-300 dark:hover:border-brand-400/40 dark:hover:text-white"
                  }`}
                >
                  {translate(segment.label)}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                      active
                        ? "bg-white/15 text-white dark:bg-navy-900/10 dark:text-navy-600"
                        : "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400"
                    }`}
                  >
                    {counts[segment.value]}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <label className="block lg:w-56">
          <span className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
            <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
            {translate("Sort by")}
          </span>
          <select
            value={query.sort}
            onChange={(event) => changeSort(event.target.value)}
            disabled={isPending}
            aria-label={translate("Sort contacts")}
            className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-navy-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-navy-800 dark:text-white"
          >
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {translate(sort.label)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
