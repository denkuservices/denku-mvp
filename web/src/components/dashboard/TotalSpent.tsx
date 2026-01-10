'use client';

import React from 'react';
import { Card } from '@/components/ui-horizon/card';

interface TotalSpentProps {
  totalCallsThisMonth: number;
  totalCallsLastMonth: number;
  totalCallsSeries: Array<{ monthLabel: string; value: number }>;
  handledCallsSeries: Array<{ monthLabel: string; value: number }>;
}

/**
 * TotalSpent component - Call volume chart.
 * Minimal replacement for Horizon TotalSpent.
 */
export default function TotalSpent({
  totalCallsThisMonth,
  totalCallsLastMonth,
  handledCallsSeries,
}: TotalSpentProps) {
  const change = totalCallsLastMonth > 0 
    ? ((totalCallsThisMonth - totalCallsLastMonth) / totalCallsLastMonth * 100).toFixed(1)
    : '0';
  const isPositive = totalCallsThisMonth >= totalCallsLastMonth;

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-navy-700 dark:text-white">
          Total Calls
        </h3>
        <div className="flex items-center gap-1">
          <span className={`text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? '↑' : '↓'} {Math.abs(parseFloat(change))}%
          </span>
        </div>
      </div>
      <div className="text-3xl font-bold text-navy-700 dark:text-white">
        {totalCallsThisMonth.toLocaleString()}
      </div>
      <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        This month vs last month
      </div>
      {/* Simple chart placeholder - can be enhanced with recharts later */}
      <div className="mt-4 h-32 flex items-end gap-2">
        {handledCallsSeries.slice(-6).map((item, idx) => (
          <div
            key={idx}
            className="flex-1 bg-brand-500 rounded-t"
            style={{ height: `${Math.max((item.value / Math.max(...handledCallsSeries.map(s => s.value))) * 100, 10)}%` }}
            title={`${item.monthLabel}: ${item.value}`}
          />
        ))}
      </div>
    </Card>
  );
}
