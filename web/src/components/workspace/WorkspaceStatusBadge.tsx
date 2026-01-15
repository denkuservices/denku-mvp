/**
 * Workspace Status Badge Component
 * 
 * Displays workspace status with appropriate labels:
 * - Active -> "Active" (green)
 * - Paused (Manual) -> "Paused (Manual)" (yellow/amber)
 * - Paused (Billing — Hard Cap) -> "Paused (Billing — Hard Cap)" (red)
 * - Paused (Billing — Past Due) -> "Paused (Billing — Past Due)" (red)
 */

import * as React from "react";

type WorkspaceStatusBadgeProps = {
  workspace_status: "active" | "paused";
  paused_reason?: "manual" | "hard_cap" | "past_due" | null;
  className?: string;
};

export function WorkspaceStatusBadge({
  workspace_status,
  paused_reason,
  className = "",
}: WorkspaceStatusBadgeProps) {
  // Determine label and variant
  let label: string;
  let variant: "success" | "warning" | "destructive" | "neutral";

  if (workspace_status === "active") {
    label = "Active";
    variant = "success";
  } else if (paused_reason === "manual") {
    label = "Paused (Manual)";
    variant = "warning";
  } else if (paused_reason === "hard_cap") {
    label = "Paused (Billing — Hard Cap)";
    variant = "destructive";
  } else if (paused_reason === "past_due") {
    label = "Paused (Billing — Past Due)";
    variant = "destructive";
  } else {
    // Fallback: paused but no reason specified
    label = "Paused";
    variant = "warning";
  }

  // Styles based on variant
  const styles =
    variant === "success"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-900/30"
      : variant === "warning"
      ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-900/30"
      : variant === "destructive"
      ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-900/30"
      : "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-white/10 dark:text-zinc-300 dark:border-white/10";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${styles} ${className}`}
    >
      {label}
    </span>
  );
}
