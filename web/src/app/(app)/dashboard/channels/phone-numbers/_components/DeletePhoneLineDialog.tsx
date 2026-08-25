"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type DeletePhoneLineDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineId: string;
  onConfirm: () => Promise<{ ok: true } | void>;
  onDeleted?: () => void;
  descriptionOverride?: string;
};

export function DeletePhoneLineDialog({
  open,
  onOpenChange,
  lineId,
  onConfirm,
  onDeleted,
  descriptionOverride,
}: DeletePhoneLineDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const result = await onConfirm();
      if (result && typeof result === "object" && "ok" in result && result.ok !== true) {
        setError("Failed to delete phone line. Please try again.");
        return;
      }
      onOpenChange(false);
      onDeleted?.();
    } catch (err) {
      setError("Failed to delete phone line. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Delete this phone line?</DialogTitle>
          <DialogDescription>
            {descriptionOverride ||
              "This will release the phone number and remove its configuration. This cannot be undone."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        )}

        {/* 
          Note: We use plain <Button> components directly in <DialogFooter> (not AlertDialogAction).
          This avoids style override issues that can occur when wrapping Button with DialogAction primitives.
          The !important utilities (!bg-red-600, !text-white) ensure visibility even if CSS variables fail
          or class order causes conflicts. The inline style provides ultimate fallback for maximum reliability.
        */}
        <DialogFooter className="!flex !flex-row !justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
            className="h-10 px-4 min-w-[80px]"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
            className="!bg-red-600 !text-white hover:!bg-red-700 focus-visible:!ring-red-600/30 !border-transparent min-h-10 px-4 min-w-[100px] !opacity-100 disabled:!opacity-60 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#dc2626", color: "#ffffff" }}
          >
            {isDeleting ? "Deleting…" : "Delete line"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

