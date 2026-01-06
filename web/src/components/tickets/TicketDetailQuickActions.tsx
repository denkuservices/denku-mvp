"use client";

import { useTransition, useMemo, useState } from "react";
import { updateTicket } from "@/lib/tickets/actions";
import { useRouter } from "next/navigation";
import { StatusBadge, PriorityBadge } from "./TicketBadges";
import { getStatusLabel, getPriorityLabel } from "@/lib/tickets/utils.client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TicketDetailQuickActionsProps = {
  ticketId: string;
  orgId: string;
  userId: string;
  currentStatus: string;
  currentPriority: string;
  statusOptions: string[];
  priorityOptions: string[];
  canMutate: boolean;
  isPaused: boolean;
};

export function TicketDetailQuickActions({
  ticketId,
  orgId,
  userId,
  currentStatus,
  currentPriority,
  statusOptions,
  priorityOptions,
  canMutate,
  isPaused,
}: TicketDetailQuickActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!canMutate || isPaused) {
    return (
      <div className="flex items-center gap-2">
        <StatusBadge status={currentStatus} />
        <PriorityBadge priority={currentPriority} />
      </div>
    );
  }

  // Safe error parser - never crashes on undefined/null/unknown error types
  function parseActionError(err: unknown): string {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    if (err instanceof Error) return err.message || "Unknown error";
    // Supabase errors sometimes: { message: "...", details: ... }
    if (typeof err === "object" && "message" in err && typeof (err as any).message === "string") {
      return (err as any).message;
    }
    return "Unknown error";
  }

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === currentStatus) return;

    setErrorMsg(null);
    startTransition(async () => {
      try {
        const result = await updateTicket(orgId, userId, {
          orgId,
          ticketId,
          patch: { status: newStatus },
          source: "dropdown",
        });

        if (result?.ok === true) {
          setErrorMsg(null);
          router.refresh();
        } else {
          setErrorMsg(parseActionError(result?.error ?? result));
        }
      } catch (e) {
        setErrorMsg(parseActionError(e));
      }
    });
  };

  const handlePriorityChange = async (next: string) => {
    const normalized = (next ?? "").trim().toLowerCase();
    if (!normalized) return;
    if (normalized === currentPriority?.toLowerCase()) return;

    setErrorMsg(null);
    startTransition(async () => {
      try {
        const result = await updateTicket(orgId, userId, {
          orgId,
          ticketId,
          patch: { priority: normalized },
        });

        if (result?.ok === true) {
          setErrorMsg(null);
          router.refresh();
        } else {
          setErrorMsg(parseActionError(result?.error ?? result));
        }
      } catch (e) {
        setErrorMsg(parseActionError(e));
      }
    });
  };

  // Build status options - ONLY three statuses (no "resolved", no custom values)
  const DEFAULT_STATUSES = ["open", "in_progress", "closed"] as const;
  const dedupedStatusOptions = useMemo(() => {
    // Return only defaults - no custom values, no "resolved"
    return [...DEFAULT_STATUSES];
  }, []);

  // Build priority options - ONLY defaults (no custom values in dropdown)
  const DEFAULT_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
  const dedupedPriorityOptions = useMemo(() => {
    // Return only defaults - no custom values
    return [...DEFAULT_PRIORITIES];
  }, []);

  // Determine Select value: if current value is in defaults, use it; otherwise use first default
  // Map "resolved" to "closed" for display
  const statusSelectValue = useMemo(() => {
    const currentNorm = (currentStatus ?? "").trim().toLowerCase();
    // Treat "resolved" as "closed"
    const normalized = currentNorm === "resolved" ? "closed" : currentNorm;
    const isDefault = dedupedStatusOptions.some((s) => s.toLowerCase() === normalized);
    return isDefault ? normalized : dedupedStatusOptions[0] || "";
  }, [currentStatus, dedupedStatusOptions]);

  const prioritySelectValue = useMemo(() => {
    const currentNorm = (currentPriority ?? "").trim().toLowerCase();
    const isDefault = dedupedPriorityOptions.some((p) => p.toLowerCase() === currentNorm);
    return isDefault ? currentNorm : dedupedPriorityOptions[0] || "";
  }, [currentPriority, dedupedPriorityOptions]);

  return (
    <div className="space-y-1">
      <div className={`flex items-center gap-2 transition-opacity ${isPending ? "opacity-70 cursor-wait" : ""}`}>
        <Select 
          value={statusSelectValue}
          onValueChange={handleStatusChange} 
          disabled={isPending || isPaused}
        >
          <SelectTrigger className="h-11 min-w-[160px] rounded-xl border border-zinc-200 bg-white px-4 text-base shadow-sm hover:bg-zinc-50 focus:ring-4 focus:ring-zinc-100 disabled:opacity-50 disabled:cursor-wait">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[260px] min-w-[12rem]">
            {dedupedStatusOptions.map((status) => (
              <SelectItem key={status} value={status} className="text-base py-2">
                {getStatusLabel(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select 
          value={prioritySelectValue}
          onValueChange={handlePriorityChange} 
          disabled={isPending || isPaused}
        >
          <SelectTrigger className="h-11 min-w-[160px] rounded-xl border border-zinc-200 bg-white px-4 text-base shadow-sm hover:bg-zinc-50 focus:ring-4 focus:ring-zinc-100 disabled:opacity-50 disabled:cursor-wait">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[260px] min-w-[12rem]">
            {dedupedPriorityOptions.map((priority) => (
              <SelectItem key={priority} value={priority} className="text-base py-2">
                {getPriorityLabel(priority)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isPending && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
            <div className="h-3 w-3 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
            <span>Saving…</span>
          </div>
        )}
      </div>
      {errorMsg && (
        <p className="text-xs text-red-600">{errorMsg}</p>
      )}
    </div>
  );
}

