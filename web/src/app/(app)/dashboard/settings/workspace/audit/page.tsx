"use client";

import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";

export default function WorkspaceAuditPage() {
  return (
    <SettingsShell
      title="Audit log"
      subtitle="Track key actions across the workspace."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Workspace" },
        { label: "Audit" },
      ]}
    >
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
          <p className="text-sm font-semibold text-zinc-900">Coming soon</p>
          <p className="mt-1 text-sm text-zinc-600">
            Audit entries will appear here (agent updates, key rotations, member invites, billing events).
          </p>
        </div>
      </div>
    </SettingsShell>
  );
}
