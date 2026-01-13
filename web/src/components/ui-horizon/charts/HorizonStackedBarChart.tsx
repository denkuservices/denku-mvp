'use client';

import React from 'react';
import ReactApexChartClient from './ReactApexChartClient';
import type { ApexOptions } from 'apexcharts';

interface HorizonStackedBarChartProps {
  labels: string[];
  seriesA: number[]; // calls (top)
  seriesB: number[]; // tickets (bottom)
  height?: number;
}

/**
 * Horizon Stacked Bar Chart - ApexCharts stacked bar chart matching Horizon WeeklyRevenue style
 * Includes toolbar with zoom and selection
 */
export default function HorizonStackedBarChart({ 
  labels, 
  seriesA, 
  seriesB, 
  height = 350 
}: HorizonStackedBarChartProps) {
  // ApexCharts options matching Horizon style
  const options: ApexOptions = {
    chart: {
      type: 'bar',
      height: height,
      stacked: true,
      toolbar: {
        show: true,
        tools: {
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          selection: true, // Enable rectangle selection
          reset: true,
        },
      },
      zoom: {
        enabled: true,
        type: 'x',
      },
      selection: {
        enabled: true,
        type: 'x',
      },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: '60%',
        borderRadius: 8,
        borderRadiusApplication: 'end',
        borderRadiusWhenStacked: 'all',
      },
    },
    colors: ['#3b82f6', '#10b981'], // brand-500 (calls), green-500 (tickets)
    grid: {
      show: true,
      borderColor: '#e5e7eb',
      strokeDashArray: 3,
      xaxis: {
        lines: {
          show: false,
        },
      },
      yaxis: {
        lines: {
          show: true,
        },
      },
      padding: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
    },
    xaxis: {
      categories: labels,
      labels: {
        style: {
          colors: '#6b7280',
          fontSize: '12px',
        },
      },
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: '#6b7280',
          fontSize: '12px',
        },
      },
    },
    tooltip: {
      enabled: true,
      theme: 'light',
    },
    legend: {
      show: false,
    },
    dataLabels: {
      enabled: false,
    },
    fill: {
      opacity: 1,
    },
  };

  const series = [
    {
      name: 'Calls',
      data: seriesA,
    },
    {
      name: 'Tickets',
      data: seriesB,
    },
  ];

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <ReactApexChartClient
        options={options}
        series={series}
        type="bar"
        height={height}
      />
    </div>
  );
}
