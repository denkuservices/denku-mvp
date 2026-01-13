'use client';

import dynamic from 'next/dynamic';
import React from 'react';

/**
 * Client-only wrapper for ReactApexChart to prevent SSR hydration issues.
 * Dynamically imports react-apexcharts with ssr:false.
 */
const ReactApexChartClient = dynamic(
  () => import('react-apexcharts'),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
        Loading chart...
      </div>
    )
  }
) as any;

export default ReactApexChartClient;
