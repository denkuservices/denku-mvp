'use client';

import React from 'react';
import Card from '@/components/ui-horizon/card';
import BarChart from '@/components/charts/BarChart';
import { barChartOptionsDailyTraffic } from '@/variables/charts';

interface HourlyCallsProps {
  hourlyCallsSeries: Array<{ label: string; value: number }>;
}

const HORIZON_BUCKETS = ['00', '04', '08', '12', '14', '16', '18'];

export default function HourlyCalls({ hourlyCallsSeries }: HourlyCallsProps) {
  // Normalize to Horizon design buckets
  const normalizedSeries = HORIZON_BUCKETS.map(label => {
    const match = hourlyCallsSeries.find(i => i.label === label);
    return {
      label,
      value: match?.value ?? 0,
    };
  });

  const categories = normalizedSeries.map(item => item.label);
  const data = normalizedSeries.map(item => item.value);

  const barChartDataHourlyCalls = [
    {
      name: 'Daily Traffic',
      data: data,
    },
  ];

  const chartOptions = {
    ...barChartOptionsDailyTraffic,
    xaxis: {
      ...barChartOptionsDailyTraffic.xaxis,
      categories: categories,
    },
  };

  return (
    <Card extra="flex flex-col bg-white w-full rounded-3xl py-6 px-2 md:px-6">
      <div className="flex flex-col px-5">
        <div className="mb-[16px] flex flex-row items-center justify-between">
          <h4 className="text-lg font-bold text-navy-700 dark:text-white">Daily Traffic</h4>
          <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-lightPrimary text-brand-500 hover:bg-lightPrimary/80 dark:bg-navy-700 dark:text-white">
            <svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7.184 8.00033L9.884 5.30033C10.0294 5.15114 10.1127 4.95174 10.1162 4.74265C10.1198 4.53356 10.0433 4.33109 9.90337 4.17749C9.76341 4.0239 9.57093 3.93059 9.36396 3.91713C9.15699 3.90366 8.95209 3.97096 8.792 4.10633L5.792 7.10633C5.64724 7.25551 5.56403 7.45492 5.55873 7.66398C5.55343 7.87303 5.62634 8.07546 5.76267 8.23199L8.76267 11.232C8.91474 11.3692 9.11888 11.4381 9.32674 11.4229C9.5346 11.4077 9.72805 11.3096 9.86137 11.1515C9.99469 10.9933 10.0567 10.7891 10.0332 10.5855C10.0098 10.3819 9.9028 10.1962 9.736 10.073L7.184 8.00033Z" fill="currentColor" />
            </svg>
          </button>
        </div>
        <div className="mt-8 h-[260px] w-full">
          <BarChart chartOptions={chartOptions} chartData={barChartDataHourlyCalls} />
        </div>
      </div>
    </Card>
  );
}
