import Link from "next/link";
import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";
import { getWorkspaceGeneral } from "@/app/(app)/dashboard/settings/_actions/workspace";
import { WorkspaceGeneralForm } from "./_components/WorkspaceGeneralForm";

export default async function WorkspaceGeneralPage() {
  // Fetch initial data
  const { orgId, role, orgName, settings } = await getWorkspaceGeneral();

  // Mock data for Runtime, Webhooks, and Danger zone sections (keeping existing UI)
  const webhook = {
    url: "https://YOUR_DOMAIN/api/webhooks/voice",
    events: ["end-of-call-report", "call-started", "call-ended"],
  };

  const integrations = {
    voice: { status: "Connected", note: "Call delivery is healthy." },
    sync: { status: "Enabled", note: "Agent sync is enabled (computed later)." },
    lastSync: "1/1/2026, 6:13:05 PM",
  };

  // Determine access badge
  const accessLabel = role === "owner" ? "Owner" : role === "admin" ? "Admin" : role || "Member";

  return (
    <SettingsShell
      title="Workspace"
      subtitle="Company identity, defaults, and operational settings."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Workspace" },
        { label: "General" },
      ]}
    >
      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <QuickLink href="/dashboard/settings/workspace/members" label="Members" />
        <QuickLink href="/dashboard/settings/workspace/audit" label="Audit log" />
      </div>

      {/* Top: Identity + Runtime */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Identity */}
        <section className="lg:col-span-2 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <Header
            title="Workspace identity"
            desc="Used across your agents and messaging. Company name can be injected into greetings automatically."
          />

          <WorkspaceGeneralForm initialSettings={settings} role={role} orgId={orgId} orgName={orgName} />
        </section>

        {/* Runtime */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <Header title="Runtime" desc="Operational context for this workspace." />

          <div className="mt-6 space-y-4">
            <ReadOnlyRow label="Environment" value="Production" badge />
            <ReadOnlyRow label="Region" value="us-east-1" />
            <ReadOnlyRow label="Access" value={accessLabel} badge />
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            <p className="text-sm font-semibold text-zinc-900">Voice infrastructure</p>
            <p className="mt-1 text-sm text-zinc-600">
              Provider details are abstracted. You manage outcomes — we manage the plumbing.
            </p>

            <div className="mt-4 space-y-3">
              <StatusRow label="Connection" status={integrations.voice.status} note={integrations.voice.note} />
              <StatusRow label="Sync" status={integrations.sync.status} note={integrations.sync.note} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600">Last sync</span>
                <span className="font-medium text-zinc-900">{integrations.lastSync}</span>
              </div>
            </div>

            <div className="mt-4">
              <Link
                href="/dashboard/settings/integrations"
                className="text-sm font-semibold text-zinc-900 hover:underline"
              >
                Manage integrations →
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* Webhooks */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <Header
          title="Webhooks"
          desc="Inbound events for call reporting and lifecycle tracking."
        />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-zinc-900">Webhook URL</p>
            <input
              readOnly
              value={webhook.url}
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-mono shadow-sm"
            />
            <p className="text-xs text-zinc-500">
              Coming soon: Webhook configuration will be available here.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-zinc-900">Subscribed events</p>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <ul className="space-y-2 text-sm text-zinc-700">
                {webhook.events.map((e) => (
                  <li key={e} className="flex items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-900" />
                    <span className="font-mono">{e}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-zinc-900">Danger zone</p>
            <p className="mt-1 text-sm text-zinc-600">
              Irreversible actions. Use with caution.
            </p>
          </div>
          <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
            Restricted
          </span>
        </div>

        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-red-900">Disable workspace</p>
              <p className="mt-1 text-sm text-red-900/80">
                Temporarily disable all agents and stop processing webhooks.
              </p>
            </div>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm opacity-60"
            >
              Disable
            </button>
          </div>
        </div>
      </section>
    </SettingsShell>
  );
}

/* ----------------------------- UI bits ----------------------------- */

function Header({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <p className="text-base font-semibold text-zinc-900">{title}</p>
      <p className="mt-1 text-sm text-zinc-600">{desc}</p>
    </div>
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

function StatusRow({
  label,
  status,
  note,
}: {
  label: string;
  status: string;
  note: string;
}) {
  const isGood = status.toLowerCase() === "connected" || status.toLowerCase() === "enabled";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-zinc-900">{label}</p>
          <p className="mt-1 text-xs text-zinc-600">{note}</p>
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
            isGood
              ? "border-zinc-200 bg-zinc-900 text-white"
              : "border-zinc-200 bg-white text-zinc-700"
          }`}
        >
          {status}
        </span>
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
    >
      {label}
    </Link>
  );
}
