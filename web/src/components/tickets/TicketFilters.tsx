"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type TicketFiltersProps = {
  initialQ?: string;
  initialStatus?: string;
  initialPriority?: string;
  statusOptions: string[];
  priorityOptions: string[];
};

export function TicketFilters({
  initialQ = "",
  initialStatus = "",
  initialPriority = "",
  statusOptions,
  priorityOptions,
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
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex-1 space-y-2">
        <label className="text-sm font-medium">Search</label>
        <input
          type="text"
          value={q}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Subject, lead name, phone, or email…"
          className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      <div className="w-full md:w-56 space-y-2">
        <label className="text-sm font-medium">Status</label>
        <select
          value={initialStatus}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
        >
          <option value="">All</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <div className="w-full md:w-56 space-y-2">
        <label className="text-sm font-medium">Priority</label>
        <select
          value={initialPriority}
          onChange={(e) => handlePriorityChange(e.target.value)}
          className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
        >
          <option value="">All</option>
          {priorityOptions.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </select>
      </div>

      {hasActiveFilters && (
        <div className="flex items-end">
          <Link
            href="/dashboard/tickets"
            className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
            title="Clear filters"
          >
            Clear filters
          </Link>
        </div>
      )}
    </div>
  );
}

