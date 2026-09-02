"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export interface OutcomeSlice {
  key: string;
  label: string;
  value: number;
}

/**
 * Outcome breakdown as a Horizon-themed donut.
 *
 * The bar list this replaces answered "which outcome is biggest?" but not "how much of the
 * week was that?" — and outcomes are parts of one whole (every conversation lands in exactly
 * one bucket), which is the one shape a pie is actually correct for. The set is small and
 * closed (support · appointment · other · unknown), so the usual objection to pies — too many
 * near-equal wedges — doesn't apply here.
 *
 * Honesty rules carried over from BarList: exact counts are printed in the legend beside the
 * percentage, so nothing is readable *only* as an angle, and an empty range says so rather
 * than drawing an empty ring.
 *
 * Theme: Horizon UI. Colours are the template's own chart palette (`variables/charts.ts`),
 * pinned per outcome so a slice keeps its colour between renders and between the two pages
 * that draw this. The centre total is HTML rather than an ApexCharts label so Tailwind's
 * `dark:` variants handle the navy surface — Apex would need a hardcoded hex per theme.
 */

/** Pinned per-outcome colours — a slice must not change colour when the ordering changes. */
const OUTCOME_COLORS: Record<string, string> = {
  appointment: "#4318FF", // Horizon primary — the outcome that makes money
  support: "#6AD2FF", // Horizon sky
  other: "#A195FD", // brand-200
  unknown: "#8F9BBA", // Horizon gray — legible on both bone and navy cards
};

/** For any outcome the product grows later. Horizon's status hues, in a stable order. */
const FALLBACK_COLORS = ["#01B574", "#FFB547", "#EE5D50", "#7551FF", "#39B8FF", "#C0B8FE"];

function colorFor(key: string, index: number): string {
  return OUTCOME_COLORS[key] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

export default function OutcomeDonut({
  items,
  emptyLabel = "No outcomes recorded yet",
  height = 208,
}: {
  items: OutcomeSlice[];
  emptyLabel?: string;
  height?: number;
}) {
  const slices = (items ?? []).filter((i) => i.value > 0);
  const total = slices.reduce((sum, i) => sum + i.value, 0);

  if (slices.length === 0 || total === 0) {
    return <p className="text-sm text-gray-500">{emptyLabel}</p>;
  }

  const colors = slices.map((s, i) => colorFor(s.key, i));

  const options: ApexOptions = {
    chart: {
      type: "donut",
      fontFamily: "inherit",
      parentHeightOffset: 0,
      animations: { enabled: true, speed: 400 },
    },
    labels: slices.map((s) => s.label),
    colors,
    fill: { colors },
    // A white ring divider would show as a seam on the navy card, so the gap is transparent.
    stroke: { width: 2, colors: ["transparent"] },
    dataLabels: { enabled: false },
    legend: { show: false },
    plotOptions: {
      pie: {
        expandOnClick: false,
        donut: {
          size: "72%",
          labels: { show: false },
        },
      },
    },
    states: { hover: { filter: { type: "lighten" } } },
    tooltip: {
      theme: "dark",
      y: {
        formatter: (v: number) => `${v} (${Math.round((v / total) * 100)}%)`,
        title: { formatter: (name: string) => `${name}:` },
      },
    },
  };

  return (
    <div>
      <div className="relative mx-auto" style={{ height, maxWidth: height * 1.4 }}>
        <Chart
          options={options}
          series={slices.map((s) => s.value)}
          type="donut"
          width="100%"
          height="100%"
        />
        {/* Centre readout — the total the slices add up to, so the ring is never just a shape. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-navy-700 dark:text-white">{total}</span>
          <span className="text-[11px] uppercase tracking-wide text-gray-400">Total</span>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {slices.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colors[i] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-navy-700 dark:text-gray-200">{s.label}</span>
            <span className="shrink-0 tabular-nums text-gray-500">{s.value}</span>
            <span className="w-10 shrink-0 text-right tabular-nums text-xs text-gray-400">
              {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
