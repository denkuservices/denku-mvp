import * as React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Horizon UI-style card adapter.
 * Uses existing Tailwind tokens for easy removal.
 */
export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-6 shadow-sm focus-within:ring-1 focus-within:ring-primary/10",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

