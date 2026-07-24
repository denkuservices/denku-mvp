import React from "react";

/**
 * Dependency-free horizontal bar list for platform analytics/dashboard breakdowns
 * (conversations by channel/employee/intent). Server-renderable; no chart library. Values
 * are shown exactly (honesty — no smoothing/estimation).
 */
export interface BarItem {
  key: string;
  label: React.ReactNode;
  value: number;
}

export default function BarList({ items, emptyLabel = "No data yet" }: { items: BarItem[]; emptyLabel?: string }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-gray-500">{emptyLabel}</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.key}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="min-w-0 truncate text-navy-700 dark:text-gray-200">{it.label}</span>
            <span className="ml-2 shrink-0 tabular-nums text-gray-500">{it.value}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${Math.round((it.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
