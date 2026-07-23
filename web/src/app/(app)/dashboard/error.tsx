"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Shared dashboard error boundary (R-061).
 *
 * Catches thrown errors from every dashboard route that doesn't define its own
 * error.tsx (calls, tickets, leads, appointments, analytics, usage, settings, …),
 * replacing Next.js's raw error screen with a calm, on-brand recovery card.
 *
 * Deliberately does NOT surface the raw error message to the user (R-021) — it logs
 * detail to the console/observability and shows the digest as a support reference.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Full detail server/client-side only; never rendered to the user.
    console.error("[DASHBOARD][ERROR_BOUNDARY]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10 bg-background-100">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-sm dark:bg-navy-800">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-500 dark:bg-amber-500/10">
          <AlertTriangle className="h-7 w-7" />
        </div>

        <h2 className="text-xl font-bold text-navy-700 dark:text-white">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          This part of your dashboard hit an unexpected error. Your data is safe — try
          again, and if it keeps happening, contact support with the reference below.
        </p>

        {error.digest && (
          <p className="mt-3 font-mono text-xs text-gray-400">
            Reference: {error.digest}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <RotateCcw className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-navy-700 transition-colors hover:bg-gray-50 dark:border-navy-600 dark:text-white dark:hover:bg-navy-700"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
