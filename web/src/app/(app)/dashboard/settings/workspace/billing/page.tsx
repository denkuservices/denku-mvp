"use client";

import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";

export default function WorkspaceBillingPage() {
  return (
    <SettingsShell
      title="Billing"
      subtitle="Plan, payment method, and invoices."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Workspace" },
        { label: "Billing" },
      ]}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
          <p className="text-base font-semibold text-zinc-900">Plan</p>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            <p className="text-sm font-semibold text-zinc-900">Starter</p>
            <p className="mt-1 text-sm text-zinc-600">$— / month (placeholder)</p>
            <button
              disabled
              title="Coming soon"
              className="mt-4 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm opacity-60"
            >
              Upgrade plan
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
          <p className="text-base font-semibold text-zinc-900">Payment method</p>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            <p className="text-sm text-zinc-600">No payment method on file.</p>
            <button
              disabled
              title="Coming soon"
              className="mt-4 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm opacity-60"
            >
              Add payment method
            </button>
          </div>
        </div>
      </div>
    </SettingsShell>
  );
}
