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
    <Card className={cn("h-full max-w-full p-5", className)}>
      <div className="flex items-start gap-3.5">
        {/* Icon circle */}
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500 dark:bg-brand-400/15 dark:text-brand-300 [&>svg]:h-5 [&>svg]:w-5">
            {icon}
          </div>
        )}
        
        {/* Text content */}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="text-xs font-semibold uppercase leading-tight tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
          <div className="mt-1 text-2xl font-semibold leading-tight tracking-tight text-navy-700 dark:text-white">{value}</div>
          {helperText && (
            <div className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{helperText}</div>
          )}
        </div>
      </div>
    </Card>
  );
}

