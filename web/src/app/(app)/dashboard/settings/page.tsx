"use client";

import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";
import { SettingsCard } from "@/app/(app)/dashboard/settings/_components/SettingsCard";

export default function SettingsHomePage() {
  return (
    <SettingsShell>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 mt-4">
        <SettingsCard
          title="Account"
          description="Profile and security for your personal login."
          href="/dashboard/settings/account/profile"
          items={["Profile", "Security"]}
          itemHrefs={{
            Profile: "/dashboard/settings/account/profile",
            Security: "/dashboard/settings/account/security",
          }}
        />

        <SettingsCard
          title="Workspace"
          description="Company identity, members, and operational defaults."
          href="/dashboard/settings/workspace/general"
          items={["General", "Members", "Audit log"]}
        />


        <SettingsCard
          title="Agents"
          description="Configure agent behavior, language, and advanced overrides."
          href="/dashboard/settings/agents"
          items={["My agents", "Behavior", "Advanced"]}
        />

        {/* Shortcut → canonical workspace billing */}
        <SettingsCard
          title="Billing"
          description="Plan, payment methods, and invoices for this workspace."
          href="/dashboard/settings/workspace/billing"
          items={["Plan", "Invoices", "Payment methods"]}
        />

        <SettingsCard
          title="Integrations"
          description="Voice, webhooks, and external system connections."
          href="/dashboard/settings/integrations"
          items={["Voice", "Webhooks", "CRM (coming soon)"]}
        />

        {/* Shortcut → canonical workspace usage */}
        <SettingsCard
          title="Usage"
          description="Call volume, limits, and usage analytics."
          href="/dashboard/settings/workspace/usage"
          items={["Usage summary", "Limits", "Overages"]}
        />
      </div>
    </SettingsShell>
  );
}
