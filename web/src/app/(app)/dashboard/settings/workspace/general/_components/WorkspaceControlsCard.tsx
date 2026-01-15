"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toggleWorkspaceStatus } from "@/app/(app)/dashboard/settings/_actions/workspace";

type WorkspaceControlsCardProps = {
  role: "owner" | "admin" | "viewer";
  workspaceStatus: "active" | "paused";
  pausedReason?: "manual" | "hard_cap" | "past_due" | null;
};

export function WorkspaceControlsCard({
  role,
  workspaceStatus,
  pausedReason,
}: WorkspaceControlsCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canControl = role === "owner" || role === "admin";
  const isPaused = workspaceStatus === "paused";
  const isBillingPaused = isPaused && (pausedReason === "hard_cap" || pausedReason === "past_due");
  const canResume = isPaused && !isBillingPaused; // Only allow resume if paused_reason is 'manual' or null
  const action = isPaused ? "resume" : "pause";
  const confirmWord = isPaused ? "RESUME" : "PAUSE";
  const isConfirmed = confirmText === confirmWord;

  const handleAction = () => {
    if (!isConfirmed) return;

    startTransition(async () => {
      try {
        const result = await toggleWorkspaceStatus(action);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        // Update Runtime card immediately via window function
        if (typeof window !== "undefined" && (window as any).__updateRuntimeWorkspaceStatus) {
          (window as any).__updateRuntimeWorkspaceStatus(result.data.workspace_status);
        }

        // Close dialog and reset
        setOpen(false);
        setConfirmText("");
        setError(null);

        // Refresh server components to keep data in sync
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update workspace status");
      }
    });
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-base font-semibold text-zinc-900">Workspace controls</p>
        <p className="mt-1 text-sm text-zinc-600">Manage workspace operational state.</p>
      </div>

      <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              {isPaused ? "Resume workspace" : "Pause workspace"}
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              {isPaused
                ? "Resume webhook processing and agent sync."
                : "Pausing stops processing webhooks and disables agent sync. Calls may still reach your phone provider unless you disable the phone number routing."}
            </p>
            {isBillingPaused && (
              <p className="mt-2 text-sm font-medium text-amber-700">
                Billing issue. Update payment method to resume.
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => canControl && setOpen(true)}
            disabled={!canControl || (isPaused && !canResume)}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPaused ? "Resume workspace" : "Pause workspace"}
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{isPaused ? "Resume workspace?" : "Pause workspace?"}</DialogTitle>
            <DialogDescription>
              {isPaused ? (
                "Webhook processing and agent sync will resume."
              ) : (
                <>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-600 list-disc list-inside">
                    <li>Webhook events will not be processed</li>
                    <li>Agent sync to Vapi will be disabled</li>
                    <li>Existing data remains intact</li>
                    <li>You can resume anytime</li>
                  </ul>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-900">
                Type <span className="font-mono font-semibold">{confirmWord}</span> to confirm:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={confirmWord}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm focus:ring-4 focus:ring-zinc-100"
                autoFocus
              />
            </div>
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                setConfirmText("");
                setError(null);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAction}
              disabled={!isConfirmed || isPending}
              className="rounded-xl border border-zinc-200 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending
                ? isPaused
                  ? "Resuming..."
                  : "Pausing..."
                : isPaused
                  ? "Resume"
                  : "Pause"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

