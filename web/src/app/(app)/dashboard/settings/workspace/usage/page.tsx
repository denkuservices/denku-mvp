"use client";

import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";

export default function WorkspaceUsagePage() {
  return (
    <SettingsShell
      title="Usage"
      subtitle="Track call volume and limits."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Workspace" },
        { label: "Usage" },
      ]}
    >
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Metric title="Calls (30d)" value="—" />
          <Metric title="Minutes (30d)" value="—" />
          <Metric title="Estimated cost" value="—" />
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
          <p className="text-sm font-semibold text-zinc-900">Coming soon</p>
          <p className="mt-1 text-sm text-zinc-600">
            Usage graphs, soft limits, and overage controls will be shown here.
          </p>
        </div>
      </div>
    </SettingsShell>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold text-zinc-600">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{value}</p>
    </div>
  );
}
