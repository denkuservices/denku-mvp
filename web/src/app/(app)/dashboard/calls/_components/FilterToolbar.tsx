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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-grow">
          <label htmlFor="search" className="block text-sm font-medium text-gray-700">
            Search
          </label>
          <input
            type="text"
            id="search"
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            placeholder="Search agent, outcome, etc."
          />
        </div>
        <div className="min-w-[150px]">
          <label htmlFor="outcome" className="block text-sm font-medium text-gray-700">
            Outcome
          </label>
          <select
            id="outcome"
            value={outcome}
            onChange={(e) => handleOutcomeChange(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">All</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="min-w-[150px]">
          <label htmlFor="since" className="block text-sm font-medium text-gray-700">
            Time range
          </label>
          <select
            id="since"
            value={since}
            onChange={(e) => handleSinceChange(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">Any time</option>
            <option value="1d">Last 24h</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>
        {(q || outcome || since) && (
          <div className="flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                router.push("/dashboard/calls");
              }}
              className="inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

