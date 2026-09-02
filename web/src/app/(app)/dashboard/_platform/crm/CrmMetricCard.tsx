import React from "react";
import Link from "next/link";

const TONES = {
  violet: {
    icon: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20",
    glow: "from-violet-500/10",
  },
  teal: {
    icon: "bg-teal-50 text-teal-600 ring-teal-100 dark:bg-teal-400/10 dark:text-teal-300 dark:ring-teal-400/20",
    glow: "from-teal-500/10",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20",
    glow: "from-amber-500/10",
  },
  sky: {
    icon: "bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/20",
    glow: "from-sky-500/10",
  },
} as const;

/**
 * A metric that can also be a filter.
 *
 * These cards used to be read-only: "Qualified 4" sat above a list you then had to filter by hand
 * to see which four. A number on a CRM dashboard is a question — *who are they?* — and the answer
 * is one click away in the same data, so `href` turns each card into the segment it counts.
 * `active` reflects the segment currently applied, so the strip doubles as a breadcrumb.
 *
 * Cards without an `href` stay plain `div`s, because a card that looks clickable and is not is
 * worse than one that never invited the click.
 */
export default function CrmMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "violet",
  href,
  active = false,
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: keyof typeof TONES;
  href?: string;
  active?: boolean;
}) {
  const styles = TONES[tone];

  const shell = `group relative isolate block overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition duration-300 dark:bg-navy-800 ${
    active
      ? "border-brand-500 ring-1 ring-brand-500/30 dark:border-brand-400/50"
      : "border-gray-200/80 dark:border-white/10"
  } ${href ? "hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg" : "hover:-translate-y-0.5 hover:shadow-lg"}`;

  const body = (
    <>
      <div
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 -z-10 h-20 bg-gradient-to-b ${styles.glow} to-transparent opacity-70`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-navy-700 dark:text-white">
            {value}
          </p>
          <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{detail}</p>
        </div>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition duration-300 group-hover:scale-105 ${styles.icon}`}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} aria-current={active ? "true" : undefined} className={shell}>
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}
