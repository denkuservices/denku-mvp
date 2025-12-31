import Link from "next/link";
import { getDashboardOverview } from "@/lib/dashboard/getDashboardOverview";
import {
  Users,
  MessageSquare,
  Clock,
  Zap,
  Plus,
  Settings,
  BookOpen,
  Shield,
  CheckCircle2,
  Circle,
  Bot,
} from "lucide-react";

export default async function DashboardPage() {
  const data = await getDashboardOverview();
  const hasAgents = data.metrics.agents_total > 0;

  return (
    <div className="space-y-6 pb-10">
      {/* 1) DashboardHeader */}
      <DashboardHeader userName={data.user.name} orgName={data.user.org} />

      {/* Empty State or Operational Overview */}
      {!hasAgents ? (
        <EmptyStatePanel />
      ) : (
        <>
          {/* 2) OperationalOverviewCard */}
          <OperationalOverviewCard metrics={data.metrics} />

          <div className="grid gap-6 lg:grid-cols-3">
            {/* 3) WorkloadCard */}
            <div className="lg:col-span-2">
              <WorkloadCard data={data.workload} />
            </div>

            {/* 4) LiveFeedCard */}
            <div className="lg:col-span-1">
              <LiveFeedCard feed={data.feed} />
            </div>
          </div>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 5) QuickActionsCard */}
        <div className="lg:col-span-2">
          <QuickActionsCard />
        </div>

        {/* 6) GoLiveReadinessCard */}
        <div className="lg:col-span-1">
          <GoLiveReadinessCard
            score={data.readiness.score}
            steps={data.readiness.steps}
          />
        </div>
      </div>
    </div>
  );
}

// --- Inline Components ---

function DashboardHeader({ userName, orgName }: { userName: string; orgName: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mission Control</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back, <span className="font-medium text-foreground">{userName}</span>
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-gray-50 px-3 py-1.5 rounded-full border">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span>{orgName}</span>
        <span className="mx-1 text-gray-300">|</span>
        <span>System Operational</span>
      </div>
    </div>
  );
}

interface Metrics {
  agents_total: number;
  agents_active: number;
  total_conversations: number;
  avg_response_time: string;
  uptime: string;
}

function OperationalOverviewCard({ metrics }: { metrics: Metrics }) {
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

interface Workload {
  current_load: string;
  requests_per_min: number;
  status: string;
}

function WorkloadCard({ data }: { data: Workload }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">System Workload</h3>
        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
          {data.status}
        </span>
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Current Load</span>
          <span className="font-medium">{data.current_load}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Throughput</span>
          <span className="font-medium">{data.requests_per_min} req/min</span>
        </div>
        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-black w-[35%]" />
        </div>
      </div>
    </div>
  );
}

interface FeedItem {
  id: string;
  message: string;
  time: string;
}

function LiveFeedCard({ feed }: { feed: FeedItem[] }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm h-full">
      <h3 className="font-semibold mb-4">Live Feed</h3>
      <div className="space-y-4">
        {feed.map((item) => (
          <div key={item.id} className="flex gap-3 items-start text-sm">
            <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
            <div className="flex-1">
              <p className="text-gray-900">{item.message}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.time}</p>
            </div>
          </div>
        ))}
        {feed.length === 0 && (
          <div className="text-sm text-muted-foreground">No recent activity.</div>
        )}
      </div>
    </div>
  );
}

function QuickActionsCard() {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h3 className="font-semibold mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-3">
        <ActionItem href="/dashboard/agents/new" icon={Plus} label="New Agent" primary />
        <ActionItem href="/dashboard/knowledge" icon={BookOpen} label="Add Knowledge" />
        <ActionItem href="/dashboard/tools" icon={Settings} label="Configure Tools" />
        <ActionItem href="/dashboard/risk" icon={Shield} label="Risk Policies" />
      </div>
    </div>
  );
}

function ActionItem({ href, icon: Icon, label, primary }: any) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-center gap-2 p-3 rounded-lg text-sm font-medium transition-colors ${
        primary ? "bg-black text-white hover:bg-gray-800" : "bg-gray-50 text-gray-700 hover:bg-gray-100 border"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

interface Step {
  label: string;
  done: boolean;
}

function GoLiveReadinessCard({ score, steps }: { score: number; steps: Step[] }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Go-Live Readiness</h3>
        <span className="text-sm font-bold">{score}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 mb-6">
        <div
          className="bg-black h-2 rounded-full transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            {step.done ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <Circle className="h-4 w-4 text-gray-300" />
            )}
            <span className={step.done ? "text-gray-900" : "text-muted-foreground"}>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyStatePanel() {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm mb-4">
        <Bot className="h-6 w-6 text-gray-500" />
      </div>
      <h3 className="text-lg font-semibold">No agents deployed</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
        Your mission control is empty. Deploy your first AI agent to start monitoring activity.
      </p>
      <div className="mt-6">
        <Link href="/dashboard/agents/new" className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          Create Agent
        </Link>
      </div>
    </div>
  );
}
