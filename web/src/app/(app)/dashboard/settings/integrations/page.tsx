"use client";

import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";

export default function IntegrationsPage() {
  return (
    <SettingsShell
      title="Integrations"
      subtitle="Connect external services to Denku."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Integrations" },
      ]}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="CRM" desc="Sync leads and outcomes to your CRM." status="Coming soon" />
        <Card title="Calendar" desc="Book appointments straight into your calendar." status="Coming soon" />
      </div>
    </SettingsShell>
  );
}

function Card({ title, desc, status }: { title: string; desc: string; status: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-zinc-900">{title}</p>
          <p className="mt-1 text-sm text-zinc-600">{desc}</p>
        </div>
        <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
          {status}
        </span>
      </div>
    </div>
  );
}
