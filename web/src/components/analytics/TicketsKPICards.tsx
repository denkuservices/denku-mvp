import type { TicketsAnalyticsKPIs } from "@/lib/analytics/tickets.types";
import { Card } from "@/components/ui-horizon/card";

interface TicketsKPICardsProps {
  kpis: TicketsAnalyticsKPIs;
}

export function TicketsKPICards({ kpis }: TicketsKPICardsProps) {
  const formatNumber = (n: number) => n.toLocaleString();
  const formatPercent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Tickets Created */}
      <Card>
        <p className="text-xs text-muted-foreground mb-1">Tickets Created</p>
        <p className="text-2xl font-semibold text-foreground">{formatNumber(kpis.createdCount)}</p>
      </Card>

      {/* Tickets Closed */}
      <Card>
        <p className="text-xs text-muted-foreground mb-1">Tickets Closed</p>
        <p className="text-2xl font-semibold text-foreground">{formatNumber(kpis.closedCount)}</p>
      </Card>

      {/* Open Tickets Now */}
      <Card>
        <p className="text-xs text-muted-foreground mb-1">Open Tickets Now</p>
        <p className="text-2xl font-semibold text-foreground">{formatNumber(kpis.openNowCount)}</p>
      </Card>

      {/* SLA Breaches */}
      <Card>
        <p className="text-xs text-muted-foreground mb-1">SLA Breaches</p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-semibold text-foreground">{formatNumber(kpis.slaBreachedCount)}</p>
          <p className="text-sm text-muted-foreground">({formatPercent(kpis.slaBreachedRate)})</p>
        </div>
      </Card>
    </div>
  );
}

