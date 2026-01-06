import { formatUSD, formatDuration } from "@/lib/analytics/format";
import type { ByAgentRow } from "@/lib/analytics/types";

type ByAgentTableProps = {
  rows: ByAgentRow[];
};

export function ByAgentTable({ rows }: ByAgentTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-white">
        <div className="border-b p-4">
          <p className="text-sm font-medium">By agent</p>
          <p className="text-xs text-muted-foreground">Top agents by call volume</p>
        </div>
        <div className="p-10 text-center">
          <p className="text-sm font-medium">No calls</p>
          <p className="mt-1 text-sm text-muted-foreground">Make a test call to populate analytics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b p-4">
        <p className="text-sm font-medium">By agent</p>
        <p className="text-xs text-muted-foreground">Top agents by call volume</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Calls</th>
              <th className="px-4 py-3 font-medium">Avg duration</th>
              <th className="px-4 py-3 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.agent_name} className="border-b last:border-b-0">
                <td className="px-4 py-3">
                  <div className="text-sm font-medium">{r.agent_name}</div>
                </td>
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

