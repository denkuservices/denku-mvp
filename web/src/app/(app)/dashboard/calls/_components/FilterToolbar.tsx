"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useCallback, useState, useEffect, useRef } from "react";
import Card from "@/components/ui-horizon/card";
import { HorizonButton } from "@/components/ui-horizon/button";
import { CONTROL_CLASS, FieldLabel, SEARCH_CONTROL_CLASS } from "@/components/ui-horizon/controls";

export function FilterToolbar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read current values from URL (single source of truth)
  const q = searchParams.get("q") ?? "";
  const outcome = searchParams.get("outcome") ?? "";
  const since = searchParams.get("since") ?? "";

  // Local state for search input (debounced)
  const [searchValue, setSearchValue] = useState(q);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      
      // Filters are view state: replace avoids filling browser history on every search edit.
      router.replace(fullURL, { scroll: false });
    },
    [router]
  );

  // Handle search input with debounce
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      debounceTimer.current = setTimeout(() => {
        updateURL(value, outcome, since);
      }, 400); // 400ms debounce
    },
    [outcome, since, updateURL]
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
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return (
    <Card className="p-4 sm:p-5">
      <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
        <div className="flex w-full flex-col gap-2">
          <FieldLabel htmlFor="search">Search</FieldLabel>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              id="search"
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              className={SEARCH_CONTROL_CLASS}
              placeholder="Search AI, outcome, or caller…"
            />
          </div>
        </div>
        <div className="flex w-full flex-col gap-2">
          <FieldLabel htmlFor="outcome">Outcome</FieldLabel>
          <select
            id="outcome"
            value={outcome}
            onChange={(e) => handleOutcomeChange(e.target.value)}
            className={CONTROL_CLASS}
          >
            <option value="">All</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="flex w-full flex-col gap-2">
          <FieldLabel htmlFor="since">Time range</FieldLabel>
          <select
            id="since"
            value={since}
            onChange={(e) => handleSinceChange(e.target.value)}
            className={CONTROL_CLASS}
          >
            <option value="">Any time</option>
            <option value="1d">Last 24h</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>
      </div>
      {(q || outcome || since) && (
        <div className="mt-4 flex justify-end border-t border-gray-100 pt-4 dark:border-white/10">
          <HorizonButton
            onClick={() => {
              router.replace("/dashboard/calls", { scroll: false });
            }}
            size="sm"
          >
            <X /> Clear filters
          </HorizonButton>
        </div>
      )}
    </Card>
  );
}

