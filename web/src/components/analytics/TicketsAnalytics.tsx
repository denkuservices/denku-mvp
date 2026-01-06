import "server-only";
import type { TicketsAnalyticsResult } from "@/lib/analytics/tickets.types";
import { formatDuration } from "@/lib/analytics/tickets.utils";
import { TicketsKPICards } from "./TicketsKPICards";
import { TicketsFunnel } from "./TicketsFunnel";
import { TicketsResponseTimes } from "./TicketsResponseTimes";
import { TicketsSeries } from "./TicketsSeries";

interface TicketsAnalyticsProps {
  data: TicketsAnalyticsResult;
  range: "24h" | "7d" | "30d" | "90d";
}

export function TicketsAnalytics({ data, range }: TicketsAnalyticsProps) {
  // Always show KPIs, even if all counts are 0
  const hasAnyData =
    data.kpis.createdCount > 0 ||
    data.kpis.openNowCount > 0 ||
    data.kpis.closedCount > 0;

  return (
    <div className="space-y-6">
      {/* KPI Cards - Always render */}
      <TicketsKPICards kpis={data.kpis} />

      {/* Only show other sections if there's data */}
      {hasAnyData ? (
        <>
          {/* Funnel */}
          <TicketsFunnel funnel={data.funnel} />

          {/* Response Times */}
          <TicketsResponseTimes responseTimes={data.responseTimes} />

          {/* Series Charts */}
          <TicketsSeries series={data.series} range={range} />
        </>
      ) : (
        <div className="rounded-xl border bg-white p-8 text-center">
          <p className="text-sm text-muted-foreground">No tickets for this range.</p>
        </div>
      )}
    </div>
  );
}

