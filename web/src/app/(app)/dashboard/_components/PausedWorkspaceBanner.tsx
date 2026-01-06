"use client";

import { AlertCircleIcon } from "lucide-react";
import Link from "next/link";

type PausedWorkspaceBannerProps = {
  workspaceStatus: "active" | "paused";
};

export function PausedWorkspaceBanner({ workspaceStatus }: PausedWorkspaceBannerProps) {
  if (workspaceStatus !== "paused") {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertCircleIcon className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900">Workspace is paused</p>
          <p className="mt-1 text-sm text-amber-800">
            Calls are blocked and agents are inactive.{" "}
            <Link
              href="/dashboard/settings/workspace/general"
              className="font-medium underline hover:text-amber-900"
            >
              Resume workspace →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

