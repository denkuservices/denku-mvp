'use client';

import React from 'react';
import Card from '@/components/ui-horizon/card';

interface DailyTrafficProps {
  totalCallsToday: number;
  totalCallsYesterday: number;
  hourlyCallsSeries: Array<{ label: string; value: number }>;
}

/**
 * DailyTraffic component - Hourly calls chart.
 * Minimal replacement for Horizon DailyTraffic.
 */
export default function DailyTraffic({
  totalCallsToday,
  totalCallsYesterday,
  hourlyCallsSeries,
}: DailyTrafficProps) {
  const change = totalCallsYesterday > 0
    ? ((totalCallsToday - totalCallsYesterday) / totalCallsYesterday * 100).toFixed(1)
    : '0';
  const isPositive = totalCallsToday >= totalCallsYesterday;
  const maxValue = Math.max(...hourlyCallsSeries.map(h => h.value), 1);

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-navy-700 dark:text-white">
          Hourly Calls
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Today: {totalCallsToday}
          </span>
          <span className={`text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? '↑' : '↓'} {Math.abs(parseFloat(change))}%
          </span>
        </div>
      </div>
      <div className="mt-4 h-48 flex items-end gap-1">
        {hourlyCallsSeries.map((hour, idx) => (
          <div
            key={idx}
            className="flex-1 bg-brand-500 rounded-t opacity-80 hover:opacity-100 transition-opacity"
            style={{ height: `${Math.max((hour.value / maxValue) * 100, 5)}%` }}
            title={`${hour.label}: ${hour.value}`}
          />
        ))}
      </div>
      <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 text-center">
        Last 24 hours
      </div>
    </Card>
  );
}
