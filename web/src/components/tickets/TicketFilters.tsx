"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getStatusLabel, getPriorityLabel } from "@/lib/tickets/utils.client";

// Single source of truth for filter options
const DEFAULT_STATUSES = ["open", "in_progress", "closed"] as const;
const DEFAULT_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

type TicketFiltersProps = {
  initialQ?: string;
  initialStatus?: string;
  initialPriority?: string;
  statusOptions: string[]; // Not used, kept for backward compatibility
  priorityOptions: string[]; // Not used, kept for backward compatibility
};

export function TicketFilters({
  initialQ = "",
  initialStatus = "",
  initialPriority = "",
}: TicketFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  // Update URL when filters change (debounced for search)
  const updateURL = useCallback(
    (newQ: string, newStatus: string, newPriority: string) => {
      const params = new URLSearchParams();
      if (newQ) params.set("q", newQ);
      if (newStatus) params.set("status", newStatus);
      if (newPriority) params.set("priority", newPriority);

      const queryString = params.toString();
      router.push(`/dashboard/tickets${queryString ? `?${queryString}` : ""}`);
    },
    [router]
  );

  // Handle search input with debounce
  const handleSearchChange = useCallback(
    (value: string) => {
      setQ(value);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      const timer = setTimeout(() => {
        updateURL(value, initialStatus, initialPriority);
      }, 400); // 400ms debounce
      setDebounceTimer(timer);
    },
    [initialStatus, initialPriority, updateURL, debounceTimer]
  );

  // Handle status/priority change (immediate)
  const handleStatusChange = useCallback(
    (value: string) => {
      updateURL(q, value, initialPriority);
    },
    [q, initialPriority, updateURL]
  );

  const handlePriorityChange = useCallback(
    (value: string) => {
      updateURL(q, initialStatus, value);
    },
    [q, initialStatus, updateURL]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [debounceTimer]);

  // Check if any filters are active
  const hasActiveFilters = Boolean(q || initialStatus || initialPriority);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 items-end">
        <div className="flex flex-col gap-2 w-full">
          <label htmlFor="ticket-search" className="text-xs font-medium text-navy-700 dark:text-white min-h-[16px] leading-4">
            Search
          </label>
          <input
            type="text"
            id="ticket-search"
            value={q}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Subject, lead name, phone, or email…"
            className="h-10 w-full px-3 rounded-lg border border-gray-300 bg-white text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-col gap-2 w-full">
          <label htmlFor="ticket-status" className="text-xs font-medium text-navy-700 dark:text-white min-h-[16px] leading-4">
            Status
          </label>
          <select
            id="ticket-status"
            value={initialStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="h-10 w-full px-3 rounded-lg border border-gray-300 bg-white text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All</option>
            {DEFAULT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {getStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 w-full">
          <label htmlFor="ticket-priority" className="text-xs font-medium text-navy-700 dark:text-white min-h-[16px] leading-4">
            Priority
          </label>
          <select
            id="ticket-priority"
            value={initialPriority}
            onChange={(e) => handlePriorityChange(e.target.value)}
            className="h-10 w-full px-3 rounded-lg border border-gray-300 bg-white text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All</option>
            {DEFAULT_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {getPriorityLabel(priority)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {hasActiveFilters && (
        <div>
          <Link
            href="/dashboard/tickets"
            className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            title="Clear filters"
          >
            Clear filters
          </Link>
        </div>
      )}
    </div>
  );
}

