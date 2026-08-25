"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Radio, Building2, CreditCard, User, Plug, ExternalLink } from "lucide-react";
import { SETTINGS_GROUPS } from "./nav";

/**
 * Persistent settings navigation (Sprint 8.5 / R-128, audit S-001).
 *
 * Settings previously had **no navigation of any kind** — changing section meant going back to the
 * index. Every mature product (Stripe, Linear, Vercel) keeps a settings rail visible. This renders
 * as a sidebar on desktop and a horizontal scroller on mobile, so it works on a phone too.
 */

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  users: Users,
  radio: Radio,
  building: Building2,
  "credit-card": CreditCard,
  user: User,
  plug: Plug,
};

export default function SettingsNav() {
  const pathname = usePathname() ?? "";

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Settings" className="lg:w-60 lg:shrink-0">
      {/* Mobile: horizontal scroller. Desktop: vertical rail. */}
      <div className="flex gap-4 overflow-x-auto pb-2 lg:flex-col lg:gap-6 lg:overflow-visible lg:pb-0">
        {SETTINGS_GROUPS.filter((g) => !g.elsewhere).map((group) => {
          const Icon = ICONS[group.icon] ?? Plug;
          return (
            <div key={group.id} className="min-w-max lg:min-w-0">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <Icon className="h-3.5 w-3.5" />
                {group.label}
              </p>
              <ul className="flex gap-1 lg:flex-col">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition lg:whitespace-normal ${
                          active
                            ? "bg-brand-500/10 font-semibold text-brand-600 dark:bg-brand-400/10 dark:text-brand-300"
                            : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                        }`}
                      >
                        {item.label}
                        {item.external ? <ExternalLink className="h-3 w-3 opacity-50" /> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {/*
          Wayfinding, not a section. Employee behaviour and channel connections were deliberately
          moved onto the objects they belong to (Sprint 10 · R-094, Sprint 11), so listing them as
          peers of Billing and Account implied five settings sections where there are three. They
          stay reachable — a customer who looks for "where do I change what my AI says" in Settings
          should find the way out, not a dead end.
        */}
        <div className="min-w-max lg:min-w-0 lg:border-t lg:border-gray-200 lg:pt-4 dark:lg:border-white/10">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Configured elsewhere
          </p>
          <ul className="flex gap-1 lg:flex-col">
            {SETTINGS_GROUPS.filter((g) => g.elsewhere).flatMap((group) =>
              group.items.map((item) => {
                const Icon = ICONS[group.icon] ?? Plug;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-100 lg:whitespace-normal dark:text-gray-300 dark:hover:bg-white/5"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      {group.label}
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-40" />
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
