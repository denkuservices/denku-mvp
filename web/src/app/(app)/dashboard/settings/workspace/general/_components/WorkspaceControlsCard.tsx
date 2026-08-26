"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CreditCard,
  Loader2,
  Lock,
  PauseCircle,
  PhoneOff,
  PlayCircle,
  ShieldAlert,
  Database,
  RotateCcw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toggleWorkspaceStatus } from "@/app/(app)/dashboard/settings/_actions/workspace";
import { WorkspaceStatusBadge } from "@/components/workspace/WorkspaceStatusBadge";
import {
  INPUT_CLASS,
  Notice,
  Panel,
  PanelHeader,
  SettingsButton,
} from "@/app/(app)/dashboard/_platform/settings/ui";

type WorkspaceControlsCardProps = {
  role: "owner" | "admin" | "viewer";
  workspaceStatus: "active" | "paused";
  pausedReason?: "manual" | "hard_cap" | "past_due" | null;
};

/**
 * Pause / resume the workspace.
 *
 * **Why this is a danger zone now.** Pausing stops webhook processing and employee sync — in plain
 * terms, your AI stops answering. That was rendered in the same white card, with the same outline
 * button, as the workspace's timezone: a control that ends your service styled as a preference.
 * It is red-tinted, sits under its own heading, and its button is the `danger` variant, which
 * exists for exactly this and is never primary.
 *
 * The `window.__updateRuntimeWorkspaceStatus` hand-off is gone. It pushed the new status into the
 * Runtime card directly — a global function assigned by one component and called by another —
 * while `router.refresh()` on the next line already re-rendered the server component that owns the
 * value. The Runtime card is gone too; status is a header pill, refreshed the ordinary way.
 */
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
    <Panel tone="critical">
      <PanelHeader
        icon={isPaused ? PauseCircle : ShieldAlert}
        tone="critical"
        title={isPaused ? "Workspace is paused" : "Pause workspace"}
        description={
          isPaused
            ? "Your AI is not answering. Resuming restores webhook processing and employee sync."
            : "Stops webhook processing and employee sync — in practice, your AI stops answering."
        }
        action={
          <WorkspaceStatusBadge workspace_status={workspaceStatus} paused_reason={pausedReason} />
        }
      />

      <div className="mt-5 space-y-4">
        {!isPaused ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            <li className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
              <PhoneOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              Calls may still reach your phone provider unless you also disable number routing.
            </li>
            <li className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Database aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              Existing calls, tickets and contacts stay exactly as they are.
            </li>
          </ul>
        ) : null}

        {isBillingPaused ? (
          <Notice tone="warn" icon={CreditCard} title="Payment required to resume service">
            This workspace was paused by billing ({pausedReason === "hard_cap" ? "usage hard cap" : "payment past due"}),
            so it cannot be resumed from here — settle the balance in Billing and service restarts.
          </Notice>
        ) : null}

        {!canControl ? (
          <Notice tone="info" icon={Lock} title="Read-only access">
            Only owners and admins can pause or resume this workspace.
          </Notice>
        ) : null}

        <div className="flex justify-end">
          <SettingsButton
            type="button"
            variant={isPaused ? "primary" : "danger"}
            onClick={() => canControl && setOpen(true)}
            disabled={!canControl || (isPaused && !canResume)}
            title={isBillingPaused ? "Payment required to resume service." : undefined}
          >
            {isPaused ? <PlayCircle /> : <PauseCircle />}
            {isPaused ? "Resume workspace" : "Pause workspace"}
          </SettingsButton>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isPaused ? (
                <PlayCircle className="h-5 w-5 text-brand-500" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-red-500" />
              )}
              {isPaused ? "Resume workspace?" : "Pause workspace?"}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-muted-foreground">
                {isPaused ? (
                  "Webhook processing and employee sync will resume immediately."
                ) : (
                  <ul className="mt-3 space-y-2">
                    <li className="flex items-start gap-2">
                      <PhoneOff className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      Webhook events stop being processed
                    </li>
                    <li className="flex items-start gap-2">
                      <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      AI employee sync is disabled
                    </li>
                    <li className="flex items-start gap-2">
                      <Database className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      Existing data remains intact
                    </li>
                    <li className="flex items-start gap-2">
                      <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      You can resume at any time
                    </li>
                  </ul>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label htmlFor="confirm-word" className="text-sm font-medium text-navy-700 dark:text-white">
                Type <span className="font-mono font-semibold">{confirmWord}</span> to confirm
              </label>
              <input
                id="confirm-word"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={confirmWord}
                className={`${INPUT_CLASS} font-mono`}
                autoFocus
              />
            </div>
            {error ? (
              <Notice tone="critical" icon={AlertCircle}>
                {error}
              </Notice>
            ) : null}
          </div>

          <DialogFooter>
            <SettingsButton
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setConfirmText("");
                setError(null);
              }}
              disabled={isPending}
            >
              Cancel
            </SettingsButton>
            <SettingsButton
              type="button"
              variant={isPaused ? "primary" : "danger"}
              onClick={handleAction}
              disabled={!isConfirmed || isPending}
            >
              {isPending ? <Loader2 className="animate-spin" /> : isPaused ? <PlayCircle /> : <PauseCircle />}
              {isPending ? (isPaused ? "Resuming…" : "Pausing…") : isPaused ? "Resume" : "Pause"}
            </SettingsButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
