import React from "react";

/**
 * Shared header for platform (Sprint 5) surfaces — one consistent title/subtitle/action
 * block across Employees · Conversations · Contacts · Channels. Presentational only.
 */
export default function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-navy-700 dark:text-white">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
