import type { OutcomeBreakdownRow } from "@/lib/analytics/types";
import { Card } from "@/components/ui-horizon/card";

type OutcomeBreakdownProps = {
  rows: OutcomeBreakdownRow[];
};

export function OutcomeBreakdown({ rows }: OutcomeBreakdownProps) {
  if (rows.length === 0) {
    return (
      <Card>
        <div className="border-b border-border p-4">
          <p className="text-sm font-medium text-foreground">Outcome breakdown</p>
          <p className="text-xs text-muted-foreground">Call outcomes distribution</p>
        </div>
        <div className="p-10 text-center">
          <p className="text-sm font-medium text-foreground">No data</p>
          <p className="mt-1 text-sm text-muted-foreground">No calls with outcomes in this range.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="border-b border-border p-4">
        <p className="text-sm font-medium text-foreground">Outcome breakdown</p>
        <p className="text-xs text-muted-foreground">Call outcomes distribution</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3 font-medium">Outcome</th>
              <th className="px-4 py-3 font-medium">Calls</th>
              <th className="px-4 py-3 font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.outcome} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 font-medium text-foreground">{r.outcome}</td>
                <td className="px-4 py-3 text-foreground">{r.calls}</td>
                <td className="px-4 py-3 text-foreground">{r.percentage.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

