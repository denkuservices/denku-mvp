"use client";

import { useState, useEffect } from "react";

type RuntimeCardProps = {
  timezone: string | null;
  accessLabel: string;
  workspaceStatus: "active" | "paused";
};

export function RuntimeCard({
  timezone,
  accessLabel,
  workspaceStatus: initialWorkspaceStatus,
}: RuntimeCardProps) {
  const [workspaceStatus, setWorkspaceStatus] = useState<"active" | "paused">(initialWorkspaceStatus);

  // Update when initialWorkspaceStatus changes (from router.refresh())
  useEffect(() => {
    setWorkspaceStatus(initialWorkspaceStatus);
  }, [initialWorkspaceStatus]);

  // Listen for updates from WorkspaceControlsCard
  useEffect(() => {
    (window as any).__updateRuntimeWorkspaceStatus = (newStatus: "active" | "paused") => {
      setWorkspaceStatus(newStatus);
    };
    return () => {
      delete (window as any).__updateRuntimeWorkspaceStatus;
    };
  }, []);
  return (
    <section className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 p-6 shadow-sm">
      <div>
        <p className="text-base font-semibold text-navy-700 dark:text-white">Runtime</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Operational context for this workspace.</p>
      </div>

      <div className="mt-4 space-y-3">
        <ReadOnlyRow label="Environment" value="Production" badge />
        <ReadOnlyRow label="Status" value={workspaceStatus === "active" ? "Active" : "Paused"} badge />
        <ReadOnlyRow label="Timezone" value={timezone || "—"} />
        <ReadOnlyRow label="Access" value={accessLabel} badge />
      </div>
    </section>
  );
}

function ReadOnlyRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-4 py-3">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
      {badge ? (
        <span className="inline-flex rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200">
          {value}
        </span>
      ) : (
        <span className="text-sm font-semibold text-navy-700 dark:text-white">{value}</span>
      )}
    </div>
  );
}


