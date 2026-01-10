import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToolbarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

/**
 * Toolbar adapter component.
 * Horizon-style horizontal bar for page-level actions and filters.
 * Uses existing Tailwind tokens for easy removal.
 */
export function Toolbar({ left, right, className, compact = false }: ToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        compact ? "py-2" : "py-4",
        className
      )}
    >
      {left && (
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {left}
        </div>
      )}
      {right && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {right}
        </div>
      )}
    </div>
  );
}

