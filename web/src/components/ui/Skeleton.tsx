/**
 * Skeleton primitives (R-048) — structure-preserving loading placeholders that
 * replace bare spinners on data-heavy pages. Pure presentational, no client hooks.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-gray-200/70 dark:bg-navy-700 ${className}`}
    />
  );
}

/** Card containing a titled table of shimmer rows — for list/detail pages. */
export function TableSkeleton({
  rows = 6,
  cols = 4,
  title = true,
}: {
  rows?: number;
  cols?: number;
  title?: boolean;
}) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="w-full rounded-3xl bg-white p-4 shadow-sm dark:bg-navy-800 sm:p-6"
    >
      {title && <Skeleton className="mb-6 h-6 w-44" />}
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={`h-4 ${c === 0 ? "w-1/4" : "flex-1"}`} />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** A row of stat-card placeholders (dashboard-style). */
export function StatCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 3xl:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-[20px] bg-white p-4 shadow-sm dark:bg-navy-800"
        >
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
