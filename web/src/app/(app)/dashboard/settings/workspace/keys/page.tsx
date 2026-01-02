"use client";

import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";

function maskKey(value: string) {
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

export default function WorkspaceKeysPage() {
  const apiKeys = {
    publicKey: "pk_live_1234567890abcdef",
    secretKey: "sk_live_abcdef1234567890",
  };

  return (
    <SettingsShell
      title="API keys"
      subtitle="Server-to-server access keys and rotation."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Workspace" },
        { label: "API keys" },
      ]}
    >
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-5">
        <KeyField label="Public key" value={maskKey(apiKeys.publicKey)} />
        <KeyField label="Secret key" value={maskKey(apiKeys.secretKey)} />

        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            Rotation will be implemented via audited server actions.
          </p>
          <button
            disabled
            title="Coming soon"
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm opacity-60"
          >
            Rotate keys
          </button>
        </div>
      </div>
    </SettingsShell>
  );
}

function KeyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-zinc-900">{label}</p>
      <input
        readOnly
        value={value}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-mono shadow-sm"
      />
    </div>
  );
}
