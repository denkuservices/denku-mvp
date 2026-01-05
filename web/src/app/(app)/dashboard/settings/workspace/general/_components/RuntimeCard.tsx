"use client";

import Link from "next/link";

type RuntimeCardProps = {
  timezone: string | null;
  accessLabel: string;
};

export function RuntimeCard({ timezone, accessLabel }: RuntimeCardProps) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-base font-semibold text-zinc-900">Runtime</p>
        <p className="mt-1 text-sm text-zinc-600">Operational context for this workspace.</p>
      </div>

      <div className="mt-4 space-y-3">
        <ReadOnlyRow label="Environment" value="Production" badge />
        <ReadOnlyRow label="Timezone" value={timezone || "—"} />
        <ReadOnlyRow label="Access" value={accessLabel} badge />
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-200">
        <Link
          href="/dashboard/settings/integrations"
          className="text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:underline"
        >
          Manage integrations →
        </Link>
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
    <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      {badge ? (
        <span className="inline-flex rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700">
          {value}
        </span>
      ) : (
        <span className="text-sm font-semibold text-zinc-900">{value}</span>
      )}
    </div>
  );
}


