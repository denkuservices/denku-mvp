import { formatUSD, formatDuration, formatTrendDate } from "@/lib/analytics/format";
import type { DailyTrendRow } from "@/lib/analytics/types";

type DailyTrendTableProps = {
  rows: DailyTrendRow[];
  bucket: "day" | "week";
};

export function DailyTrendTable({ rows, bucket }: DailyTrendTableProps) {
  const title = bucket === "week" ? "Weekly trend" : "Daily trend";
  const subtitle = bucket === "week" 
    ? "Calls / cost / avg duration by week"
    : "Calls / cost / avg duration by day";

  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b p-4">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        {bucket === "week" && (
          <p className="mt-1 text-xs text-muted-foreground italic">
            Grouped by week for readability.
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Calls</th>
              <th className="px-4 py-3 font-medium">Avg duration</th>
              <th className="px-4 py-3 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date} className="border-b last:border-b-0">
                <td className="px-4 py-3 text-xs">{formatTrendDate(r.date, bucket)}</td>
                <td className="px-4 py-3">{r.calls}</td>
                <td className="px-4 py-3">{formatDuration(r.avgDuration)}</td>
                <td className="px-4 py-3">{formatUSD(r.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

