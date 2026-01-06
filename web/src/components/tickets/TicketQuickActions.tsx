"use client";

import { useState, useTransition } from "react";
import { updateTicket } from "@/lib/tickets/actions";
import { useRouter } from "next/navigation";
import { getStatusLabel, getPriorityLabel } from "@/lib/tickets/utils.client";

// Single source of truth for default options
const DEFAULT_STATUSES = ["open", "in_progress", "closed"] as const;
const DEFAULT_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

type TicketQuickActionsProps = {
  ticketId: string;
  orgId: string;
  userId: string;
  currentStatus: string;
  currentPriority: string;
  statusOptions: string[]; // Not used, kept for backward compatibility
  priorityOptions: string[]; // Not used, kept for backward compatibility
  canMutate: boolean;
};

export function TicketQuickActions({
  ticketId,
  orgId,
  userId,
  currentStatus,
  currentPriority,
  canMutate,
}: TicketQuickActionsProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!canMutate) {
    return null;
  }

  // Safe error parser - never crashes on undefined/null/unknown error types
  function parseActionError(err: unknown): string {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    if (err instanceof Error) return err.message || "Unknown error";
    if (typeof err === "object" && "message" in err && typeof (err as any).message === "string") {
      return (err as any).message;
    }
    return "Unknown error";
  }

  // Normalize status: map resolved -> closed defensively
  const normalizeStatus = (status: string): string => {
    const normalized = status.trim().toLowerCase();
    return normalized === "resolved" ? "closed" : normalized;
  };

  // Validate and normalize priority
  const normalizePriority = (priority: string): string | null => {
    const normalized = priority.trim().toLowerCase();
    if (DEFAULT_PRIORITIES.includes(normalized as any)) {
      return normalized;
    }
    return null; // Invalid priority, reject update
  };

  const handleStatusChange = (newStatus: string) => {
    const normalizedStatus = normalizeStatus(newStatus);
    const currentStatusNorm = normalizeStatus(currentStatus);

    if (normalizedStatus === currentStatusNorm) {
      setIsOpen(false);
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateTicket(orgId, userId, {
          orgId,
          ticketId,
          patch: { status: normalizedStatus },
          source: "dropdown",
        });

        if (result?.ok === true) {
          router.refresh();
          setIsOpen(false);
        } else {
          alert(`Failed to update status: ${parseActionError(result?.error ?? result)}`);
        }
      } catch (e) {
        alert(`Failed to update status: ${parseActionError(e)}`);
      }
    });
  };

  const handlePriorityChange = (newPriority: string) => {
    const normalizedPriority = normalizePriority(newPriority);
    if (!normalizedPriority) {
      alert(`Invalid priority: ${newPriority}`);
      return;
    }

    const currentPriorityNorm = (currentPriority ?? "").trim().toLowerCase();
    if (normalizedPriority === currentPriorityNorm) {
      setIsOpen(false);
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateTicket(orgId, userId, {
          orgId,
          ticketId,
          patch: { priority: normalizedPriority },
        });

        if (result?.ok === true) {
          router.refresh();
          setIsOpen(false);
        } else {
          alert(`Failed to update priority: ${parseActionError(result?.error ?? result)}`);
        }
      } catch (e) {
        alert(`Failed to update priority: ${parseActionError(e)}`);
      }
    });
  };

  // Check if current status/priority is in defaults for highlighting
  const currentStatusNorm = normalizeStatus(currentStatus);
  const currentPriorityNorm = (currentPriority ?? "").trim().toLowerCase();
  const isCurrentStatus = (status: string) => normalizeStatus(status) === currentStatusNorm;
  const isCurrentPriority = (priority: string) => priority.toLowerCase() === currentPriorityNorm;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isPending}
        className="rounded-md border bg-white px-2 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50"
        title="Quick actions"
      >
        ⋯
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Dropdown */}
          <div className="absolute right-0 z-20 mt-1 min-w-[220px] rounded-lg border border-zinc-200 bg-white shadow-lg">
            {/* Header */}
            <div className="border-b border-zinc-100 px-4 py-2.5">
              <p className="text-sm font-semibold text-zinc-900">Quick actions</p>
            </div>

            <div className="p-2">
              {/* Update Status Section */}
              <div className="mb-1">
                <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Update status
                </p>
                <div className="space-y-0.5">
                  {DEFAULT_STATUSES.map((status) => {
                    const isCurrent = isCurrentStatus(status);
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => handleStatusChange(status)}
                        disabled={isPending || isCurrent}
                        className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                          isCurrent
                            ? "bg-zinc-100 font-medium text-zinc-900"
                            : "text-zinc-700 hover:bg-zinc-50"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {getStatusLabel(status)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Divider */}
              <div className="my-2 border-t border-zinc-100" />

              {/* Update Priority Section */}
              <div>
                <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Update priority
                </p>
                <div className="space-y-0.5">
                  {DEFAULT_PRIORITIES.map((priority) => {
                    const isCurrent = isCurrentPriority(priority);
                    return (
                      <button
                        key={priority}
                        type="button"
                        onClick={() => handlePriorityChange(priority)}
                        disabled={isPending || isCurrent}
                        className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                          isCurrent
                            ? "bg-zinc-100 font-medium text-zinc-900"
                            : "text-zinc-700 hover:bg-zinc-50"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {getPriorityLabel(priority)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
