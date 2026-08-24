"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CRM_SECTIONS } from "./nav";

/**
 * CRM hub tabs (Phase 2).
 *
 * A horizontal tab rail rather than Settings' vertical sidebar: the CRM has two peer sections
 * that share a page's full width for tables, whereas Settings has six groups of forms. The
 * active-state language, focus behaviour and brand accent are identical to `SettingsNav` on
 * purpose — one navigation grammar across the product.
 */
export default function CrmTabs() {
  const pathname = usePathname() ?? "";
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="CRM" className="border-b border-gray-200 dark:border-white/10">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {CRM_SECTIONS.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition ${
                  active
                    ? "border-brand-500 font-semibold text-brand-600 dark:text-brand-300"
                    : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
