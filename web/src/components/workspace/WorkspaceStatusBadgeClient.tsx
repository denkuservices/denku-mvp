"use client";

import * as React from "react";
import { WorkspaceStatusBadge } from "./WorkspaceStatusBadge";

/**
 * Client component that fetches workspace status and displays the badge.
 * Uses /api/billing/summary as the single source of truth.
 */
export function WorkspaceStatusBadgeClient({ className }: { className?: string }) {
  const [workspaceStatus, setWorkspaceStatus] = React.useState<"active" | "paused">("active");
  const [pausedReason, setPausedReason] = React.useState<"manual" | "hard_cap" | "past_due" | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/billing/summary");
        const data = await res.json();
        if (data.ok) {
          const status = (data.workspace_status as "active" | "paused") || "active";
          const reason = (data.paused_reason as "manual" | "hard_cap" | "past_due" | null) || null;
          setWorkspaceStatus(status);
          setPausedReason(reason);
        }
      } catch (err) {
        // Silently fail - keep defaults
        console.error("[WorkspaceStatusBadge] Failed to fetch status:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
  }, []);

  // Don't show badge while loading or if active (to reduce clutter)
  if (loading) {
    return null;
  }

  // Only show badge if paused
  if (workspaceStatus === "active") {
    return null;
  }

  return (
    <WorkspaceStatusBadge
      workspace_status={workspaceStatus}
      paused_reason={pausedReason}
      className={className}
    />
  );
}
