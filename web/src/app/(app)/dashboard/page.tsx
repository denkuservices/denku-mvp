import Link from "next/link";
import { getDashboardOverview } from "@/lib/dashboard/getDashboardOverview";
import {
  Users,
  Phone,
  CheckCircle2,
  Circle,
  Bot,
  DollarSign,
  TrendingUp,
  UserPlus,
  Calendar,
} from "lucide-react";
import { formatUSD } from "@/lib/analytics/format";

export default async function DashboardPage() {
  const data = await getDashboardOverview();

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <DashboardHeader userName={data.user.name} orgName={data.user.org} />

      {/* SECTION 1: Hero Value - Estimated Savings */}
      <HeroSavingsCard estimatedSavings={data.metrics.estimated_savings} />

      {/* SECTION 2: System Health Snapshot */}
      <SystemHealthSnapshot
        agentsActive={data.metrics.agents_active}
        callsLast7d={data.metrics.calls_last_7d}
        systemStatus={data.system_status}
      />

      {/* SECTION 3: Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivityCard feed={data.feed} />
        </div>

        {/* SECTION 4: AI Impact Summary */}
        <div className="lg:col-span-1">
          <AIImpactSummaryCard
            callsTotal={data.metrics.calls_total}
            leadsCount={data.metrics.leads_count}
            appointmentsCount={data.metrics.appointments_count}
            estimatedSavings={data.metrics.estimated_savings}
          />
        </div>
      </div>

      {/* SECTION 5: Go-Live Readiness (Simplified) */}
      <GoLiveReadinessCard
        score={data.readiness.score}
        steps={data.readiness.steps}
      />
    </div>
  );
}

// --- Components ---

function DashboardHeader({ userName, orgName }: { userName: string; orgName: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your AI operations at a glance
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-gray-50 px-3 py-1.5 rounded-full border">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span>{orgName}</span>
      </div>
    </div>
  );
}

function HeroSavingsCard({ estimatedSavings }: { estimatedSavings: number }) {
  return (
    <div className="rounded-xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-white p-10 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="h-5 w-5 text-green-600" />
            <p className="text-sm font-semibold text-muted-foreground">Estimated Savings</p>
            <div
              className="cursor-help"
              title="Estimated based on $25/hour average human agent cost."
            >
              <svg
                className="h-4 w-4 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
          <p className="text-5xl font-extrabold text-green-600 mt-2">
            +{formatUSD(estimatedSavings)}
          </p>
          <p className="text-sm text-muted-foreground mt-3">
            Estimated savings from AI agents
          </p>
        </div>
      </div>
    </div>
  );
}

function SystemHealthSnapshot({
  agentsActive,
  callsLast7d,
  systemStatus,
}: {
  agentsActive: number;
  callsLast7d: number;
  systemStatus: "Healthy" | "Attention Needed";
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Users className="h-4 w-4" />
          Active Agents
        </div>
        <div className="text-3xl font-bold">{agentsActive}</div>
      </div>

      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Phone className="h-4 w-4" />
          Calls Handled
        </div>
        <div className="text-3xl font-bold">{callsLast7d.toLocaleString()}</div>
        <div className="text-xs text-muted-foreground mt-1">Last 7 days · Active</div>
      </div>

      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          System Status
        </div>
        <div className="flex flex-col gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium w-fit ${
              systemStatus === "Healthy"
                ? "bg-green-100 text-green-700"
                : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {systemStatus === "Healthy" ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <Circle className="h-3 w-3" />
            )}
            {systemStatus}
          </span>
          {systemStatus === "Healthy" && (
            <p className="text-xs text-muted-foreground">No issues detected</p>
          )}
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

function RecentActivityCard({ feed }: { feed: FeedItem[] }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h3 className="font-semibold mb-4">Recent Activity</h3>
      <div className="space-y-4">
        {feed.length > 0 ? (
          feed.map((item) => (
            <div key={item.id} className="flex gap-3 items-start text-sm">
              <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
              <div className="flex-1">
                <p className="text-gray-900">{item.message}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.time}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-muted-foreground">No recent activity.</div>
        )}
      </div>
    </div>
  );
}

function AIImpactSummaryCard({
  callsTotal,
  leadsCount,
  appointmentsCount,
  estimatedSavings,
}: {
  callsTotal: number;
  leadsCount: number;
  appointmentsCount: number;
  estimatedSavings: number;
}) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm h-full flex flex-col">
      <h3 className="font-semibold mb-4">AI Impact Summary</h3>
      <div className="flex-1 space-y-3">
        <div className="flex items-start gap-3">
          <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-sm text-gray-900">
            AI agents handled <span className="font-semibold">{callsTotal.toLocaleString()}</span> calls
          </p>
        </div>
        <div className="flex items-start gap-3">
          <UserPlus className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-sm text-gray-900">
            Generated <span className="font-semibold">{leadsCount.toLocaleString()}</span> leads
          </p>
        </div>
        <div className="flex items-start gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-sm text-gray-900">
            Created <span className="font-semibold">{appointmentsCount.toLocaleString()}</span> appointments
          </p>
        </div>
        <div className="flex items-start gap-3">
          <DollarSign className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
          <p className="text-sm text-gray-900">
            Saved you <span className="font-semibold text-green-600">{formatUSD(estimatedSavings)}</span> vs human agents
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-4 pt-4 border-t">
        All activity is within expected performance ranges.
      </p>
    </div>
  );
}

interface Step {
  label: string;
  done: boolean;
}

function GoLiveReadinessCard({ score, steps }: { score: number; steps: Step[] }) {
  // Show only incomplete steps (max 2-3)
  const incompleteSteps = steps.filter((s) => !s.done).slice(0, 3);

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Go-Live Readiness</h3>
        <span className="text-sm font-bold">{score}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
        <div
          className="bg-black h-2 rounded-full transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
      {incompleteSteps.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">Almost there. Complete the remaining steps to go live.</p>
          {incompleteSteps.map((step, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <Circle className="h-4 w-4 text-gray-300" />
              <span className="text-muted-foreground">{step.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-green-600 font-medium">You're ready to go live.</p>
      )}
    </div>
  );
}
