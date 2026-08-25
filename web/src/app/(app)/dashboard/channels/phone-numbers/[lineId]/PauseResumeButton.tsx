"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Power } from "lucide-react";

interface PauseResumeButtonProps {
  lineId: string;
  currentStatus: string | null;
  isPreviewMode?: boolean;
}

export function PauseResumeButton({ lineId, currentStatus, isPreviewMode = false }: PauseResumeButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(currentStatus);
  
  // Sync optimistic status with prop changes (e.g., after router.refresh())
  useEffect(() => {
    setOptimisticStatus(currentStatus);
  }, [currentStatus]);
  
  // Determine current state from optimistic status (falls back to prop)
  const effectiveStatus = optimisticStatus || currentStatus;
  const isLive = (effectiveStatus || "live").toLowerCase() === "live" || (effectiveStatus || "live").toLowerCase() === "active";
  const action = isLive ? "pause" : "resume";
  const actionLabel = isLive ? "Pause line" : "Resume line";
  const loadingLabel = isLive ? "Pausing…" : "Resuming…";

  const handleAction = async () => {
    setIsPending(true);
    setError(null);

    try {
      const res = await fetch(`/api/phone-lines/${lineId}/${action}`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || `Failed to ${action} line`);
        return;
      }

      // Use status from API response if available, otherwise use optimistic update
      const newStatus = data.status || (action === "pause" ? "paused" : "live");
      setOptimisticStatus(newStatus);

      // Refresh server components to reflect updated status
      router.refresh();
    } catch (err) {
      setError(`Failed to ${action} line. Please try again.`);
    } finally {
      // Always reset loading state
      setIsPending(false);
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}
      <div className="group relative">
        <button
          onClick={handleAction}
          disabled={isPending || isPreviewMode}
          title={isPreviewMode ? "Upgrade to activate this feature" : undefined}
          className={`linear flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
            isLive
              ? "border border-amber-300 bg-white text-amber-700 hover:bg-amber-50 active:bg-amber-100 dark:border-amber-600 dark:bg-navy-800 dark:text-amber-400 dark:hover:bg-amber-950/20 dark:active:bg-amber-950/30"
              : "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:hover:bg-brand-300 dark:active:bg-brand-200"
          }`}
        >
          <Power className="h-4 w-4" />
          {isPending ? loadingLabel : actionLabel}
        </button>
        {isPreviewMode && (
          <div className="absolute left-0 top-full z-10 mt-2 hidden w-48 rounded-lg border border-gray-200 bg-white p-2 shadow-lg group-hover:block dark:border-white/20 dark:bg-navy-800">
            <p className="text-xs text-gray-700 dark:text-gray-300">
              Upgrade to activate this feature
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
