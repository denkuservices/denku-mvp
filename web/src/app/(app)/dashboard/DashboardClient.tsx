'use client';

import dynamic from 'next/dynamic';
import Widget from '@/components/dashboard/Widget';
import HourlyCalls from "@/components/dashboard/HourlyCalls";
import Card from '@/components/ui-horizon/card';
import { MdBarChart, MdDashboard } from 'react-icons/md';
import { Phone, Info, Ticket, Percent, Headset } from 'lucide-react';
import { formatUSD } from '@/lib/analytics/format';
import type { DashboardOverview } from '@/lib/dashboard/getDashboardOverview';

// Dynamically import chart components with ssr:false to eliminate hydration mismatch (ApexCharts is client-only)
const TotalSpent = dynamic(() => import('@/components/dashboard/TotalSpent'), { ssr: false });
const WeeklyRevenue = dynamic(() => import('@/components/dashboard/WeeklyRevenue'), { ssr: false });
const AgentComplexTable = dynamic(() => import('@/components/dashboard/AgentComplexTable'), { ssr: false });

interface DashboardClientProps {
  data: DashboardOverview;
}

/**
 * Client component wrapper for Horizon Main Dashboard.
 * This renders the Horizon UI layout 1:1 while using our real data.
 * All Horizon components that use hooks (charts, tables, calendars) are rendered here.
 */
export default function DashboardClient({ data }: DashboardClientProps) {
  // Map agent_performance to Horizon ComplexTable format
  const tableData = data.metrics.agent_performance.map((agent) => {
    // Extract answer rate percentage from progress string (e.g., "85.5%" -> 85.5)
    let answerRate = parseFloat(agent.progress.replace('%', ''));
    
    // If answer rate is 0-1 (decimal), convert to percentage (0-100)
    if (answerRate > 0 && answerRate <= 1) {
      answerRate = answerRate * 100;
    }
    
    // Ensure answerRate is in 0-100 range
    answerRate = Math.max(0, Math.min(100, answerRate));
    
    // Map status based on answer rate
    let status: 'Approved' | 'Disabled' | 'Error';
    if (answerRate >= 90) {
      status = 'Approved';
    } else if (answerRate >= 70) {
      status = 'Error'; // Warning state
    } else {
      status = 'Disabled';
    }

    // Calculate total calls from answer rate and handled calls
    // answerRate = (handledCalls / totalCalls) * 100
    // totalCalls = (handledCalls / answerRate) * 100
    const callsHandled = agent.quantity; // handledCalls
    const callsTotal = answerRate > 0 
      ? Math.round((callsHandled / answerRate) * 100)
      : callsHandled; // If answer rate is 0, use handled calls as total

    return {
      agent: agent.name[0], // Extract agent name from tuple
      status: status,
      calls: `${callsHandled} / ${callsTotal}`,
      lastActive: agent.date, // Already in "12 Jan 2026" format
      answerRate: answerRate, // Keep as decimal for precision (0-100)
      callsHandled: callsHandled,
      callsTotal: callsTotal,
    };
  });

  return (
    <div className="pt-5 px-2 md:px-6 bg-background-100">
      {/* Stats Row: 6 stat cards - Horizon Free exact grid */}
      <div className="mt-3 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-3 3xl:grid-cols-6">
        <Widget
          icon={<MdBarChart className="h-7 w-7" />}
          title="Est. Savings"
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

      {/* Charts Row: Two columns - Horizon Free exact grid */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <TotalSpent
          totalCallsThisMonth={data.metrics.total_calls_this_month}
          totalCallsLastMonth={data.metrics.total_calls_last_month}
          totalCallsSeries={data.metrics.total_calls_series}
          handledCallsSeries={data.metrics.handled_calls_series}
        />
        <WeeklyRevenue weeklyOutcomes={data.metrics.weekly_outcomes} /> 
      </div>

      {/* Bottom Row: Table + Chart - Horizon Free exact grid */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <AgentComplexTable tableData={tableData} />
        {(() => {
          const hasData = data.metrics.hourly_calls_series?.some(item => (item.value ?? 0) > 0);
          if (!hasData) {
            return (
              <Card extra="flex flex-col bg-white w-full rounded-3xl py-6 px-2 md:px-6">
                <div className="flex flex-col px-5">
                  <div className="mb-[16px] flex flex-row items-center justify-between">
                    <h4 className="text-lg font-bold text-navy-700 dark:text-white">Daily Traffic</h4>
                  </div>
                  <div className="mt-8 h-[260px] w-full flex items-center justify-center">
                    <p className="text-sm text-gray-600 dark:text-gray-400">No calls yet today</p>
                  </div>
                </div>
              </Card>
            );
          }
          return <HourlyCalls hourlyCallsSeries={data.metrics.hourly_calls_series} />;
        })()}
      </div>
    </div>
  );
}
