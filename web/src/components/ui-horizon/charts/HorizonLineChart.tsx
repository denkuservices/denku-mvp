'use client';

import React from 'react';
import ReactApexChartClient from './ReactApexChartClient';
import type { ApexOptions } from 'apexcharts';

export type HorizonLineSeries = { 
  data: number[]; 
  name?: string;
  color?: string;
};

interface HorizonLineChartProps {
  series: HorizonLineSeries[];
  labels?: string[];
  height?: number;
}

/**
 * Horizon Line Chart - ApexCharts line chart matching Horizon TotalSpent style
 * Includes toolbar with zoom and selection (rectangle drag)
 */
export default function HorizonLineChart({ 
  series, 
  labels = [], 
  height = 250 
}: HorizonLineChartProps) {
  // Convert series to ApexCharts format
  const apexSeries = series.map((serie, idx) => ({
    name: serie.name || `Series ${idx + 1}`,
    data: serie.data,
    color: serie.color || (idx === 0 ? '#3b82f6' : '#7dd3fc'), // brand-500 or sky-300
  }));

  // ApexCharts options matching Horizon style
  const options: ApexOptions = {
    chart: {
      type: 'line',
      height: height,
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
    stroke: {
      curve: 'smooth', // Smooth curves
      width: 2,
    },
    colors: apexSeries.map(s => s.color || '#3b82f6'),
    grid: {
      show: true,
      borderColor: '#e5e7eb',
      strokeDashArray: 0,
      xaxis: {
        lines: {
          show: false,
        },
      },
      yaxis: {
        lines: {
          show: true,
          strokeDashArray: 3,
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
  };

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <ReactApexChartClient
        options={options}
        series={apexSeries}
        type="line"
        height={height}
      />
    </div>
  );
}
