import * as React from "react";
import { cn } from "@/lib/utils";

export interface HeroProps {
  title: string;
  subtitle?: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tooltip?: React.ReactNode;
  className?: string;
}

/**
 * Hero card adapter component.
 * Tokenized hero card for prominent metrics/values.
 * Uses existing Tailwind tokens for easy removal.
 */
export function Hero({ title, subtitle, value, icon, tooltip, className }: HeroProps) {
  return (
    <div
      className={cn(
        "rounded-xl border-2 border-border bg-gradient-to-br from-primary/12 via-background to-accent/12 p-10 shadow-sm ring-1 ring-primary/10",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-4">
            {icon}
            <p className="text-sm font-semibold text-muted-foreground leading-tight">{title}</p>
            {tooltip}
          </div>
          <div className="text-5xl font-extrabold text-primary mt-3 leading-tight tracking-tight">{value}</div>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-4 leading-relaxed">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

