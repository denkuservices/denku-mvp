'use client';

import React, { useState } from 'react';
import Card from '@/components/ui-horizon/card';
import BarChart from '@/components/charts/BarChart';
import { barChartOptionsWeeklyRevenue } from '@/variables/charts';
import { Maximize2, X } from 'lucide-react';

interface WeeklyRevenueProps {
  weeklyOutcomes: Array<{ label: string; handledCalls: number; supportTickets: number }>;
}

export default function WeeklyRevenue({ weeklyOutcomes }: WeeklyRevenueProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const barChartDataWeeklyRevenue = [
    {
      name: 'PRODUCT A',
      data: weeklyOutcomes.map(w => w.handledCalls),
      color: '#6AD2Fa',
    },
    {
      name: 'PRODUCT B',
      data: weeklyOutcomes.map(w => w.supportTickets),
      color: '#4318FF',
    },
  ];

  const chartOptions = {
    ...barChartOptionsWeeklyRevenue,
    xaxis: {
      ...barChartOptionsWeeklyRevenue.xaxis,
      categories: weeklyOutcomes.map(w => w.label),
    },
  };

  return (
    <>
      <Card extra="flex flex-col bg-white w-full rounded-3xl py-6 px-2 md:px-6 relative">
        <div className="flex flex-col px-5">
          <div className="mb-[16px] flex flex-row items-center justify-between">
            <h4 className="text-lg font-bold text-navy-700 dark:text-white">Weekly Revenue</h4>
            <button 
              onClick={() => setIsExpanded(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-lightPrimary text-brand-500 hover:bg-lightPrimary/80 dark:bg-navy-700 dark:text-white"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
          <div className="h-[300px] w-full">
            <BarChart chartOptions={chartOptions} chartData={barChartDataWeeklyRevenue} />
          </div>
        </div>
      </Card>
      {isExpanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <Card extra="flex flex-col bg-white w-full max-w-4xl rounded-3xl py-6 px-2 md:px-6 relative m-4">
            <div className="flex flex-col px-5">
              <div className="mb-[16px] flex flex-row items-center justify-between">
                <h4 className="text-lg font-bold text-navy-700 dark:text-white">Weekly Revenue</h4>
                <button 
                  onClick={() => setIsExpanded(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-lightPrimary text-brand-500 hover:bg-lightPrimary/80 dark:bg-navy-700 dark:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="h-[420px] w-full">
                <BarChart chartOptions={chartOptions} chartData={barChartDataWeeklyRevenue} />
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
