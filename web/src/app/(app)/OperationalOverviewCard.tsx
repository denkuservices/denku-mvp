import React from "react";
import { Users, MessageSquare, Clock, Zap } from "lucide-react";

interface Metrics {
  agents_active: number;
  total_conversations: number;
  avg_response_time: string;
  uptime: string;
}

export function OperationalOverviewCard({ metrics }: { metrics: Metrics }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatItem
        icon={Users}
        label="Active Agents"
        value={metrics.agents_active.toString()}
        trend="+1 this week"
      />
      <StatItem
        icon={MessageSquare}
        label="Total Conversations"
        value={metrics.total_conversations.toLocaleString()}
        trend="+12% vs last week"
      />
      <StatItem
        icon={Clock}
        label="Avg Response Time"
        value={metrics.avg_response_time}
        trend="Optimal"
      />
      <StatItem
        icon={Zap}
        label="System Uptime"
        value={metrics.uptime}
        trend="Stable"
      />
    </div>
  );
}

function StatItem({ icon: Icon, label, value, trend }: any) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{trend}</div>
    </div>
  );
}