"use client";

import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { ConnectOwnNumberFlow } from "@/app/(app)/dashboard/channels/phone-numbers/_components/ConnectOwnNumberFlow";

/**
 * The dashboard's "connect a number you already own" flow, opened from onboarding.
 *
 * Deliberately a thin wrapper around the SAME component the dashboard uses rather than an
 * onboarding-shaped copy of it. That flow is where the feature actually lives: it knows the
 * carrier recipes, that Vapi refuses a hostname on an inbound gateway, and that the middle
 * screen — the exact values to paste into the carrier's panel — is the product. A second copy
 * would start out identical and be wrong the first time a carrier changed.
 *
 * It renders its own `DialogHeader`/`DialogTitle`, which are Radix primitives and need a Dialog
 * root above them, so the wrapper supplies one. The chrome mirrors `AddPhoneNumberModal`'s
 * overlay for the same reason: a customer who opens this from onboarding and then from the
 * dashboard should not be looking at two different dialogs.
 */
export function ConnectOwnNumberDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative max-h-[85vh] w-full max-w-[520px] overflow-auto rounded-lg border bg-background p-6 text-left shadow-lg">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="absolute right-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
            <ConnectOwnNumberFlow
              onCancel={() => onOpenChange(false)}
              onConnected={onConnected}
            />
          </div>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
