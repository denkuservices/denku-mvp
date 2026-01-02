"use client";

import Link from "next/link";

export function SettingsCard({
  title,
  description,
  href,
  items,
}: {
  title: string;
  description: string;
  href: string;
  items?: string[];
}) {
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      {/* CONTENT */}
      <Link href={href} className="block flex-1 p-6 focus:outline-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-zinc-900">{title}</p>
            <p className="mt-2 text-sm text-zinc-600">{description}</p>
          </div>
          <span className="pointer-events-none h-8 w-8 rounded-full bg-zinc-100 opacity-0 blur-[1px] transition-opacity duration-200 group-hover:opacity-100" />
        </div>

        {items?.length ? (
          <ul className="mt-4 space-y-2 text-sm text-zinc-700">
            {items.map((it) => (
              <li key={it} className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-900" />
                <span>{it}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Link>

      {/* FOOTER (always pinned) */}
      <div className="mt-auto flex items-center justify-between border-t border-zinc-200 bg-white px-6 py-4">
        <span className="text-xs text-zinc-500">Manage settings</span>

        <Link
          href={href}
          className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition-all duration-200 hover:bg-zinc-50 group-hover:border-zinc-300"
        >
          Manage →
        </Link>
      </div>

      {/* premium hover ring */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-0 ring-zinc-100 transition-all duration-200 group-hover:ring-4" />
    </div>
  );
}
