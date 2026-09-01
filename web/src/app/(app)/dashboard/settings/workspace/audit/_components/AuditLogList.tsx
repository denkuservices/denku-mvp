"use client";

import { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  CreditCard,
  History,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  ScrollText,
  Trash2,
  UserPlus,
} from "lucide-react";
import Avatar from "@/app/(app)/dashboard/_platform/Avatar";
import { EmptyState } from "@/app/(app)/dashboard/_platform/ui";
import { Panel, StatusPill } from "@/app/(app)/dashboard/_platform/settings/ui";
import { RelativeTime } from "@/components/time/ClientTime";

type AuditLogChange = {
  field: string;
  before_value: string | null;
  after_value: string | null;
};

type AuditLogWithChanges = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  actor_email: string | null;
  actor_name: string | null;
  changes: AuditLogChange[];
};

type AuditLogListProps = {
  logs: AuditLogWithChanges[];
  /** True when filters are applied — an empty result then means "no matches", not "no history". */
  filtered?: boolean;
};

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

/**
 * The glyph for an entry, matched on the action string.
 *
 * Substring matching rather than an exhaustive map on purpose: the action vocabulary grows with
 * every feature that writes an audit row, and an unknown action must still render — it falls back
 * to the generic record glyph instead of a blank space where an icon should be.
 */
function iconFor(action: string) {
  const a = action.toLowerCase();
  if (a.includes("pause")) return { icon: PauseCircle, tone: "critical" as const };
  if (a.includes("resume")) return { icon: PlayCircle, tone: "ok" as const };
  if (a.includes("invite") || a.includes("member")) return { icon: UserPlus, tone: "info" as const };
  if (a.includes("plan") || a.includes("billing") || a.includes("addon"))
    return { icon: CreditCard, tone: "brand" as const };
  if (a.includes("delete") || a.includes("remove")) return { icon: Trash2, tone: "critical" as const };
  if (a.includes("create") || a.includes("add")) return { icon: Plus, tone: "ok" as const };
  if (a.includes("update") || a.includes("change")) return { icon: Pencil, tone: "brand" as const };
  return { icon: ScrollText, tone: "neutral" as const };
}

const TONE_CLASS = {
  brand: "bg-brand-500/10 text-brand-500 dark:bg-brand-400/15 dark:text-brand-300",
  ok: "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-300",
  info: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  critical: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  neutral: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-300",
} as const;

/**
 * The audit log, as a timeline.
 *
 * It was a stack of undifferentiated blocks: three lines of grey text per entry, and the only way
 * to tell "someone paused the workspace" from "someone renamed it" was to read both. Each entry
 * now opens with the glyph of what happened, tinted by how consequential it is, threaded on a
 * connecting line so the sequence reads as time passing — and the actor is shown with the same
 * avatar they have everywhere else in the product.
 *
 * The before → after diff keeps its disclosure (an audit trail is scanned far more often than it
 * is inspected) but is now rendered as an actual transition rather than two boxes side by side.
 *
 * Two later corrections. The list no longer slices itself to five with a "show more" toggle — the
 * server pages it, so what arrives here is a page and all of it is shown. And timestamps go through
 * `RelativeTime`, which is what fixed the hydration error this component threw on every direct
 * load: it formatted in the server's timezone during SSR and in the reader's on the client, and
 * React tore the tree down over the mismatch.
 */
export function AuditLogList({ logs, filtered = false }: AuditLogListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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

  const visibleLogs = logs;

  if (logs.length === 0) {
    return (
      <Panel padded={false}>
        <EmptyState
          icon={History}
          title={filtered ? "Nothing matches those filters" : "Nothing recorded yet"}
          description={
            filtered
              ? "Widen the date range or clear the filters to see the rest of the history."
              : "Changes to workspace settings, members and plans are logged here as they happen."
          }
        />
      </Panel>
    );
  }

  return (
    <Panel padded={false}>
      <ol className="px-6 py-2">
        {visibleLogs.map((log, idx) => {
          const isExpanded = expandedIds.has(log.id);
          const hasChanges = log.changes.length > 0;
          const { icon: Icon, tone } = iconFor(log.action);
          const isLast = idx === visibleLogs.length - 1;
          const actor = getActorDisplayName(log.actor_name, log.actor_email);

          return (
            <li key={log.id} className="relative flex gap-4 pb-6 pt-4">
              {/* The thread. Dropped on the last row so the timeline ends rather than trailing. */}
              {!isLast ? (
                <span
                  aria-hidden="true"
                  className="absolute left-[19px] top-14 bottom-0 w-px bg-gray-200 dark:bg-white/10"
                />
              ) : null}

              <span
                aria-hidden="true"
                className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE_CLASS[tone]}`}
              >
                <Icon className="h-5 w-5" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-navy-700 dark:text-white">
                    {formatAction(log.action)}
                  </p>
                  <StatusPill tone="neutral">{formatEntityType(log.entity_type)}</StatusPill>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                  <Avatar name={actor} seed={log.actor_user_id ?? actor} size="sm" className="!h-5 !w-5 !text-[10px]" />
                  <span className="font-medium text-gray-600 dark:text-gray-300">{actor}</span>
                  <span aria-hidden="true">·</span>
                  <RelativeTime iso={log.created_at} />
                </div>

                {hasChanges ? (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(log.id)}
                      aria-expanded={isExpanded}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 transition hover:underline dark:text-brand-300"
                    >
                      {isExpanded ? "Hide" : "Show"} {log.changes.length}{" "}
                      {log.changes.length === 1 ? "change" : "changes"}
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </button>

                    {isExpanded ? (
                      <div className="mt-3 space-y-3 rounded-xl border border-gray-200/80 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/5">
                        {log.changes.map((change, i) => (
                          <div key={i} className="space-y-1.5">
                            <p className="text-xs font-semibold text-navy-700 dark:text-white">
                              {change.field.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-gray-500 line-through dark:border-white/10 dark:bg-navy-800">
                                {change.before_value === null ? (
                                  <span className="italic no-underline">empty</span>
                                ) : (
                                  change.before_value
                                )}
                              </span>
                              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-gray-400" />
                              <span className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 font-medium text-green-800 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300">
                                {change.after_value === null ? (
                                  <span className="italic">empty</span>
                                ) : (
                                  change.after_value
                                )}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

    </Panel>
  );
}
