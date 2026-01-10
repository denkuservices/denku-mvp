"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect } from "react";

export function FilterToolbar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read current values from URL (single source of truth)
  const q = searchParams.get("q") ?? "";
  const outcome = searchParams.get("outcome") ?? "";
  const since = searchParams.get("since") ?? "";

  // Local state for search input (debounced)
  const [searchValue, setSearchValue] = useState(q);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  // Sync local search state with URL param
  useEffect(() => {
    setSearchValue(q);
  }, [q]);

  // Update URL with new params (preserve existing params, build full URL)
  const updateURL = useCallback(
    (newQ: string, newOutcome: string, newSince: string) => {
      // Build URLSearchParams from current URL (preserve any other params)
      const params = new URLSearchParams(window.location.search);
      
      // Update or remove params
      if (newQ.trim()) {
        params.set("q", newQ.trim());
      } else {
        params.delete("q");
      }
      
      if (newOutcome) {
        params.set("outcome", newOutcome);
      } else {
        params.delete("outcome");
      }
      
      if (newSince) {
        params.set("since", newSince);
      } else {
        params.delete("since");
      }

      // Build full URL with query string
      const queryString = params.toString();
      const fullURL = `/dashboard/calls${queryString ? `?${queryString}` : ""}`;
      
      // Use router.push to trigger full Server Component re-render
      router.push(fullURL);
    },
    [router]
  );

  // Handle search input with debounce
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      const timer = setTimeout(() => {
        updateURL(value, outcome, since);
      }, 400); // 400ms debounce
      setDebounceTimer(timer);
    },
    [outcome, since, updateURL, debounceTimer]
  );

  // Handle outcome change (immediate)
  const handleOutcomeChange = useCallback(
    (value: string) => {
      updateURL(searchValue, value, since);
    },
    [searchValue, since, updateURL]
  );

  // Handle time range change (immediate)
  const handleSinceChange = useCallback(
    (value: string) => {
      updateURL(searchValue, outcome, value);
    },
    [searchValue, outcome, updateURL]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [debounceTimer]);

  return (
    <div className="rounded-md border bg-white p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 items-end">
        <div className="flex flex-col gap-2 w-full">
          <label htmlFor="search" className="text-xs font-medium text-navy-700 dark:text-white min-h-[16px] leading-4">
            Search
          </label>
          <input
            type="text"
            id="search"
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-10 w-full px-3 rounded-lg border border-gray-300 bg-white text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
            placeholder="Search agent, outcome, etc."
          />
        </div>
        <div className="flex flex-col gap-2 w-full">
          <label htmlFor="outcome" className="text-xs font-medium text-navy-700 dark:text-white min-h-[16px] leading-4">
            Outcome
          </label>
          <select
            id="outcome"
            value={outcome}
            onChange={(e) => handleOutcomeChange(e.target.value)}
            className="h-10 w-full px-3 rounded-lg border border-gray-300 bg-white text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="flex flex-col gap-2 w-full">
          <label htmlFor="since" className="text-xs font-medium text-navy-700 dark:text-white min-h-[16px] leading-4">
            Time range
          </label>
          <select
            id="since"
            value={since}
            onChange={(e) => handleSinceChange(e.target.value)}
            className="h-10 w-full px-3 rounded-lg border border-gray-300 bg-white text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Any time</option>
            <option value="1d">Last 24h</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>
      </div>
      {(q || outcome || since) && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              router.push("/dashboard/calls");
            }}
            className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

