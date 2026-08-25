"use client";

import { useState } from "react";

type AuditLogChange = {
  field: string;
  before_value: string | null;
  after_value: string | null;
};

type AuditLogWithChanges = {
  id: string;
  org_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  actor_email: string | null;
  actor_name: string | null;
  changes: AuditLogChange[];
};

type AuditLogListProps = {
  logs: AuditLogWithChanges[];
};

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return iso;
  }
}

function formatAction(action: string): string {
  return action
    .split(".")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatEntityType(entityType: string): string {
  return entityType
    .split(".")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getActorDisplayName(actorName: string | null, actorEmail: string | null): string {
  if (actorName) return actorName;
  if (actorEmail) return actorEmail;
  return "System";
}

export function AuditLogList({ logs }: AuditLogListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Show only latest 5 by default
  const visibleLogs = showAll ? logs : logs.slice(0, 5);
  const hasMore = logs.length > 5;

  if (logs.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 p-6 shadow-sm">
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-5">
          <p className="text-sm font-semibold text-navy-700 dark:text-white">No audit entries</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Audit entries will appear here when workspace settings are updated.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 shadow-sm">
      <div className="divide-y divide-gray-200 dark:divide-white/10">
        {visibleLogs.map((log) => {
          const isExpanded = expandedIds.has(log.id);
          const hasChanges = log.changes.length > 0;

          return (
            <div key={log.id} className="p-4 md:p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                {/* Left: Timestamp and Action */}
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-navy-700 dark:text-white">{formatAction(log.action)}</span>
                    <span className="text-xs text-gray-500">{formatEntityType(log.entity_type)}</span>
                  </div>
                  <p className="text-xs text-gray-500">{formatTimestamp(log.created_at)}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    by <span className="font-medium">{getActorDisplayName(log.actor_name, log.actor_email)}</span>
                  </p>
                </div>

                {/* Right: Expand button */}
                {hasChanges && (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(log.id)}
                    className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-white/5"
                  >
                    <span>{isExpanded ? "Hide" : "Show"} changes</span>
                    <svg
                      className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Expanded: Field changes */}
              {isExpanded && hasChanges && (
                <div className="mt-4 space-y-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-4">
                  {log.changes.map((change, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <p className="text-xs font-semibold text-navy-700 dark:text-white">
                        {change.field.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </p>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 p-2.5">
                          <p className="text-xs font-medium text-gray-500">Before</p>
                          <p className="mt-0.5 text-sm text-navy-700 dark:text-white">
                            {change.before_value === null ? (
                              <span className="italic text-gray-400">(empty)</span>
                            ) : (
                              change.before_value
                            )}
                          </p>
                        </div>
                        <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 p-2.5">
                          <p className="text-xs font-medium text-gray-500">After</p>
                          <p className="mt-0.5 text-sm text-navy-700 dark:text-white">
                            {change.after_value === null ? (
                              <span className="italic text-gray-400">(empty)</span>
                            ) : (
                              change.after_value
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {hasMore && (
        <div className="p-4 border-t border-gray-200 dark:border-white/10">
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-navy-700 dark:hover:text-white font-medium"
          >
            {showAll ? "Show less" : `Show more (${logs.length - 5} more)`}
          </button>
        </div>
      )}
    </div>
  );
}

