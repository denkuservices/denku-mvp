"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { SETTINGS_ITEMS, SETTINGS_ELSEWHERE } from "./nav";

/**
 * Persistent settings navigation (Sprint 8.5 / R-128, audit S-001; flattened when Settings went
 * from nine pages to three).
 *
 * Settings once had **no navigation of any kind** — changing section meant going back to the
 * index. It then had too much: five group headings over nine items, plus an index repeating all
 * of them, plus a tab strip inside Account. Three sections need no grouping, so the rail is a
 * flat list, with the destinations that live outside Settings kept visibly apart from it.
 *
 * Sidebar on desktop, horizontal scroller on mobile — it works on a phone either way.
 */
function RailLink({
  href,
  label,
  active,
  external,
}: {
  href: string;
  label: string;
  active?: boolean;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition lg:whitespace-normal ${
        active
          ? "bg-brand-500/10 font-semibold text-brand-600 dark:bg-brand-400/10 dark:text-brand-300"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
      }`}
    >
      {label}
      {external ? <ExternalLink className="h-3 w-3 shrink-0 opacity-40" /> : null}
    </Link>
  );
}

export default function SettingsNav() {
  const pathname = usePathname() ?? "";
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Settings" className="lg:w-56 lg:shrink-0">
      <div className="flex gap-4 overflow-x-auto pb-2 lg:flex-col lg:gap-6 lg:overflow-visible lg:pb-0">
        <ul className="flex gap-1 lg:flex-col">
          {SETTINGS_ITEMS.map((item) => (
            <li key={item.href}>
              <RailLink href={item.href} label={item.label} active={isActive(item.href)} />
            </li>
          ))}
        </ul>

        {/*
          Wayfinding, not sections. Employee behaviour and channel connections were deliberately
          moved onto the objects they belong to (R-094, Sprint 11); listing them as peers of
          Billing and Account misrepresented the shape of the product.
        */}
        <div className="min-w-max lg:min-w-0 lg:border-t lg:border-gray-200 lg:pt-4 dark:lg:border-white/10">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Configured elsewhere
          </p>
          <ul className="flex gap-1 lg:flex-col">
            {SETTINGS_ELSEWHERE.map((item) => (
              <li key={item.href}>
                <RailLink href={item.href} label={item.label} external />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}
