import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: "default" | "info" | "success" | "warning" | "destructive" | "outline";
  className?: string;
  dot?: boolean;
}

/**
 * Badge (pill) adapter component.
 * Horizon-style badge using existing Tailwind tokens.
 * Uses existing Tailwind tokens for easy removal.
 */
export function Badge({ children, variant = "default", className, dot = false, ...props }: BadgeProps) {
  const variantClasses = {
    default: "border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300",
    info: "border-brand-200 bg-brand-500/10 text-brand-600 dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-300",
    success: "border-green-200 bg-green-50 text-green-700 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300",
    warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    destructive: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
    outline: "border-gray-200 bg-transparent text-navy-700 dark:border-white/10 dark:text-white",
  };

  const dotClasses = {
    default: "bg-gray-400",
    info: "bg-brand-500",
    success: "bg-green-500",
    warning: "bg-amber-500",
    destructive: "bg-red-500",
    outline: "bg-gray-400",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-tight",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {dot ? <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClasses[variant])} /> : null}
      {children}
    </span>
  );
}

