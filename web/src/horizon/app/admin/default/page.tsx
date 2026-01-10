'use client';
import MiniCalendar from 'components/calendar/MiniCalendar';
import WeeklyRevenue from 'components/admin/default/WeeklyRevenue';
import TotalSpent from 'components/admin/default/TotalSpent';
import PieChartCard from 'components/admin/default/PieChartCard';
import { IoMdHome } from 'react-icons/io';
import { IoDocuments } from 'react-icons/io5';
import { MdBarChart, MdDashboard } from 'react-icons/md';

import Widget from 'components/widget/Widget';
import CheckTable from 'components/admin/default/CheckTable';
import ComplexTable from 'components/admin/default/ComplexTable';
import DailyTraffic from 'components/admin/default/DailyTraffic';
import TaskCard from 'components/admin/default/TaskCard';
import tableDataCheck from 'variables/data-tables/tableDataCheck';
import tableDataComplex from 'variables/data-tables/tableDataComplex';

const Dashboard = () => {
  return (
    <div>
      {/* Card widget */}

      <div className="mt-3 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-3 3xl:grid-cols-6">
        <Widget
          icon={<MdBarChart className="h-7 w-7" />}
          title={'Earnings'}
          subtitle={'$340.5'}
        />
        <Widget
          icon={<IoDocuments className="h-6 w-6" />}
          title={'Spend this month'}
          subtitle={'$642.39'}
        />
        <Widget
          icon={<MdBarChart className="h-7 w-7" />}
          title={'Sales'}
          subtitle={'$574.34'}
        />
        <Widget
          icon={<MdDashboard className="h-6 w-6" />}
          title={'Your Balance'}
          subtitle={'$1,000'}
        />
        <Widget
          icon={<MdBarChart className="h-7 w-7" />}
          title={'New Tasks'}
          subtitle={'145'}
        />
        <Widget
          icon={<IoMdHome className="h-6 w-6" />}
          title={'Total Projects'}
          subtitle={'$2433'}
        />
      </div>

      {/* Charts */}

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <TotalSpent
          totalCallsThisMonth={0}
          totalCallsLastMonth={0}
          totalCallsSeries={[
            { monthLabel: 'SEP', value: 0 },
            { monthLabel: 'OCT', value: 0 },
            { monthLabel: 'NOV', value: 0 },
            { monthLabel: 'DEC', value: 0 },
            { monthLabel: 'JAN', value: 0 },
            { monthLabel: 'FEB', value: 0 },
          ]}
          handledCallsSeries={[
            { monthLabel: 'SEP', value: 0 },
            { monthLabel: 'OCT', value: 0 },
            { monthLabel: 'NOV', value: 0 },
            { monthLabel: 'DEC', value: 0 },
            { monthLabel: 'JAN', value: 0 },
            { monthLabel: 'FEB', value: 0 },
          ]}
        />
        <WeeklyRevenue
          weeklyOutcomes={[
            { label: 'W17', handledCalls: 0, supportTickets: 0 },
            { label: 'W18', handledCalls: 0, supportTickets: 0 },
            { label: 'W19', handledCalls: 0, supportTickets: 0 },
            { label: 'W20', handledCalls: 0, supportTickets: 0 },
            { label: 'W21', handledCalls: 0, supportTickets: 0 },
            { label: 'W22', handledCalls: 0, supportTickets: 0 },
            { label: 'W23', handledCalls: 0, supportTickets: 0 },
            { label: 'W24', handledCalls: 0, supportTickets: 0 },
          ]}
        />
      </div>

      {/* Tables & Charts */}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Check Table */}
        <div>
          <CheckTable tableData={tableDataCheck} />
        </div>

        {/* Traffic chart & Pie Chart */}

        <div className="grid grid-cols-1 gap-5 rounded-[20px] md:grid-cols-2">
          <DailyTraffic
            totalCallsToday={0}
            totalCallsYesterday={0}
            hourlyCallsSeries={[
              { label: '00', value: 0 },
              { label: '04', value: 0 },
              { label: '08', value: 0 },
              { label: '12', value: 0 },
              { label: '14', value: 0 },
              { label: '16', value: 0 },
              { label: '18', value: 0 },
            ]}
          />
          <PieChartCard />
        </div>

        {/* Complex Table , Task & Calendar */}

        <ComplexTable tableData={tableDataComplex} />

        {/* Task chart & Calendar */}

        <div className="grid grid-cols-1 gap-5 rounded-[20px] md:grid-cols-2">
          <TaskCard />
          <div className="grid grid-cols-1 rounded-[20px]">
            <MiniCalendar />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
