import Link from "next/link";
import { Users, Radio, Building2, CreditCard, User, Plug, ArrowRight, AlertTriangle } from "lucide-react";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { listEmployeeViews } from "@/lib/platform/readModel/employees";
import { listConnectedChannelViews } from "@/lib/platform/readModel/channels";
import type { ConnectionHealth } from "@/lib/platform/connectionHealth";
import PageHeader from "../PageHeader";
import { Surface, Pill } from "../ui";
import { SETTINGS_GROUPS } from "./nav";

/**
 * Settings index as a **control center** (Sprint 8.5 / R-094, audit S-003/S-004).
 *
 * The previous index was a menu whose sub-items were **plain text advertising destinations that
 * didn't exist** ("Invoices", "Payment methods", "Behavior", "Advanced"). This one:
 *   - groups by what the customer *manages* (not the org chart), so future channels have a home;
 *   - makes **every item a real link** (enforced by `settings-nav.test.ts`);
 *   - shows **live status** per group — how many employees, which channels need attention — so the
 *     page answers "is everything set up?" rather than just listing links.
 *
 * Status lines are read from the platform read model; when something is unknown we say nothing
 * rather than guessing (R-018).
 */

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  users: Users,
  radio: Radio,
  building: Building2,
  "credit-card": CreditCard,
  user: User,
  plug: Plug,
};

export default async function PlatformSettingsIndex() {
  const orgId = await resolveActiveOrgId();
  const [employees, channels] = orgId
    ? await Promise.all([listEmployeeViews(orgId), listConnectedChannelViews(orgId)])
    : [[], []];

  const activeEmployees = employees.filter((e) => e.status === "active").length;
  const needsAttention = channels.filter(
    (c) => (c.meta?.health as ConnectionHealth | undefined)?.actionRequired
  ).length;

  /** Live, truthful status per group. `null` = nothing meaningful to say. */
  const status: Record<string, { text: string; tone: "ok" | "warn" | "neutral" } | null> = {
    employees:
      employees.length === 0
        ? { text: "None yet", tone: "neutral" }
        : { text: `${employees.length} employee${employees.length === 1 ? "" : "s"} · ${activeEmployees} active`, tone: activeEmployees > 0 ? "ok" : "warn" },
    channels:
      channels.length === 0
        ? { text: "None connected", tone: "warn" }
        : needsAttention > 0
          ? { text: `${needsAttention} need${needsAttention === 1 ? "s" : ""} attention`, tone: "warn" }
          : { text: `${channels.length} connected`, tone: "ok" },
    organization: null,
    billing: null,
    account: null,
    integrations: { text: "None connected yet", tone: "neutral" },
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Configure your AI workforce, the channels they work, and how your workspace runs."
      />

      {needsAttention > 0 ? (
        <Link
          href="/dashboard/channels"
          className="mb-5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            {needsAttention} channel{needsAttention === 1 ? "" : "s"} need
            {needsAttention === 1 ? "s" : ""} attention
          </span>
          <ArrowRight className="h-4 w-4 opacity-60" />
        </Link>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SETTINGS_GROUPS.map((group) => {
          const Icon = ICONS[group.icon] ?? Plug;
          const s = status[group.id];
          return (
            <Surface key={group.id} className="h-full">
              <div className="flex h-full flex-col">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 dark:bg-white/10">
                      <Icon className="h-4 w-4 text-gray-500 dark:text-gray-300" />
                    </span>
                    <p className="text-base font-semibold text-navy-700 dark:text-white">{group.label}</p>
                  </div>
                  {s ? <Pill tone={s.tone}>{s.text}</Pill> : null}
                </div>

                <ul className="flex flex-1 flex-col gap-1">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      {/* Every entry is a real destination — never decorative text. */}
                      <Link
                        href={item.href}
                        className="group flex items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-gray-50 dark:hover:bg-white/5"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-navy-700 dark:text-white">
                            {item.label}
                          </span>
                          <span className="block text-xs text-gray-500">{item.description}</span>
                        </span>
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-300 transition group-hover:text-brand-500" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </Surface>
          );
        })}
      </div>
    </div>
  );
}
