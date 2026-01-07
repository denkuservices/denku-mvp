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
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
          <p className="text-sm font-semibold text-zinc-900">No audit entries</p>
          <p className="mt-1 text-sm text-zinc-600">
            Audit entries will appear here when workspace settings are updated.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="divide-y divide-zinc-200">
        {visibleLogs.map((log) => {
          const isExpanded = expandedIds.has(log.id);
          const hasChanges = log.changes.length > 0;

          return (
            <div key={log.id} className="p-4 md:p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                {/* Left: Timestamp and Action */}
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900">{formatAction(log.action)}</span>
                    <span className="text-xs text-zinc-500">{formatEntityType(log.entity_type)}</span>
                  </div>
                  <p className="text-xs text-zinc-500">{formatTimestamp(log.created_at)}</p>
                  <p className="text-xs text-zinc-600">
                    by <span className="font-medium">{getActorDisplayName(log.actor_name, log.actor_email)}</span>
                  </p>
                </div>

                {/* Right: Expand button */}
                {hasChanges && (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(log.id)}
                    className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50"
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
                <div className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  {log.changes.map((change, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <p className="text-xs font-semibold text-zinc-900">
                        {change.field.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </p>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div className="rounded-lg border border-zinc-200 bg-white p-2.5">
                          <p className="text-xs font-medium text-zinc-500">Before</p>
                          <p className="mt-0.5 text-sm text-zinc-900">
                            {change.before_value === null ? (
                              <span className="italic text-zinc-400">(empty)</span>
                            ) : (
                              change.before_value
                            )}
                          </p>
                        </div>
                        <div className="rounded-lg border border-zinc-200 bg-white p-2.5">
                          <p className="text-xs font-medium text-zinc-500">After</p>
                          <p className="mt-0.5 text-sm text-zinc-900">
                            {change.after_value === null ? (
                              <span className="italic text-zinc-400">(empty)</span>
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
        <div className="p-4 border-t border-zinc-200">
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-zinc-600 hover:text-zinc-900 font-medium"
          >
            {showAll ? "Show less" : `Show more (${logs.length - 5} more)`}
          </button>
        </div>
      )}
    </div>
  );
}

