import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import type { MinuteUsageSummary } from "@/lib/platform/readModel/usage";
import { Pill, Surface } from "../ui";

export default function UsageCard({ usage }: { usage: MinuteUsageSummary | null }) {
  if (!usage) {
    return (
      <Surface className="h-full overflow-hidden bg-gradient-to-br from-navy-700 to-[#1c1a55] text-white dark:from-navy-800 dark:to-navy-900">
        <div className="flex h-full min-h-64 flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Plan usage</p>
            <h3 className="mt-3 text-xl font-semibold">Usage will appear here</h3>
            <p className="mt-2 max-w-xs text-sm leading-6 text-white/65">
              Once voice calling is active, your included and remaining minutes will update here.
            </p>
          </div>
          <Link href="/dashboard/settings/workspace/billing#usage" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-white">
            View billing <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </Surface>
    );
  }

  const visiblePercent = Math.min(usage.percentUsed, 100);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - visiblePercent / 100);
  const monthLabel = new Date(`${usage.month}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <Surface className="h-full overflow-hidden bg-gradient-to-br from-navy-700 via-[#25205c] to-brand-500 text-white dark:from-navy-800 dark:via-[#211d50] dark:to-brand-700">
      <div className="flex h-full min-h-64 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Plan usage</p>
            <h3 className="mt-1 text-lg font-semibold">{monthLabel}</h3>
          </div>
          <Pill className="border-white/15 bg-white/10 text-white">{usage.planName}</Pill>
        </div>

        <div className="mt-3 grid flex-1 grid-cols-[144px_1fr] items-center gap-3">
          <div className="relative h-36 w-36" aria-label={`${usage.percentUsed}% of included minutes used`}>
            <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden="true">
              <defs>
                <linearGradient id="usage-progress" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="100%" stopColor="#8ee7ff" />
                </linearGradient>
              </defs>
              <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="10" />
              <circle
                cx="64"
                cy="64"
                r={radius}
                fill="none"
                stroke="url(#usage-progress)"
                strokeLinecap="round"
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-semibold tabular-nums">{usage.percentUsed}%</span>
              <span className="text-xs text-white/55">used</span>
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 text-white/60">
              <Clock3 className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Voice minutes</span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {usage.usedMinutes.toLocaleString()}
              <span className="ml-1 text-sm font-normal text-white/55">/ {usage.includedMinutes.toLocaleString()} min</span>
            </p>
            <p className={`mt-1 text-sm ${usage.overageMinutes > 0 ? "text-amber-200" : "text-white/65"}`}>
              {usage.overageMinutes > 0
                ? `${usage.overageMinutes.toLocaleString()} over plan allowance`
                : `${usage.remainingMinutes.toLocaleString()} minutes remaining`}
            </p>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-white/55">
          <span>Updates as calls are completed</span>
          <Link href="/dashboard/settings/workspace/billing#usage" className="inline-flex items-center gap-1 font-medium text-white hover:text-white/80">
            Usage details <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </Surface>
  );
}
