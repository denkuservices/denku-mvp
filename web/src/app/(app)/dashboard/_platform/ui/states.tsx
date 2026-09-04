"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import Card from "@/components/ui-horizon/card";
import SlowLoadNotice from "./SlowLoadNotice";

/**
 * Shared loading + error states for platform routes (Sprint 8.5 / R-117, audit Y-006).
 *
 * Before this, 12/15 dashboard routes had no `loading.tsx` and 13/15 had no `error.tsx` — a slow
 * query looked like a frozen app and a failed one fell through to Next's default error page. These
 * are the cheapest possible fix for "this software feels unfinished".
 *
 * Errors are shown with a safe, human message — never a raw provider/DB string (house rule).
 */

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-100 dark:bg-white/10 ${className}`} />;
}

/** Generic list-page skeleton: header, optional stat row, then rows. */
export function ListSkeleton({ rows = 6, stats = 0 }: { rows?: number; stats?: number }) {
  return (
    <div className="p-4 md:p-6">
      <SkeletonBlock className="mb-2 h-7 w-48" />
      <SkeletonBlock className="mb-6 h-4 w-80" />

      {stats > 0 ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: stats }).map((_, i) => (
            <Card key={i} extra="p-5">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="mt-2 h-7 w-16" />
            </Card>
          ))}
        </div>
      ) : null}

      <Card extra="">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-white/10">
          <SkeletonBlock className="h-4 w-32" />
        </div>
        <div className="divide-y divide-gray-100 dark:divide-white/10">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <SkeletonBlock className="h-6 w-24 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <SkeletonBlock className="h-4 w-1/3" />
                <SkeletonBlock className="mt-1.5 h-3 w-2/3" />
              </div>
              <SkeletonBlock className="h-3 w-14 shrink-0" />
            </div>
          ))}
        </div>
      </Card>

      <SlowLoadNotice />
    </div>
  );
}

/** Card-grid skeleton (Employees, Channels). */
export function GridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="p-4 md:p-6">
      <SkeletonBlock className="mb-2 h-7 w-48" />
      <SkeletonBlock className="mb-6 h-4 w-80" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <Card key={i} extra="p-5">
            <SkeletonBlock className="h-6 w-28 rounded-full" />
            <SkeletonBlock className="mt-3 h-4 w-40" />
            <SkeletonBlock className="mt-2 h-3 w-full" />
            <SkeletonBlock className="mt-4 h-8 w-full rounded-lg" />
          </Card>
        ))}
      </div>

      <SlowLoadNotice />
    </div>
  );
}

/**
 * Error boundary body. `reset` re-runs the failed render — the user can recover without a full
 * reload. The underlying error is logged, never displayed raw.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this page. This is usually temporary.",
  reset,
}: {
  title?: string;
  description?: string;
  reset?: () => void;
}) {
  return (
    <div className="p-4 md:p-6">
      <Card extra="p-10">
        <div className="flex flex-col items-center text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </span>
          <p className="text-sm font-semibold text-navy-700 dark:text-white">{title}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{description}</p>
          {reset ? (
            <button
              type="button"
              onClick={reset}
              className="mt-4 inline-flex items-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Try again
            </button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
