"use client";

import Link from "next/link";

export function SettingsCard({
  title,
  description,
  href,
  items,
  itemHrefs,
}: {
  title: string;
  description: string;
  href: string;
  items?: string[];
  itemHrefs?: Record<string, string>;
}) {
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      {/* CONTENT */}
      <div className="flex-1 p-6">
        <Link href={href} className="block focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-navy-700 dark:text-white">{title}</p>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{description}</p>
            </div>
            <span className="pointer-events-none h-8 w-8 rounded-full bg-gray-100 dark:bg-white/10 opacity-0 blur-[1px] transition-opacity duration-200 group-hover:opacity-100" />
          </div>
        </Link>

        {items?.length ? (
          <ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-200">
            {items.map((it) => {
              const itemHref = itemHrefs?.[it];
              return (
                <li key={it} className="flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
                  {itemHref ? (
                    <Link
                      href={itemHref}
                      className="hover:text-navy-700 dark:hover:text-white hover:underline transition-colors"
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

      {/* FOOTER (always pinned) */}
      <div className="mt-auto flex items-center justify-between border-t border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 px-6 py-4">
        <span className="text-xs text-gray-500">Manage settings</span>

        <Link
          href={href}
          className="inline-flex items-center justify-center rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 px-4 py-2 text-sm font-semibold text-navy-700 dark:text-white shadow-sm transition-all duration-200 hover:bg-gray-50 dark:hover:bg-white/5 group-hover:border-gray-300 dark:group-hover:border-white/20"
        >
          Manage →
        </Link>
      </div>

      {/* premium hover ring */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-0 ring-brand-500/15 transition-all duration-200 group-hover:ring-4" />
    </div>
  );
}
