'use client';

import React from 'react';
import { Card } from '@/components/ui-horizon/card';

interface WeeklyRevenueProps {
  weeklyOutcomes: Array<{ label: string; handledCalls: number; supportTickets: number }>;
}

/**
 * WeeklyRevenue component - Weekly outcomes chart.
 * Minimal replacement for Horizon WeeklyRevenue.
 */
export default function WeeklyRevenue({ weeklyOutcomes }: WeeklyRevenueProps) {
  const maxValue = Math.max(
    ...weeklyOutcomes.flatMap(w => [w.handledCalls, w.supportTickets]),
    1
  );

  return (
    <Card className="p-6">
      <h3 className="mb-4 text-lg font-bold text-navy-700 dark:text-white">
        Weekly Outcomes
      </h3>
      <div className="space-y-3">
        {weeklyOutcomes.map((week, idx) => (
          <div key={idx} className="flex items-center gap-4">
            <div className="w-20 text-xs text-gray-600 dark:text-gray-400">
              {week.label}
            </div>
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2">
                <div className="w-16 text-xs text-gray-600 dark:text-gray-400">Calls:</div>
                <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${(week.handledCalls / maxValue) * 100}%` }}
                  />
                </div>
                <div className="text-xs font-medium">{week.handledCalls}</div>
              </div>
              <div className="flex-1 flex items-center gap-2">
                <div className="w-16 text-xs text-gray-600 dark:text-gray-400">Tickets:</div>
                <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${(week.supportTickets / maxValue) * 100}%` }}
                  />
                </div>
                <div className="text-xs font-medium">{week.supportTickets}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
