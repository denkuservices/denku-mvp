"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Download, Filter, Search, X } from "lucide-react";
import { SettingsButton } from "@/app/(app)/dashboard/_platform/settings/ui";
// From `shared`, not `read`: this is a client component and `read.ts` is `server-only`.
import { AUDIT_CATEGORIES } from "@/lib/audit/shared";

/**
 * The filters, held in the URL rather than in component state.
 *
 * That is the whole design decision here: a filtered audit view is something a person sends to a
 * colleague ("look at what happened to billing in March"), bookmarks, or reloads after being
 * pulled away. State in `useState` survives none of those, and it also cannot be read by the
 * server component that does the actual querying. So every control writes a search param, the
 * server reads them, and "Export" is a plain link carrying the same params — which means the
 * downloaded file is by construction the thing on screen.
 */

type Actor = { id: string; label: string };

export function AuditFilterBar({ actors, total }: { actors: Actor[]; total: number }) {
  const router = useRouter();
  const params = useSearchParams();

  /**
   * The search box is UNCONTROLLED, keyed on the term in the URL.
   *
   * It was controlled state kept in step with an effect, which is the shape that produces a
   * flicker on every navigation and a setState firing during render. Keying on the URL value
   * makes React remount the input whenever the term genuinely changes — a "Clear filters", a back
   * button — and leave it alone the rest of the time, which is exactly the behaviour the effect
   * was trying to imitate.
   */
  const term = params.get("q") ?? "";

  const push = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      next.delete("page"); // any filter change starts from the first page again
      const qs = next.toString();
      router.push(qs ? `?${qs}` : "?", { scroll: false });
    },
    [params, router]
  );

  const setParam = (key: string, value: string) =>
    push((next) => (value ? next.set(key, value) : next.delete(key)));

  const hasFilters = ["q", "category", "actor", "from", "to"].some((k) => params.get(k));
  const exportHref = `/api/audit/export${params.toString() ? `?${params.toString()}` : ""}`;

  const field =
    "h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-700 shadow-sm outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-navy-900 dark:text-white";

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-800">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-[220px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem("q") as HTMLInputElement | null;
            setParam("q", (input?.value ?? "").trim());
          }}
        >
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          />
          <input
            key={term}
            name="q"
            type="search"
            defaultValue={term}
            placeholder="Search actions, entities or people"
            aria-label="Search the audit log"
            className={`${field} w-full pl-9`}
          />
        </form>

        <select
          aria-label="Filter by area"
          value={params.get("category") ?? ""}
          onChange={(e) => setParam("category", e.target.value)}
          className={field}
        >
          <option value="">All areas</option>
          {AUDIT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by person"
          value={params.get("actor") ?? ""}
          onChange={(e) => setParam("actor", e.target.value)}
          className={field}
        >
          <option value="">Anyone</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="sr-only sm:not-sr-only">From</span>
          <input
            type="date"
            aria-label="From date"
            value={params.get("from") ?? ""}
            onChange={(e) => setParam("from", e.target.value)}
            className={field}
          />
        </label>

        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="sr-only sm:not-sr-only">To</span>
          <input
            type="date"
            aria-label="To date"
            value={params.get("to") ?? ""}
            onChange={(e) => setParam("to", e.target.value)}
            className={field}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-gray-500">
          <Filter aria-hidden="true" className="h-3.5 w-3.5" />
          {total.toLocaleString()} {total === 1 ? "entry" : "entries"}
          {hasFilters ? " match these filters" : " recorded"}
        </p>

        <div className="flex items-center gap-2">
          {hasFilters ? (
            <SettingsButton
              type="button"
              variant="ghost"
              onClick={() => router.push("?", { scroll: false })}
            >
              <X />
              Clear filters
            </SettingsButton>
          ) : null}

          {/*
            A plain anchor, not a fetch: the response is a file with a Content-Disposition, and
            letting the browser do what browsers do avoids holding a whole CSV in memory to
            re-offer it through a blob URL.
          */}
          <a
            href={exportHref}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-navy-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </a>
        </div>
      </div>
    </div>
  );
}
