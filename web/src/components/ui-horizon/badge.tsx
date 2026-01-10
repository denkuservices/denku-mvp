import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "destructive" | "outline";
  className?: string;
}

/**
 * Badge (pill) adapter component.
 * Horizon-style badge using existing Tailwind tokens.
 * Uses existing Tailwind tokens for easy removal.
 */
export function Badge({ children, variant = "default", className, ...props }: BadgeProps) {
  const variantClasses = {
    default: "bg-muted text-muted-foreground border-border",
    success: "bg-primary/10 text-primary border-primary/20",
    warning: "bg-accent/20 text-foreground border-border",
    destructive: "bg-destructive/10 text-destructive border-destructive/20",
    outline: "bg-transparent text-foreground border-border",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border leading-tight",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

