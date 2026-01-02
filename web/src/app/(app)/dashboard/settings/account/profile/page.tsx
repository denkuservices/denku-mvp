"use client";

import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";

export default function AccountProfilePage() {
  return (
    <SettingsShell
      title="Account profile"
      subtitle="Manage your personal profile details."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Account" },
        { label: "Profile" },
      ]}
    >
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Full name" value="Denku" />
          <Field label="Email" value="you@example.com" />
          <Field label="Phone" value="+1 (___) ___-____" />
          <Field label="Timezone" value="America/New_York" />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            This is UI-only for now. Persistence will be added after the UI is finalized.
          </p>
          <button
            type="button"
            disabled
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm opacity-60"
            title="Coming soon"
          >
            Save changes
          </button>
        </div>
      </div>
    </SettingsShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-zinc-900">{label}</p>
      <input
        readOnly
        value={value}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm"
      />
    </div>
  );
}
