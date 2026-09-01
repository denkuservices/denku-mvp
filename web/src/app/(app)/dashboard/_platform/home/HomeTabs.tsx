import Link from "next/link";

export type HomeTab = "today" | "analytics";

/** Junk in the URL falls back to Today rather than 404-ing, like every other platform filter. */
export function resolveHomeTab(raw: string | string[] | undefined): HomeTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "analytics" ? "analytics" : "today";
}

const TABS: Array<{ id: HomeTab; label: string; href: string }> = [
  { id: "today", label: "Today", href: "/dashboard" },
  { id: "analytics", label: "Analytics", href: "/dashboard?tab=analytics" },
];

/**
 * Home's two views.
 *
 * Analytics used to be its own nav item, which meant the sidebar offered two answers to one
 * question: Home led with outcomes, and Analytics repeated the same numbers one click away. A
 * business with a single AI employee does not need a second dashboard, and the sixth nav item was
 * the one carrying the least weight.
 *
 * **This is a relocation, not a removal.** Sprint 12 restored ranges, period comparison, hourly
 * rhythm and CSV export after a "cleanup" quietly dropped them; every one of those still lives
 * here, and `/dashboard/analytics` redirects rather than disappearing.
 */
export default function HomeTabs({ active }: { active: HomeTab }) {
  return (
    <div className="mb-6 inline-flex gap-1 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm dark:border-white/10 dark:bg-navy-800">
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-xl px-5 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-navy-700 text-white shadow-sm dark:bg-white dark:text-navy-800"
                : "text-gray-500 hover:bg-gray-50 hover:text-navy-700 dark:hover:bg-white/5 dark:hover:text-white"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
