"use client";

import { useState, useTransition } from "react";
import { updateTicket } from "@/lib/tickets/actions";
import { useRouter } from "next/navigation";

type TicketPrimaryActionProps = {
  ticketId: string;
  orgId: string;
  userId: string;
  currentStatus: string;
  canMutate: boolean;
  isPaused: boolean;
};

export function TicketPrimaryAction({
  ticketId,
  orgId,
  userId,
  currentStatus,
  canMutate,
  isPaused,
}: TicketPrimaryActionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!canMutate || isPaused) {
    return null;
  }

  // Normalize status: treat "resolved" as "closed"
  const statusLower = currentStatus.toLowerCase();
  const normalizedStatus = statusLower === "resolved" ? "closed" : statusLower;
  const isOpenOrInProgress = normalizedStatus === "open" || normalizedStatus === "in_progress";
  const isClosed = normalizedStatus === "closed";

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

  const handleClose = () => {
    startTransition(async () => {
      try {
        const result = await updateTicket(orgId, userId, {
          orgId,
          ticketId,
          patch: { status: "closed" },
          source: "primary_action",
        });

        if (result?.ok === true) {
          router.refresh();
        } else {
          alert(`Failed to close ticket: ${parseActionError(result?.error ?? result)}`);
        }
      } catch (e) {
        alert(`Failed to close ticket: ${parseActionError(e)}`);
      }
    });
  };

  const handleReopen = () => {
    startTransition(async () => {
      try {
        const result = await updateTicket(orgId, userId, {
          orgId,
          ticketId,
          patch: { status: "open" },
          source: "primary_action",
        });

        if (result?.ok === true) {
          router.refresh();
        } else {
          alert(`Failed to reopen ticket: ${parseActionError(result?.error ?? result)}`);
        }
      } catch (e) {
        alert(`Failed to reopen ticket: ${parseActionError(e)}`);
      }
    });
  };

  if (isOpenOrInProgress) {
    return (
      <button
        type="button"
        onClick={handleClose}
        disabled={isPending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        Close ticket
      </button>
    );
  }

  if (isClosed) {
    return (
      <button
        type="button"
        onClick={handleReopen}
        disabled={isPending}
        className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
      >
        Reopen ticket
      </button>
    );
  }

  return null;
}

