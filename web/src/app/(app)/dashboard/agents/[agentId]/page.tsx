// web/src/app/(app)/dashboard/agents/[agentId]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { Bot, CircleDollarSign, PhoneCall, Timer } from "lucide-react";
import { safeErrorMessage } from "@/lib/errors/safeErrorMessage";
import { Badge, type BadgeProps } from "@/components/ui-horizon/badge";
import { HorizonLinkButton } from "@/components/ui-horizon/button";
import { EmptyState } from "@/components/ui-horizon/empty";
import { Notice } from "@/components/ui-horizon/notice";
import PageHeader from "@/components/ui-horizon/page-header";
import { Stat } from "@/components/ui-horizon/stat";
import {
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from "@/components/ui-horizon/table";

type AgentRow = {
  id: string;
  org_id: string | null;
  name: string | null;
  created_at: string | null;
  vapi_assistant_id: string | null;
  vapi_phone_number_id: string | null;
};


type CallRow = {
  id: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  cost_usd: number | string | null;
  outcome: string | null;
  status: string | null;
  created_at: string | null;
};

type AdminAgentDetailResponse = {
  ok: boolean;
  agent?: AgentRow | null;
  calls?: CallRow[];
  error?: string;
  details?: string;
  calls_error?: string;
};

function toBasicAuthHeader() {
  const user = process.env.ADMIN_USER ?? "";
  const pass = process.env.ADMIN_PASS ?? "";
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return `Basic ${token}`;
}

function getBaseUrl() {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site && site.includes("localhost")) return site;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

async function adminGetJSON<T>(path: string): Promise<T> {
  const base = getBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    headers: {
      Authorization: toBasicAuthHeader(),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Admin API failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

function fmt(input?: string | null) {
  if (!input) return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleString();
}

function money(v?: number | string | null) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(4)}`;
}

function formatDuration(sec?: number | null) {
  if (sec === null || sec === undefined) return "—";
  if (!Number.isFinite(sec)) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function pct(rate?: number | null) {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}

function outcomeBadgeVariant(outcome?: string | null): BadgeProps["variant"] {
  const lower = (outcome ?? "").toLowerCase();
  if (lower.includes("completed") || lower.includes("end-of-call-report")) return "success";
  if (lower.includes("failed") || lower.includes("error") || lower.includes("no-answer")) return "destructive";
  if (lower.includes("ended")) return "default";
  return "info";
}

function calcAvgDurationSeconds(calls: CallRow[]) {
  const xs = calls
    .map((c) => c.duration_seconds)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!xs.length) return null;
  const sum = xs.reduce((a, b) => a + b, 0);
  return Math.round(sum / xs.length);
}

function calcSuccessRate(calls: CallRow[]) {
  if (!calls.length) return null;
  const ok = calls.filter((c) => {
    const outcome = (c.outcome ?? "").toLowerCase();
    return outcome.includes("completed") || outcome.includes("end-of-call-report");
  }).length;
  return ok / calls.length;
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;

  let payload: AdminAgentDetailResponse;
  try {
    payload = await adminGetJSON<AdminAgentDetailResponse>(`/api/admin/agents/${agentId}`);
  } catch (error: unknown) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[agents] Failed to load AI detail:", error);
    }
    return (
      <div className="space-y-6 pb-8">
        <PageHeader title="AI details" subtitle="Review configuration and recent voice activity." />
        <Notice tone="danger">
          {safeErrorMessage(error, "We couldn't load this AI profile. Please try again.")}
        </Notice>
        <HorizonLinkButton href="/dashboard/agents">Back to AI list</HorizonLinkButton>
      </div>
    );
  }

  const agent = payload.agent ?? null;
  const calls = payload.calls ?? [];
  const recent = calls.slice(0, 10);

  if (!agent) {
    return (
      <div className="space-y-6 pb-8">
        <PageHeader title="AI details" subtitle="Review configuration and recent voice activity." />
        <TableCard>
          <EmptyState
            title="AI profile not found"
            description="This profile may have been removed or you may no longer have access to it."
            action={<HorizonLinkButton href="/dashboard/agents">Back to AI list</HorizonLinkButton>}
          />
        </TableCard>
      </div>
    );
  }

  const callsTotal = calls.length;
  const totalCost = calls.reduce((sum, c) => sum + (Number(c.cost_usd) || 0), 0);
  const avgDuration = calcAvgDurationSeconds(calls);
  const successRate = calcSuccessRate(calls);

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={agent.name ?? "AI profile"}
        subtitle="Performance snapshot and recent calls from the last seven days."
        action={
          <>
            <Badge variant="success" dot>Active</Badge>
            <HorizonLinkButton href="/dashboard/agents">Back to AI list</HorizonLinkButton>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Calls · 7 days" value={callsTotal} icon={<PhoneCall />} />
        <Stat label="Cost · 7 days" value={money(totalCost)} icon={<CircleDollarSign />} />
        <Stat label="Avg duration · 7 days" value={formatDuration(avgDuration)} icon={<Timer />} />
        <Stat label="Success rate · 7 days" value={pct(successRate)} icon={<Bot />} />
      </div>

      {payload.calls_error ? (
        <Notice tone="warning">Some recent calls could not be loaded.</Notice>
      ) : null}

      <TableCard>
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-navy-700 dark:text-white">Recent calls</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">The latest 10 calls handled by this AI.</p>
          </div>
          <HorizonLinkButton href="/dashboard/calls" variant="ghost" size="sm">View all calls</HorizonLinkButton>
        </div>

        {recent.length === 0 ? (
          <EmptyState
            title="No calls yet"
            description="Calls handled by this AI will appear here when activity begins."
          />
        ) : (
          <TableRoot>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((call) => (
                <TableRow key={call.id}>
                  <TableCell>{fmt(call.started_at ?? call.created_at)}</TableCell>
                  <TableCell>{formatDuration(call.duration_seconds)}</TableCell>
                  <TableCell>{money(call.cost_usd)}</TableCell>
                  <TableCell className="max-w-[240px] truncate" title={call.outcome ?? ""}>
                    <Badge variant={outcomeBadgeVariant(call.outcome)}>{call.outcome || "Unknown"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <HorizonLinkButton href={`/dashboard/calls/${call.id}`} variant="ghost" size="sm">
                      View
                    </HorizonLinkButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableRoot>
        )}
      </TableCard>
    </div>
  );
}
