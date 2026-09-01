"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck2, ContactRound, ClipboardList } from "lucide-react";
import { CRM_SECTIONS } from "./nav";

/**
 * CRM hub tabs (Phase 2).
 *
 * A horizontal tab rail inside the page: the CRM has two peer sections that share a page's full
 * width for tables, and switching between them is something you do while working. Settings, whose
 * sections you visit rather than flip between, keeps its sections in the sidebar instead. The
 * active-state language, focus behaviour and brand accent match the sidebar's on purpose — one
 * navigation grammar across the product.
 */
export default function CrmTabs() {
  const pathname = usePathname() ?? "";
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const icons = [ContactRound, ClipboardList, CalendarCheck2];

  return (
    <nav
      aria-label="Customers"
      className="rounded-2xl border border-gray-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-navy-800/90"
    >
      <ul className="flex gap-1 overflow-x-auto">
        {CRM_SECTIONS.map((item, index) => {
          const active = isActive(item.href);
          const Icon = icons[index];
          return (
            <li key={item.href} className="min-w-0 flex-1 sm:flex-none">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm transition sm:w-auto ${
                  active
                    ? "bg-navy-700 font-semibold text-white shadow-sm dark:bg-white dark:text-navy-900"
                    : "font-medium text-gray-500 hover:bg-gray-50 hover:text-navy-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-teal-300 dark:text-brand-600" : "text-gray-400 group-hover:text-brand-500"}`} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
