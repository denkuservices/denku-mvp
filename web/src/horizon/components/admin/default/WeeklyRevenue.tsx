import Card from "components/card";
import BarChart from "components/charts/BarChart";
import {
  barChartOptionsWeeklyRevenue,
} from "variables/charts";
import { MdBarChart } from "react-icons/md";

const WeeklyRevenue = ({
  weeklyOutcomes,
}: {
  weeklyOutcomes: Array<{ label: string; handledCalls: number; supportTickets: number }>;
}) => {
  const chartData = [
    {
      name: "Handled Calls",
      data: weeklyOutcomes.map((w) => w.handledCalls),
      color: "#6AD2Fa",
    },
    {
      name: "Support Tickets",
      data: weeklyOutcomes.map((w) => w.supportTickets),
      color: "#4318FF",
    },
  ];

  const chartOptions = {
    ...barChartOptionsWeeklyRevenue,
    xaxis: {
      ...barChartOptionsWeeklyRevenue.xaxis,
      categories: weeklyOutcomes.map((w) => w.label),
    },
  };

  return (
    <Card extra="flex flex-col bg-white w-full rounded-3xl py-6 px-2 text-center">
      <div className="mb-auto flex items-center justify-between px-6">
        <h2 className="text-lg font-bold text-navy-700 dark:text-white">
          Weekly Support Outcomes
        </h2>
        <button className="!linear z-[1] flex items-center justify-center rounded-lg bg-lightPrimary p-2 text-brand-500 !transition !duration-200 hover:bg-gray-100 active:bg-gray-200 dark:bg-navy-700 dark:text-white dark:hover:bg-white/20 dark:active:bg-white/10">
          <MdBarChart className="h-6 w-6" />
        </button>
      </div>

      <div className="md:mt-16 lg:mt-0">
        <div className="h-[250px] w-full xl:h-[350px]">
          <BarChart chartData={chartData} chartOptions={chartOptions} />
        </div>
      </div>
    </Card>
  );
};

export default WeeklyRevenue;
