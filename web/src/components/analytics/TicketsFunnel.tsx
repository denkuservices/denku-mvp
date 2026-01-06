import type { TicketsAnalyticsFunnel } from "@/lib/analytics/tickets.types";

interface TicketsFunnelProps {
  funnel: TicketsAnalyticsFunnel;
}

export function TicketsFunnel({ funnel }: TicketsFunnelProps) {
  const formatNumber = (n: number) => n.toLocaleString();
  const formatPercent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

  return (
    <div className="rounded-xl border bg-white p-6">
      <p className="text-sm font-medium mb-4">Ticket Funnel</p>
      <div className="space-y-4">
        {/* Created */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium">Created</p>
            <p className="text-sm text-muted-foreground">{formatNumber(funnel.created)}</p>
          </div>
          <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div className="h-full bg-zinc-900 rounded-full" style={{ width: "100%" }} />
          </div>
        </div>

        {/* In Progress */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium">Reached In Progress</p>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{formatNumber(funnel.inProgress)}</p>
              <p className="text-xs text-muted-foreground">
                ({formatPercent(funnel.createdToInProgressRate)})
              </p>
            </div>
          </div>
          <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-600 rounded-full"
              style={{ width: `${(funnel.inProgress / funnel.created) * 100}%` }}
            />
          </div>
        </div>

        {/* Closed */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium">Closed</p>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{formatNumber(funnel.closed)}</p>
              <p className="text-xs text-muted-foreground">
                ({formatPercent(funnel.inProgressToClosedRate)})
              </p>
            </div>
          </div>
          <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-400 rounded-full"
              style={{ width: `${(funnel.closed / funnel.created) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

