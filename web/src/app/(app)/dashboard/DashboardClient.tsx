'use client';

import Widget from '@/components/dashboard/Widget';
import WeeklyRevenue from '@/components/dashboard/WeeklyRevenue';
import TotalSpent from '@/components/dashboard/TotalSpent';
import CheckTable from '@/components/dashboard/CheckTable';
import DailyTraffic from '@/components/dashboard/DailyTraffic';
import { MdBarChart, MdDashboard } from 'react-icons/md';
import { Phone, Info, Ticket, Percent, Headset } from 'lucide-react';
import { formatUSD } from '@/lib/analytics/format';
import type { DashboardOverview } from '@/lib/dashboard/getDashboardOverview';

interface DashboardClientProps {
  data: DashboardOverview;
}

/**
 * Client component wrapper for Horizon Main Dashboard.
 * This renders the Horizon UI layout 1:1 while using our real data.
 * All Horizon components that use hooks (charts, tables, calendars) are rendered here.
 */
export default function DashboardClient({ data }: DashboardClientProps) {
  return (
    <div>
      {/* Card widget - Exact Horizon structure using Widget component */}
      <div className="mt-3 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-3 3xl:grid-cols-6">
        <Widget
          icon={<MdBarChart className="h-7 w-7" />}
          title={
            <span className="flex items-center gap-1">
              Est. Savings
              <span title="Estimated based on $25/hour average human agent cost.">
                <Info className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
              </span>
            </span>
          }
          subtitle={formatUSD(data.metrics.estimated_savings_usd)}
        />
        <Widget
          icon={<Phone className="h-7 w-7" />}
          title={'Total Calls'}
          subtitle={data.metrics.total_calls_month.toLocaleString()}
        />
        <Widget
          icon={<Percent className="h-6 w-6" />}
          title={'Answer Rate'}
          subtitle={`${data.metrics.answer_rate.toFixed(1)}%`}
        />
        <Widget
          icon={<Ticket className="h-6 w-6" />}
          title={'Support Tickets'}
          subtitle={data.metrics.tickets_created_month.toLocaleString()}
        />
        <Widget
          icon={<MdBarChart className="h-7 w-7" />}
          title={'Appointments Created'}
          subtitle={data.metrics.appointments_created_month.toLocaleString()}
        />
        <Widget
          icon={<Headset className="h-6 w-6" />}
          title={'Active Agents'}
          subtitle={data.metrics.agents_active.toLocaleString()}
        />
      </div>

      {/* Charts section - matching Horizon layout */}
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <TotalSpent
          totalCallsThisMonth={data.metrics.total_calls_this_month}
          totalCallsLastMonth={data.metrics.total_calls_last_month}
          totalCallsSeries={data.metrics.total_calls_series}
          handledCallsSeries={data.metrics.handled_calls_series}
        />
        <WeeklyRevenue weeklyOutcomes={data.metrics.weekly_outcomes} />
      </div>

      {/* Tables & Charts section - matching Horizon layout */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Agent Performance Overview */}
        <div>
          <CheckTable tableData={data.metrics.agent_performance} />
        </div>

        {/* Traffic chart */}
        <DailyTraffic
          totalCallsToday={data.metrics.total_calls_today}
          totalCallsYesterday={data.metrics.total_calls_yesterday}
          hourlyCallsSeries={data.metrics.hourly_calls_series}
        />
      </div>
    </div>
  );
}
