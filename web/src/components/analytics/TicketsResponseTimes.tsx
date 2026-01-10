import type { TicketsAnalyticsResponseTimes } from "@/lib/analytics/tickets.types";
import { formatDuration } from "@/lib/analytics/tickets.utils";
import { Card } from "@/components/ui-horizon/card";

interface TicketsResponseTimesProps {
  responseTimes: TicketsAnalyticsResponseTimes;
}

export function TicketsResponseTimes({ responseTimes }: TicketsResponseTimesProps) {
  return (
    <Card>
      <p className="text-sm font-medium text-foreground mb-4">Response Times</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* First Response */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">First Response</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Median</p>
              <p className="text-sm font-medium text-foreground">
                {formatDuration(responseTimes.firstResponseMedianSec)}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">P90</p>
              <p className="text-sm font-medium text-foreground">
                {formatDuration(responseTimes.firstResponseP90Sec)}
              </p>
            </div>
          </div>
        </div>

        {/* Time to Close */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Time to Close</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Median</p>
              <p className="text-sm font-medium text-foreground">
                {formatDuration(responseTimes.timeToCloseMedianSec)}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">P90</p>
              <p className="text-sm font-medium text-foreground">
                {formatDuration(responseTimes.timeToCloseP90Sec)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

