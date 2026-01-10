'use client';

import Widget from '@/horizon/components/widget/Widget';
import { formatUSD, formatDuration } from "@/lib/analytics/format";
import type { AnalyticsSummary } from "@/lib/analytics/types";
import { Phone, DollarSign, Clock, Calendar, UserPlus, Ticket, TrendingUp } from 'lucide-react';

type KpiGridProps = {
  summary: AnalyticsSummary;
};

export function KpiGrid({ summary }: KpiGridProps) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-3 3xl:grid-cols-6">
      <Widget
        icon={<Phone className="h-7 w-7" />}
        title={'Total Calls'}
        subtitle={summary.totalCalls.toLocaleString()}
      />
      <Widget
        icon={<DollarSign className="h-7 w-7" />}
        title={'Total Cost'}
        subtitle={formatUSD(summary.totalCost)}
      />
      <Widget
        icon={<Clock className="h-6 w-6" />}
        title={'Avg Duration'}
        subtitle={formatDuration(summary.avgDuration)}
      />
      <Widget
        icon={<Calendar className="h-6 w-6" />}
        title={'Appointments Created'}
        subtitle={summary.appointmentsCount.toLocaleString()}
      />
      <Widget
        icon={<UserPlus className="h-6 w-6" />}
        title={'Leads Created'}
        subtitle={summary.leadsCount.toLocaleString()}
      />
      <Widget
        icon={<Ticket className="h-6 w-6" />}
        title={'Tickets Created'}
        subtitle={summary.ticketsCount.toLocaleString()}
      />
      <Widget
        icon={<TrendingUp className="h-7 w-7" />}
        title={'Estimated Savings'}
        subtitle={`+${formatUSD(summary.estimatedSavings)}`}
      />
    </div>
  );
}

