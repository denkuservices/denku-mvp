"use client";

/** The pre-Sprint-8.5 settings index. Served when PLATFORM_UX_ENABLED is off. */

import { Bot, Building2, CreditCard, Gauge, UserRound } from "lucide-react";
import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";
import { SettingsCard } from "@/app/(app)/dashboard/settings/_components/SettingsCard";

export default function LegacySettingsIndex() {
  return (
    <SettingsShell>
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <SettingsCard
          icon={UserRound}
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
          icon={Building2}
          title="Workspace"
          description="Company identity, members, and operational defaults."
          href="/dashboard/settings/workspace/general"
          items={["General", "Members", "Audit log"]}
        />

        <SettingsCard
          icon={Bot}
          title="Agents"
          description="Configure agent behavior, language, and advanced overrides."
          href="/dashboard/settings/agents"
          items={["My agents", "Behavior", "Advanced"]}
        />

        {/* Shortcut → canonical workspace billing */}
        <SettingsCard
          icon={CreditCard}
          title="Billing"
          description="Plan, payment methods, and invoices for this workspace."
          href="/dashboard/settings/workspace/billing"
          items={["Plan", "Invoices", "Payment methods"]}
        />

        {/* Shortcut → canonical workspace usage */}
        <SettingsCard
          icon={Gauge}
          title="Usage"
          description="Call volume, limits, and usage analytics."
          href="/dashboard/settings/workspace/usage"
          items={["Usage summary", "Limits", "Overages"]}
        />
      </div>
    </SettingsShell>
  );
}
