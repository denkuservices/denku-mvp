import type { TicketsAnalyticsKPIs } from "@/lib/analytics/tickets.types";

interface TicketsKPICardsProps {
  kpis: TicketsAnalyticsKPIs;
}

export function TicketsKPICards({ kpis }: TicketsKPICardsProps) {
  const formatNumber = (n: number) => n.toLocaleString();
  const formatPercent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Tickets Created */}
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground mb-1">Tickets Created</p>
        <p className="text-2xl font-semibold">{formatNumber(kpis.createdCount)}</p>
      </div>

      {/* Tickets Closed */}
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground mb-1">Tickets Closed</p>
        <p className="text-2xl font-semibold">{formatNumber(kpis.closedCount)}</p>
      </div>

      {/* Open Tickets Now */}
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground mb-1">Open Tickets Now</p>
        <p className="text-2xl font-semibold">{formatNumber(kpis.openNowCount)}</p>
      </div>

      {/* SLA Breaches */}
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground mb-1">SLA Breaches</p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-semibold">{formatNumber(kpis.slaBreachedCount)}</p>
          <p className="text-sm text-muted-foreground">({formatPercent(kpis.slaBreachedRate)})</p>
        </div>
      </div>
    </div>
  );
}

