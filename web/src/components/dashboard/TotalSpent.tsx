'use client';

import React, { useState } from 'react';
import Card from '@/components/ui-horizon/card';
import LineChart from '@/components/charts/LineChart';
import { lineChartOptionsTotalSpent } from '@/variables/charts';
import { Calendar, Maximize2, X } from 'lucide-react';

interface TotalSpentProps {
  totalCallsThisMonth: number;
  totalCallsLastMonth: number;
  totalCallsSeries: Array<{ monthLabel: string; value: number }>;
  handledCallsSeries: Array<{ monthLabel: string; value: number }>;
}

export default function TotalSpent({
  totalCallsThisMonth,
  totalCallsLastMonth,
  handledCallsSeries,
  totalCallsSeries,
}: TotalSpentProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const changePercent = totalCallsLastMonth > 0 
    ? ((totalCallsThisMonth - totalCallsLastMonth) / totalCallsLastMonth * 100).toFixed(1)
    : '0';
  const isPositive = totalCallsThisMonth >= totalCallsLastMonth;

  const lineChartDataTotalSpent = [
    {
      name: 'Revenue',
      data: handledCallsSeries.map(item => item.value),
      color: '#4318FF',
    },
    {
      name: 'Profit',
      data: totalCallsSeries.map(item => item.value),
      color: '#6AD2FF',
    },
  ];

  const chartOptions = {
    ...lineChartOptionsTotalSpent,
    xaxis: {
      ...lineChartOptionsTotalSpent.xaxis,
      categories: handledCallsSeries.map(item => item.monthLabel),
    },
  };

  const formatter = new Intl.NumberFormat('en-US');

  return (
    <>
      <Card extra="flex flex-col bg-white w-full rounded-3xl py-6 px-2 md:px-6 relative">
        <div className="flex flex-col px-5">
          <div className="mb-[16px] flex flex-row items-center justify-between">
            <button className="flex items-center gap-[8px] rounded-[20px] border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-navy-700 dark:text-white/80 dark:hover:bg-navy-600">
              <Calendar className="h-4 w-4" />
              <span>This month</span>
            </button>
            <button 
              onClick={() => setIsExpanded(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-lightPrimary text-brand-500 hover:bg-lightPrimary/80 dark:bg-navy-700 dark:text-white"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-col">
            <p className="text-[34px] font-bold text-navy-700 dark:text-white">{formatter.format(totalCallsThisMonth)}</p>
            <div className="flex flex-row items-center gap-1">
              <p className="text-sm font-medium text-gray-600 dark:text-white/60">Total Spent</p>
              <p className={`text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                {isPositive ? '↑' : '↓'} {Math.abs(parseFloat(changePercent))}%
              </p>
            </div>
          </div>
          <div className="h-[300px] w-full pt-5">
            <LineChart chartOptions={chartOptions} chartData={lineChartDataTotalSpent} />
          </div>
        </div>
      </Card>
      {isExpanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <Card extra="flex flex-col bg-white w-full max-w-4xl rounded-3xl py-6 px-2 md:px-6 relative m-4">
            <div className="flex flex-col px-5">
              <div className="mb-[16px] flex flex-row items-center justify-between">
                <button className="flex items-center gap-[8px] rounded-[20px] border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-navy-700 dark:text-white/80 dark:hover:bg-navy-600">
                  <Calendar className="h-4 w-4" />
                  <span>This month</span>
                </button>
                <button 
                  onClick={() => setIsExpanded(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-lightPrimary text-brand-500 hover:bg-lightPrimary/80 dark:bg-navy-700 dark:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col">
                <p className="text-[34px] font-bold text-navy-700 dark:text-white">{formatter.format(totalCallsThisMonth)}</p>
                <div className="flex flex-row items-center gap-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-white/60">Total Spent</p>
                  <p className={`text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                    {isPositive ? '↑' : '↓'} {Math.abs(parseFloat(changePercent))}%
                  </p>
                </div>
              </div>
              <div className="h-[420px] w-full pt-5">
                <LineChart chartOptions={chartOptions} chartData={lineChartDataTotalSpent} />
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
