import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AutoRefresh from "./AutoRefresh";

import PageShell from "@/app/(app)/_components/layout/PageShell";
import PageHeader from "@/app/(app)/_components/layout/PageHeader";
import EmptyState from "@/app/(app)/_components/ui/EmptyState";
import { LinkButton } from "@/app/(app)/_components/ui/Button";
import FilterToolbar from "@/app/(app)/_components/calls/FilterToolbar";

export const dynamic = "force-dynamic";

// ================================
// Helpers
// ================================

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(sec?: number | null) {
  if (sec === null || sec === undefined) return "—";
  if (!Number.isFinite(sec)) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

function money(v?: number | string | null) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(4)}`;
}

function outcomeBadgeClass(outcome?: string | null) {
  const lower = (outcome ?? "").toLowerCase();
  if (lower.includes("completed") || lower.includes("end-of-call-report")) {
    return "bg-green-100 text-green-800";
  }
  if (lower.includes("ended")) {
    return "bg-gray-100 text-gray-800";
  }
  if (lower.includes("failed") || lower.includes("error") || lower.includes("no-answer")) {
    return "bg-red-100 text-red-800";
  }
  return "bg-blue-100 text-blue-800";
}

function getOutcomeDisplayLabel(call: {
  outcome: string | null;
  transcript: string | null;
  duration_seconds: number | null;
}): string {
  const transcript = (call.transcript ?? "").toLowerCase();
  const outcome = (call.outcome ?? "").toLowerCase();

  if (/\b(appointment|meeting|schedule)\b/.test(transcript)) {
    return "Meeting Scheduled";
  }
  if (/\b(support|issue|problem|help)\b/.test(transcript)) {
    return "Support Request";
  }
  const isShortCall = call.duration_seconds !== null && call.duration_seconds < 20;
  if (outcome.includes("ended") && isShortCall) {
    return "Dropped Call";
  }
  return "Completed";
}

function getDurationClass(seconds: number | null): string {
  if (seconds === null) return "text-gray-900";
  if (seconds < 30) return "text-gray-500";
  if (seconds > 300) return "font-semibold text-gray-900";
  return "text-gray-900";
}

function getCostClass(cost: number | string | null): string {
  const n = Number(cost);
  if (!Number.isFinite(n)) return "text-gray-900";
  if (n < 0.01) return "text-gray-500";
  if (n > 0.1) return "font-semibold text-gray-900";
  return "text-gray-900";
}

// ================================
// Page
// ================================

export default async function CallsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("calls")
    .select(
      `
      id,
      created_at,
      outcome,
      transcript,
      duration_seconds,
      cost_usd,
      agent:agents (
        id,
        name
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <PageShell>
        <div className="text-red-600">Failed to load calls: {error.message}</div>
      </PageShell>
    );
  }

  const calls = Array.isArray(data) ? data : [];

const q = typeof sp.q === "string" ? sp.q : undefined;
const outcomeFilter = typeof sp.outcome === "string" ? sp.outcome : undefined;
const sinceFilter = typeof sp.since === "string" ? sp.since : undefined;


  const filteredCalls = calls.filter((call) => {
    if (q) {
      const lowerQuery = q.toLowerCase();
      const agent = Array.isArray(call.agent) ? call.agent[0] : call.agent;
      const agentName = agent?.name ?? "";

      const searchable = [
        agentName,
        call.outcome,
        call.transcript,
        getOutcomeDisplayLabel(call),
      ]
        .join(" ")
        .toLowerCase();

      if (!searchable.includes(lowerQuery)) {
        return false;
      }
    }

    if (outcomeFilter) {
      const callOutcome = (call.outcome ?? "").toLowerCase();
      const isCompleted =
        callOutcome.includes("completed") || callOutcome.includes("end-of-call-report");
      const isFailed =
        callOutcome.includes("failed") || callOutcome.includes("error") || callOutcome.includes("no-answer");

      if (outcomeFilter === "completed" && !isCompleted) return false;
      if (outcomeFilter === "failed" && !isFailed) return false;
      if (outcomeFilter === "other" && (isCompleted || isFailed)) return false;
    }

    if (sinceFilter) {
      const days = parseInt(sinceFilter.replace("d", ""), 10);
      if (!isNaN(days)) {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - days);
        if (!call.created_at || new Date(call.created_at) < sinceDate) {
          return false;
        }
      }
    }

    return true;
  });

  return (
    <PageShell className="space-y-6">
  <AutoRefresh intervalMs={5000} />
      <PageHeader title="Calls" subtitle="Browse recent calls from all agents." />

      <FilterToolbar q={q} outcome={outcomeFilter} since={sinceFilter} />

      {filteredCalls.length === 0 ? (
        <EmptyState
          title={calls.length === 0 ? "No calls found yet." : "No calls match your filters."}
          description="Once agents start receiving traffic, calls will appear here."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border bg-white">
  <table className="min-w-full text-sm">
    <thead className="bg-gray-50 text-left text-gray-600">
      <tr>
        <th className="px-4 py-3 font-medium">Agent</th>
        <th className="px-4 py-3 font-medium">Outcome</th>
        <th className="hidden px-4 py-3 font-medium md:table-cell">Started</th>
        <th className="hidden px-4 py-3 font-medium sm:table-cell">Duration</th>
        <th className="hidden px-4 py-3 font-medium lg:table-cell">Cost</th>
        <th className="px-4 py-3 font-medium text-right">Action</th>
      </tr>
    </thead>

    <tbody>
      {filteredCalls.map((call) => {
        const href = `/dashboard/calls/${call.id}`;
        const agentObj = Array.isArray(call.agent) ? call.agent[0] : call.agent;
        const agentName = agentObj?.name ?? "—";
        const outcomeLabel = getOutcomeDisplayLabel(call);

        return (
          <tr key={call.id} className="border-t hover:bg-gray-50">
            <td className="px-4 py-3 align-top">
              <Link href={href} className="block group">
                <div className="font-medium text-gray-900 group-hover:underline">
                  {agentName}
                </div>
                <div className="mt-1 text-xs text-gray-500 md:hidden">
                  {formatDate(call.created_at)}
                </div>
              </Link>
            </td>

            <td className="px-4 py-3 align-top">
              <Link href={href} className="block" tabIndex={-1}>
                <span
                  className={`inline-block max-w-[140px] truncate rounded-full px-2 py-0.5 text-xs font-medium sm:max-w-[200px] ${outcomeBadgeClass(
                    call.outcome
                  )}`}
                  title={call.outcome ?? ""}
                >
                  {outcomeLabel}
                </span>
              </Link>
            </td>

            <td className="hidden px-4 py-3 align-top md:table-cell">
              <Link href={href} className="block" tabIndex={-1}>
                {formatDate(call.created_at)}
              </Link>
            </td>

            <td className="hidden px-4 py-3 align-top sm:table-cell">
              <Link href={href} className="block" tabIndex={-1}>
                <span className={getDurationClass(call.duration_seconds)}>
                  {formatDuration(call.duration_seconds)}
                </span>
              </Link>
            </td>

            <td className="hidden px-4 py-3 align-top lg:table-cell">
              <Link href={href} className="block" tabIndex={-1}>
                <span className={getCostClass(call.cost_usd)}>
                  {money(call.cost_usd)}
                </span>
              </Link>
            </td>

            <td className="px-4 py-3 text-right align-top">
              <LinkButton href={href} variant="outline" className="px-3 py-1.5">
                View
              </LinkButton>
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
</div>

      )}
    </PageShell>
  );
}
