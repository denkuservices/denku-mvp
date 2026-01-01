import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";

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
  if (
    lower.includes("failed") ||
    lower.includes("error") ||
    lower.includes("no-answer")
  ) {
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
  const isShortCall =
    call.duration_seconds !== null && call.duration_seconds < 20;
  if (outcome.includes("ended") && isShortCall) {
    return "Dropped Call";
  }
  return "Completed";
}

// ================================
// Page
// ================================

export default async function CallsPage() {
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
    .limit(100);

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 text-red-600">
        Failed to load calls: {error.message}
      </div>
    );
  }

  const calls = Array.isArray(data) ? data : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Calls
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Browse recent calls from all agents.
        </p>
      </div>

      {calls.length === 0 ? (
        <div className="rounded-md border bg-white p-6 text-center text-sm text-gray-700">
          No calls found yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Outcome</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">
                  Started
                </th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">
                  Duration
                </th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">
                  Cost
                </th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>

            <tbody>
              {calls.map((call) => {
                const href = `/dashboard/calls/${call.id}`;
                const agentObj = Array.isArray(call.agent)
                  ? call.agent[0]
                  : call.agent;
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
                        {formatDuration(call.duration_seconds)}
                      </Link>
                    </td>

                    <td className="hidden px-4 py-3 align-top lg:table-cell">
                      <Link href={href} className="block" tabIndex={-1}>
                        {money(call.cost_usd)}
                      </Link>
                    </td>

                    <td className="px-4 py-3 text-right align-top">
                      <Link
                        href={href}
                        className="rounded-md border bg-white px-2.5 py-1 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
