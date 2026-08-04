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

import PageShell from "@/app/(app)/_components/layout/PageShell";
import PageHeader from "@/app/(app)/_components/layout/PageHeader";
import StatCard from "@/app/(app)/_components/ui/StatCard";
import { Card, CardHeader } from "@/app/(app)/_components/ui/Card";
import Badge from "@/app/(app)/_components/ui/Badge";
import EmptyState from "@/app/(app)/_components/ui/EmptyState";
import { LinkButton } from "@/app/(app)/_components/ui/Button";

export default async function DashboardPage() {
  const data = await getDashboardOverview();
  const hasAgents = data.metrics.agents_total > 0;

  return (
    <PageShell className="space-y-6 pb-10">
      <PageHeader
        title="Mission Control"
        subtitle={
          <>
            Welcome back,{" "}
            <span className="font-medium text-foreground">{data.user.name}</span>
          </>
        }
        right={
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-gray-50 px-3 py-1.5 rounded-full border">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>{data.user.org}</span>
            <span className="mx-1 text-gray-300">|</span>
            <span>System Operational</span>
          </div>
        }
      />

      {!hasAgents ? (
        <EmptyState
          icon={<Bot className="h-6 w-6 text-gray-500" />}
          title="No agents deployed"
          description="Your mission control is empty. Deploy your first AI agent to start monitoring activity."
          action={<LinkButton href="/dashboard/agents/new">Create Agent</LinkButton>}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="Active Agents"
              value={data.metrics.agents_active.toString()}
              hint="+1 this week"
            />
            <StatCard
              icon={<MessageSquare className="h-4 w-4" />}
              label="Total Conversations"
              value={data.metrics.total_conversations.toLocaleString()}
              hint="+12% vs last week"
            />
            <StatCard
              icon={<Clock className="h-4 w-4" />}
              label="Avg Response Time"
              value={data.metrics.avg_response_time}
              hint="Optimal"
            />
            <StatCard
              icon={<Zap className="h-4 w-4" />}
              label="System Uptime"
              value={data.metrics.uptime}
              hint="Stable"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader
                  title="System Workload"
                  right={
                    <Badge className="bg-green-100 text-green-700">
                      {data.workload.status}
                    </Badge>
                  }
                />
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Current Load</span>
                    <span className="font-medium">{data.workload.current_load}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Throughput</span>
                    <span className="font-medium">{data.workload.requests_per_min} req/min</span>
                  </div>
                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-black w-[35%]" />
                  </div>
                </div>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <Card className="h-full">
                <CardHeader title="Live Feed" />
                <div className="space-y-4">
                  {data.feed.map((item: any) => (
                    <div key={item.id} className="flex gap-3 items-start text-sm">
                      <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                      <div className="flex-1">
                        <p className="text-gray-900">{item.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.time}</p>
                      </div>
                    </div>
                  ))}
                  {data.feed.length === 0 && (
                    <div className="text-sm text-muted-foreground">No recent activity.</div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Quick Actions" />
            <div className="grid grid-cols-2 gap-3">
              <ActionItem href="/dashboard/agents/new" icon={Plus} label="New Agent" primary />
              <ActionItem href="/dashboard/knowledge" icon={BookOpen} label="Add Knowledge" />
              <ActionItem href="/dashboard/tools" icon={Settings} label="Configure Tools" />
              <ActionItem href="/dashboard/risk" icon={Shield} label="Risk Policies" />
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card>
            <CardHeader
              title="Go-Live Readiness"
              right={<span className="text-sm font-bold">{data.readiness.score}%</span>}
            />
            <div className="w-full bg-gray-100 rounded-full h-2 mb-6">
              <div
                className="bg-black h-2 rounded-full transition-all"
                style={{ width: `${data.readiness.score}%` }}
              />
            </div>
            <div className="space-y-3">
              {data.readiness.steps.map((step: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  {step.done ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Circle className="h-4 w-4 text-gray-300" />
                  )}
                  <span className={step.done ? "text-gray-900" : "text-muted-foreground"}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

function ActionItem({
  href,
  icon: Icon,
  label,
  primary,
}: {
  href: string;
  icon: any;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-center gap-2 p-3 rounded-lg text-sm font-medium transition-colors ${
        primary
          ? "bg-black text-white hover:bg-gray-800"
          : "bg-gray-50 text-gray-700 hover:bg-gray-100 border"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
