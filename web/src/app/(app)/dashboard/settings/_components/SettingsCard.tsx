"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight, type LucideIcon } from "lucide-react";
import { IconTile } from "@/app/(app)/dashboard/_platform/settings/ui";

/**
 * Index card for the **legacy** settings index (served only when `PLATFORM_UX_ENABLED` is off).
 *
 * Kept in step with the new surface rather than left behind: the rollback path is a path a
 * customer can actually be on, and a rollback that also drops you into the old visual language is
 * twice the regression. It gets the same glyph treatment; the ghost circle that used to fade in on
 * hover — a decoration that pointed at nothing — is a directional arrow now.
 */
export function SettingsCard({
  title,
  description,
  href,
  icon,
  items,
  itemHrefs,
}: {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  items?: string[];
  itemHrefs?: Record<string, string>;
}) {
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-navy-800">
      <div className="flex-1 p-6">
        <Link href={href} className="block focus:outline-none">
          <div className="flex items-start gap-3">
            <IconTile icon={icon} />
            <div className="min-w-0">
              <p className="text-base font-semibold text-navy-700 dark:text-white">{title}</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
            </div>
          </div>
        </Link>

        {items?.length ? (
          <ul className="mt-4 space-y-1.5 text-sm text-gray-700 dark:text-gray-200">
            {items.map((it) => {
              const itemHref = itemHrefs?.[it];
              return (
                <li key={it} className="flex items-center gap-1.5">
                  <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                  {itemHref ? (
                    <Link
                      href={itemHref}
                      className="transition-colors hover:text-navy-700 hover:underline dark:hover:text-white"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {it}
                    </Link>
                  ) : (
                    <span>{it}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-gray-200 bg-white px-6 py-4 dark:border-white/10 dark:bg-navy-800">
        <span className="text-xs text-gray-500">Manage settings</span>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-navy-700 shadow-sm transition-all duration-200 hover:bg-gray-50 group-hover:border-gray-300 dark:border-white/10 dark:bg-navy-800 dark:text-white dark:hover:bg-white/5 dark:group-hover:border-white/20"
        >
          Manage
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-0 ring-brand-500/15 transition-all duration-200 group-hover:ring-4" />
    </div>
  );
}
