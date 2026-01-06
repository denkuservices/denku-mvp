"use client";

import { useState } from "react";
import { formatDateInTZ, formatTimeAgo, formatStatusLabel, formatPriorityLabel, humanizeEnum } from "@/lib/tickets/utils.client";
import type { TicketActivity } from "@/lib/tickets/activity.types";

interface TicketActivityProps {
  activities: TicketActivity[];
  timezone: string;
}

export function TicketActivity({ activities, timezone }: TicketActivityProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleActivities = expanded ? activities : activities.slice(0, 5);
  const hasMore = activities.length > 5;

  if (activities.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-4">
        <p className="text-sm font-medium mb-4">Activity</p>
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      </div>
    );
  }

  // Format diff value based on field type
  const formatDiffValue = (key: string, value: string | null | undefined): string => {
    if (!value || value === "—" || value === "null") return "—";
    const normalized = String(value).trim().toLowerCase();
    
    // Use appropriate formatter based on field
    if (key === "status") {
      return formatStatusLabel(value);
    } else if (key === "priority") {
      return formatPriorityLabel(value);
    } else {
      // For other fields, humanize enum-style values
      return humanizeEnum(value);
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-sm font-medium mb-4">Activity</p>
      <div className="space-y-4">
        {visibleActivities.map((activity, index) => {
          const actorName = activity.actor?.full_name || activity.actor?.email || "System";
          const hasNext = index < visibleActivities.length - 1;
          const absoluteTime = formatDateInTZ(activity.created_at, timezone);
          const relativeTime = formatTimeAgo(activity.created_at);

          return (
            <div key={activity.id} className="relative flex gap-3">
              {/* Timeline line */}
              <div className="flex flex-col items-center">
                <div className="h-2 w-2 rounded-full bg-blue-600 mt-1" />
                {hasNext && <div className="w-px h-full bg-gray-200 mt-2 min-h-[2rem]" />}
              </div>

              {/* Content */}
              <div className="flex-1 pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{actorName}</span>
                      {activity.summary && (
                        <>
                          {" • "}
                          <span className="text-muted-foreground">{activity.summary}</span>
                        </>
                      )}
                    </p>
                    {activity.diff && (
                      <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                        {Object.entries(activity.diff).map(([key, value]) => {
                          const before = formatDiffValue(key, value.before as string | null | undefined);
                          const after = formatDiffValue(key, value.after as string | null | undefined);
                          const fieldLabel = humanizeEnum(key);
                          return (
                            <div key={key} className="truncate">
                              {fieldLabel}: {before} → {after}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap" title={absoluteTime}>
                    {relativeTime}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-sm text-muted-foreground hover:text-zinc-900 hover:underline transition-colors"
        >
          {expanded ? "Show less" : `Show more (${activities.length - 5} more)`}
        </button>
      )}
    </div>
  );
}

