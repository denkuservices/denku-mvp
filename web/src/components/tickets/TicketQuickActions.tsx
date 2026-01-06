"use client";

import { useState, useTransition } from "react";
import { updateTicket } from "@/lib/tickets/actions";
import { useRouter } from "next/navigation";

type TicketQuickActionsProps = {
  ticketId: string;
  orgId: string;
  userId: string;
  currentStatus: string;
  currentPriority: string;
  statusOptions: string[];
  priorityOptions: string[];
  canMutate: boolean;
};

export function TicketQuickActions({
  ticketId,
  orgId,
  userId,
  currentStatus,
  currentPriority,
  statusOptions,
  priorityOptions,
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

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === currentStatus) {
      setIsOpen(false);
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateTicket(orgId, userId, {
          orgId,
          ticketId,
          patch: { status: newStatus },
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
    if (newPriority === currentPriority) {
      setIsOpen(false);
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateTicket(orgId, userId, {
          orgId,
          ticketId,
          patch: { priority: newPriority },
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
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border bg-white shadow-lg">
            <div className="p-1">
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground">Update Status</div>
              {statusOptions.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => handleStatusChange(status)}
                  disabled={isPending || status === currentStatus}
                  className={`w-full px-3 py-1.5 text-left text-xs ${
                    status === currentStatus
                      ? "bg-zinc-50 font-medium"
                      : "hover:bg-zinc-50"
                  } disabled:opacity-50`}
                >
                  {status}
                </button>
              ))}

              <div className="my-1 border-t" />

              <div className="px-3 py-2 text-xs font-medium text-muted-foreground">Update Priority</div>
              {priorityOptions.map((priority) => (
                <button
                  key={priority}
                  type="button"
                  onClick={() => handlePriorityChange(priority)}
                  disabled={isPending || priority === currentPriority}
                  className={`w-full px-3 py-1.5 text-left text-xs ${
                    priority === currentPriority
                      ? "bg-zinc-50 font-medium"
                      : "hover:bg-zinc-50"
                  } disabled:opacity-50`}
                >
                  {priority}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

