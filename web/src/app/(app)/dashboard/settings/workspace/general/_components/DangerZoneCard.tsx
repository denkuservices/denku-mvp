"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type DangerZoneCardProps = {
  role: "owner" | "admin" | "viewer";
};

export function DangerZoneCard({ role }: DangerZoneCardProps) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canDisable = role === "owner" || role === "admin";
  const isConfirmed = confirmText === "DISABLE";

  const handleDisable = () => {
    if (!isConfirmed) return;

    startTransition(async () => {
      try {
        // TODO: Implement server action to disable workspace
        // For now, show error that it's not available in MVP
        setError("Workspace disable is not yet available in MVP.");
        setTimeout(() => {
          setError(null);
          setOpen(false);
          setConfirmText("");
        }, 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to disable workspace");
      }
    });
  };

  return (
    <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-zinc-900">Danger zone</p>
          <p className="mt-1 text-sm text-zinc-600">Irreversible actions. Use with caution.</p>
        </div>
        {!canDisable && (
          <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
            Owner only
          </span>
        )}
      </div>

      <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-red-900">Disable workspace</p>
            <p className="mt-1 text-sm text-red-900/80">
              Temporarily disable all agents and stop processing inbound webhooks.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => canDisable && setOpen(true)}
            disabled={!canDisable}
            className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Disable
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Disable workspace</DialogTitle>
            <DialogDescription>
              This will pause all agents and stop processing inbound webhooks. This action can be
              reversed, but may cause service interruptions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-900">
                Type <span className="font-mono font-semibold">DISABLE</span> to confirm:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DISABLE"
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
              onClick={handleDisable}
              disabled={!isConfirmed || isPending}
              className="rounded-xl border border-red-200 bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Disabling..." : "Disable workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

