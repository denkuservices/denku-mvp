"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  CreditCard,
  Radio,
  Settings2,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { SETTINGS_ITEMS, SETTINGS_ELSEWHERE, type SettingsIcon, type SettingsNavItem } from "./nav";

/**
 * Persistent settings navigation (Sprint 8.5 / R-128, audit S-001; flattened when Settings went
 * from nine pages to three; given glyphs and a description line in the visual pass).
 *
 * Settings once had **no navigation of any kind** — changing section meant going back to the
 * index. It then had too much: five group headings over nine items, plus an index repeating all
 * of them, plus a tab strip inside Account. Three sections need no grouping, so the rail is a
 * flat list, with the destinations that live outside Settings kept visibly apart from it.
 *
 * **What the visual pass changed.** The rail was three words in grey. Nothing distinguished
 * "Workspace" from "Account" until you read them, and the active item was a tint you could miss
 * on a bright screen. Each item now carries its own glyph and its one-line purpose — the
 * `description` field already existed in the contract and was rendered nowhere — and the active
 * item is marked by a brand rail on its leading edge as well as by tint, so it survives being
 * glanced at.
 *
 * On mobile the rail is a horizontal scroller of icon+label chips: the descriptions would eat the
 * viewport, and the "Configured elsewhere" group used to wrap into the middle of the tab row.
 */

const ICONS: Record<SettingsIcon, LucideIcon> = {
  workspace: Building2,
  billing: CreditCard,
  account: UserRound,
  employees: Users,
  channels: Radio,
};

function RailLink({ item, active }: { item: SettingsNavItem; active?: boolean }) {
  const Icon = ICONS[item.icon];
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition lg:items-start lg:gap-3 lg:whitespace-normal lg:py-2.5 ${
        active
          ? "bg-brand-500/10 text-brand-600 dark:bg-brand-400/10 dark:text-brand-300"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
      }`}
    >
      {/* The active marker. Tint alone reads as "slightly different grey" on a bright screen. */}
      <span
        aria-hidden="true"
        className={`absolute left-0 top-1/2 hidden h-6 w-[3px] -translate-y-1/2 rounded-full bg-brand-500 transition-opacity lg:block dark:bg-brand-400 ${
          active ? "opacity-100" : "opacity-0"
        }`}
      />

      <span
        aria-hidden="true"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition lg:mt-0.5 ${
          active
            ? "bg-brand-500 text-white dark:bg-brand-400 dark:text-navy-900"
            : "bg-gray-100 text-gray-500 group-hover:text-navy-700 dark:bg-white/10 dark:text-gray-300 dark:group-hover:text-white"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>

      <span className="min-w-0">
        <span className={`flex items-center gap-1 ${active ? "font-semibold" : "font-medium"}`}>
          {item.label}
          {item.external ? <ArrowUpRight className="h-3 w-3 shrink-0 opacity-50" /> : null}
        </span>
        {/* The purpose line has always been in the contract; only the rail never showed it. */}
        <span className="mt-0.5 hidden text-xs leading-snug text-gray-500 lg:block dark:text-gray-400">
          {item.description}
        </span>
      </span>
    </Link>
  );
}

export default function SettingsNav() {
  const pathname = usePathname() ?? "";
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Settings" className="lg:w-64 lg:shrink-0">
      <div className="lg:sticky lg:top-6">
        <div className="mb-3 hidden items-center gap-2 px-3 lg:flex">
          <Settings2 aria-hidden="true" className="h-4 w-4 text-gray-400" />
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Settings</p>
        </div>

        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 lg:mx-0 lg:flex-col lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0">
          <ul className="flex gap-1 lg:flex-col">
            {SETTINGS_ITEMS.map((item) => (
              <li key={item.href}>
                <RailLink item={item} active={isActive(item.href)} />
              </li>
            ))}
          </ul>

          {/*
            Wayfinding, not sections. Employee behaviour and channel connections were deliberately
            moved onto the objects they belong to (R-094, Sprint 11); listing them as peers of
            Billing and Account misrepresented the shape of the product.
          */}
          <div className="min-w-max lg:min-w-0 lg:border-t lg:border-gray-200 lg:pt-4 dark:lg:border-white/10">
            <p className="mb-1.5 hidden px-3 text-xs font-semibold uppercase tracking-wide text-gray-400 lg:block">
              Configured elsewhere
            </p>
            <ul className="flex gap-1 lg:flex-col">
              {SETTINGS_ELSEWHERE.map((item) => (
                <li key={item.href}>
                  <RailLink item={item} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </nav>
  );
}
