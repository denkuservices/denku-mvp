"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

/**
 * Conversations over time (Sprint 12 · decision D3 — reuse ApexCharts, already in the bundle).
 *
 * Home and Analytics both showed breakdowns as static bar lists, so the product could say
 * *what* happened but never *when* — and "are we busier than last week?" is the first question
 * an owner asks. This is the one chart that answers it.
 *
 * Deliberately plain: one series, an area fill, no toolbar, no animation-on-scroll. The data is
 * the point. Rendered client-side because ApexCharts needs the DOM.
 */
export default function TrendChart({
  labels,
  values,
  label = "Conversations",
  height = 260,
}: {
  labels: string[];
  values: number[];
  label?: string;
  height?: number;
}) {
  const options: ApexOptions = {
    chart: {
      type: "area",
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily: "inherit",
      parentHeightOffset: 0,
    },
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: 2 },
    colors: ["#7551FF"],
    fill: {
      type: "gradient",
      gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.02, stops: [0, 90, 100] },
    },
    grid: { borderColor: "rgba(148,163,184,0.2)", strokeDashArray: 4, xaxis: { lines: { show: false } } },
    xaxis: {
      categories: labels,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { colors: "#94a3b8", fontSize: "11px" }, rotate: 0, hideOverlappingLabels: true },
      tooltip: { enabled: false },
    },
    yaxis: {
      // Whole conversations only — a fractional tick would be meaningless here.
      labels: { style: { colors: "#94a3b8", fontSize: "11px" }, formatter: (v) => String(Math.round(v)) },
      min: 0,
      forceNiceScale: true,
    },
    tooltip: { theme: "dark", x: { show: true } },
    legend: { show: false },
  };

  return (
    <div style={{ height }}>
      <Chart options={options} series={[{ name: label, data: values }]} type="area" width="100%" height="100%" />
    </div>
  );
}
