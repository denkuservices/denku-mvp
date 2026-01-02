"use client";

import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";

export default function WorkspaceMembersPage() {
  return (
    <SettingsShell
      title="Members"
      subtitle="Manage workspace access and roles."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Workspace" },
        { label: "Members" },
      ]}
    >
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="overflow-hidden rounded-2xl border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Member</th>
                <th className="px-4 py-3 text-left font-semibold">Role</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              <tr className="border-t">
                <td className="px-4 py-3 font-medium text-zinc-900">you@example.com</td>
                <td className="px-4 py-3 text-zinc-700">Admin</td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">
                    Active
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <button
          disabled
          title="Coming soon"
          className="mt-5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm opacity-60"
        >
          Invite member
        </button>
      </div>
    </SettingsShell>
  );
}
