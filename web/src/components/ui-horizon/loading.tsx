import * as React from "react";
import { cn } from "@/lib/utils";

export interface LoadingStateProps {
  label?: string;
  className?: string;
}

/**
 * Loading state adapter component.
 * Horizon-style loading placeholder for list/table pages.
 * Uses existing Tailwind tokens for easy removal.
 */
export function LoadingState({ label, className }: LoadingStateProps) {
  return (
    <div className={cn("p-10 text-center", className)} aria-busy="true" aria-label={label || "Loading"}>
      <div className="flex justify-center mb-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"></div>
      </div>
      {label && (
        <p className="text-sm text-muted-foreground">{label}</p>
      )}
    </div>
  );
}

