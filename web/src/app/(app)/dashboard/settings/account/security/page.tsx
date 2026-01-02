"use client";

import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";

export default function AccountSecurityPage() {
  return (
    <SettingsShell
      title="Account security"
      subtitle="Password reset and session security."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Account" },
        { label: "Security" },
      ]}
    >
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-6">
        <Section
          title="Password"
          desc="Reset your password and strengthen account security."
          action="Send password reset email"
        />
        <Section
          title="Active sessions"
          desc="Review signed-in sessions and revoke access if needed."
          action="View sessions"
        />
      </div>
    </SettingsShell>
  );
}

function Section({ title, desc, action }: { title: string; desc: string; action: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
      <p className="text-base font-semibold text-zinc-900">{title}</p>
      <p className="mt-1 text-sm text-zinc-600">{desc}</p>
      <button
        type="button"
        disabled
        title="Coming soon"
        className="mt-4 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm opacity-60"
      >
        {action}
      </button>
    </div>
  );
}
