'use client';

import dynamic from 'next/dynamic';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

type Props = {
  chartData: any;
  chartOptions: any;
};

const LineChart = ({ chartData, chartOptions }: Props) => {
  return (
    <Chart
      options={chartOptions}
      type="line"
      width="100%"
      height="100%"
      series={chartData}
    />
  );
};

export default LineChart;
