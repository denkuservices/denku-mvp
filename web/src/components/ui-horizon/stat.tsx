import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "./card";

export interface StatProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  helperText?: string;
  className?: string;
}

/**
 * Stat (KPI) adapter component.
 * Standardizes small metric cards using the Card adapter.
 * Uses existing Tailwind tokens for easy removal.
 */
export function Stat({ label, value, icon, helperText, className }: StatProps) {
  return (
    <Card className={cn("h-full p-4 max-w-full", className)}>
      <div className="flex items-center gap-3">
        {/* Icon circle */}
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10">
            <div className="text-navy-700 dark:text-white [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
          </div>
        )}
        
        {/* Text content */}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="text-xs font-medium text-gray-600 dark:text-white/60 leading-tight">{label}</div>
          <div className="mt-0.5 text-xl font-semibold text-navy-700 dark:text-white leading-tight tracking-tight">{value}</div>
          {helperText && (
            <div className="mt-0.5 text-[10px] text-gray-500 dark:text-white/40 leading-relaxed">{helperText}</div>
          )}
        </div>
      </div>
    </Card>
  );
}

