import type { TicketsAnalyticsFunnel } from "@/lib/analytics/tickets.types";
import { Card } from "@/components/ui-horizon/card";

interface TicketsFunnelProps {
  funnel: TicketsAnalyticsFunnel;
}

export function TicketsFunnel({ funnel }: TicketsFunnelProps) {
  const formatNumber = (n: number) => n.toLocaleString();
  const formatPercent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

  return (
    <Card>
      <p className="text-sm font-medium text-foreground mb-4">Ticket Funnel</p>
      <div className="space-y-4">
        {/* Created */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-foreground">Created</p>
            <p className="text-sm text-muted-foreground">{formatNumber(funnel.created)}</p>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-foreground rounded-full" style={{ width: "100%" }} />
          </div>
        </div>

        {/* In Progress */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-foreground">Reached In Progress</p>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{formatNumber(funnel.inProgress)}</p>
              <p className="text-xs text-muted-foreground">
                ({formatPercent(funnel.createdToInProgressRate)})
              </p>
            </div>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-foreground/80 rounded-full"
              style={{ width: `${(funnel.inProgress / funnel.created) * 100}%` }}
            />
          </div>
        </div>

        {/* Closed */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-foreground">Closed</p>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{formatNumber(funnel.closed)}</p>
              <p className="text-xs text-muted-foreground">
                ({formatPercent(funnel.inProgressToClosedRate)})
              </p>
            </div>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-foreground/60 rounded-full"
              style={{ width: `${(funnel.closed / funnel.created) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

