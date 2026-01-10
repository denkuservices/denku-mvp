import BarChart from 'components/charts/BarChart';
import { barChartOptionsDailyTraffic } from 'variables/charts';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import Card from 'components/card';

const DailyTraffic = ({
  totalCallsToday,
  totalCallsYesterday,
  hourlyCallsSeries,
}: {
  totalCallsToday: number;
  totalCallsYesterday: number;
  hourlyCallsSeries: Array<{ label: string; value: number }>;
}) => {
  const dayOverDayChange =
    totalCallsYesterday > 0
      ? ((totalCallsToday - totalCallsYesterday) / totalCallsYesterday) * 100
      : 0;

  const chartData = [
    {
      name: 'Hourly Call Volume',
      data: hourlyCallsSeries.map((h) => h.value),
    },
  ];

  const chartOptions = {
    ...barChartOptionsDailyTraffic,
    xaxis: {
      ...barChartOptionsDailyTraffic.xaxis,
      categories: hourlyCallsSeries.map((h) => h.label),
    },
  };

  return (
    <Card extra="pb-7 p-[20px]">
      <div className="flex flex-row justify-between">
        <div className="ml-1 pt-2">
          <p className="text-sm font-medium leading-4 text-gray-600">
            Hourly Call Volume
          </p>
          <p className="text-[34px] font-bold text-navy-700 dark:text-white">
            {totalCallsToday.toLocaleString()}{' '}
            <span className="text-sm font-medium leading-6 text-gray-600">
              Calls
            </span>
          </p>
        </div>
        <div className="mt-2 flex items-start">
          {totalCallsToday < 5 || totalCallsYesterday < 5 ? (
            <div className="flex items-center text-sm text-gray-500">
              <p className="font-bold">—</p>
            </div>
          ) : dayOverDayChange >= 0 ? (
            <div className="flex items-center text-sm text-green-500">
              <MdArrowDropUp className="h-5 w-5" />
              <p className="font-bold"> +{dayOverDayChange.toFixed(2)}% </p>
            </div>
          ) : (
            <div className="flex items-center text-sm text-red-500">
              <MdArrowDropDown className="h-5 w-5" />
              <p className="font-bold"> {dayOverDayChange.toFixed(2)}% </p>
            </div>
          )}
        </div>
      </div>

      <div className="h-[300px] w-full pt-10 pb-0">
        <BarChart chartData={chartData} chartOptions={chartOptions} />
      </div>
    </Card>
  );
};

export default DailyTraffic;
