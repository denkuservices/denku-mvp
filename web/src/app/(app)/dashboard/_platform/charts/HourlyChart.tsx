"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

/**
 * When customers actually reach out, by hour (Sprint 12).
 *
 * The legacy dashboard's "Daily Traffic" chart answered a question none of the platform surfaces
 * could: which hours are busy. That is staffing information — it tells an owner when the AI is
 * carrying the most load. It belongs in Analytics rather than on Home, where depth is demoted
 * below the day's work.
 *
 * Hours are UTC, and the caption says so; inventing a local-time bucketing the data does not
 * support would be worse than being explicit.
 */
export default function HourlyChart({ values, height = 220 }: { values: number[]; height?: number }) {
  const options: ApexOptions = {
    chart: {
      type: "bar",
      toolbar: { show: false },
      fontFamily: "inherit",
      parentHeightOffset: 0,
    },
    plotOptions: { bar: { borderRadius: 3, columnWidth: "60%" } },
    dataLabels: { enabled: false },
    colors: ["#7551FF"],
    grid: { borderColor: "rgba(148,163,184,0.2)", strokeDashArray: 4, xaxis: { lines: { show: false } } },
    xaxis: {
      categories: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}`),
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { colors: "#94a3b8", fontSize: "10px" }, hideOverlappingLabels: true },
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: { style: { colors: "#94a3b8", fontSize: "11px" }, formatter: (v) => String(Math.round(v)) },
      min: 0,
      forceNiceScale: true,
    },
    tooltip: { theme: "dark", x: { formatter: (v) => `${String(v).padStart(2, "0")}:00 UTC` } },
    legend: { show: false },
  };

  return (
    <div style={{ height }}>
      <Chart options={options} series={[{ name: "Conversations", data: values }]} type="bar" width="100%" height="100%" />
    </div>
  );
}
