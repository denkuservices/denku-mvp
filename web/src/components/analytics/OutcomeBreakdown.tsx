import type { OutcomeBreakdownRow } from "@/lib/analytics/types";

type OutcomeBreakdownProps = {
  rows: OutcomeBreakdownRow[];
};

export function OutcomeBreakdown({ rows }: OutcomeBreakdownProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-white">
        <div className="border-b p-4">
          <p className="text-sm font-medium">Outcome breakdown</p>
          <p className="text-xs text-muted-foreground">Call outcomes distribution</p>
        </div>
        <div className="p-10 text-center">
          <p className="text-sm font-medium">No data</p>
          <p className="mt-1 text-sm text-muted-foreground">No calls with outcomes in this range.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b p-4">
        <p className="text-sm font-medium">Outcome breakdown</p>
        <p className="text-xs text-muted-foreground">Call outcomes distribution</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-3 font-medium">Outcome</th>
              <th className="px-4 py-3 font-medium">Calls</th>
              <th className="px-4 py-3 font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.outcome} className="border-b last:border-b-0">
                <td className="px-4 py-3 font-medium">{r.outcome}</td>
                <td className="px-4 py-3">{r.calls}</td>
                <td className="px-4 py-3">{r.percentage.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

