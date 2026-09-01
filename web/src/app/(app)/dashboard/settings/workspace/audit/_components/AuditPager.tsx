"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Paging, in the URL like the filters.
 *
 * The old list had no paging at all — it fetched 20 rows and offered "show 15 more", which is a
 * disclosure control wearing a pager's clothes: past row 20 the history simply did not exist as
 * far as the product was concerned.
 */
export function AuditPager({ page, pageCount }: { page: number; pageCount: number }) {
  const router = useRouter();
  const params = useSearchParams();

  if (pageCount <= 1) return null;

  const go = (next: number) => {
    const q = new URLSearchParams(params.toString());
    if (next <= 1) q.delete("page");
    else q.set("page", String(next));
    const qs = q.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  };

  const btn =
    "inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-navy-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-white dark:hover:bg-white/5";

  return (
    <nav
      aria-label="Audit log pages"
      className="flex items-center justify-between border-t border-gray-100 px-6 py-4 dark:border-white/10"
    >
      <button type="button" className={btn} onClick={() => go(page - 1)} disabled={page <= 1}>
        <ChevronLeft className="h-4 w-4" />
        Newer
      </button>

      <p className="text-xs text-gray-500">
        Page {page} of {pageCount}
      </p>

      <button type="button" className={btn} onClick={() => go(page + 1)} disabled={page >= pageCount}>
        Older
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
