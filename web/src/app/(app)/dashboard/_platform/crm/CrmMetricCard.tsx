import React from "react";

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

export default function CrmMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "violet",
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: keyof typeof TONES;
}) {
  const styles = TONES[tone];

  return (
    <div className="group relative isolate overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-navy-800">
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
    </div>
  );
}
