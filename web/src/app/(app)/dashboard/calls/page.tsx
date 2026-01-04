import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
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

/**
 * Compute outcome labels for calls based on database records (appointments/tickets)
 * Rule hierarchy:
 * 1. Meeting Scheduled: appointment exists linked to call (by call_id, or by org_id+lead_id+time window)
 * 2. Support Request: ticket exists linked to call (by call_id, or by org_id+lead_id+time window)
 * 3. Dropped Call: duration < 20s AND ended_at exists AND no appointment/ticket
 * 4. Completed: ended_at exists AND no appointment/ticket
 * 5. In Progress: ended_at is null
 */
async function computeCallOutcomes(calls: Array<{
  id: string;
  org_id: string | null;
  lead_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
}>): Promise<Map<string, 'Meeting Scheduled' | 'Support Request' | 'Dropped Call' | 'Completed' | 'In progress'>> {
  const outcomeMap = new Map<string, 'Meeting Scheduled' | 'Support Request' | 'Dropped Call' | 'Completed' | 'In progress'>();
  
  if (calls.length === 0) return outcomeMap;

  // Group calls by org_id for efficient batch queries
  const callsByOrg = new Map<string, typeof calls>();
  for (const call of calls) {
    if (!call.org_id) continue;
    if (!callsByOrg.has(call.org_id)) {
      callsByOrg.set(call.org_id, []);
    }
    callsByOrg.get(call.org_id)!.push(call);
  }

  // Process each org's calls
  for (const [orgId, orgCalls] of callsByOrg.entries()) {
    const callIds = orgCalls.map(c => c.id).filter(Boolean);
    const leadIds = orgCalls.map(c => c.lead_id).filter((id): id is string => !!id);
    const timeRanges = orgCalls
      .filter(c => c.started_at)
      .map(c => ({
        callId: c.id,
        start: c.started_at!,
        end: new Date(new Date(c.started_at!).getTime() + 2 * 60 * 60 * 1000).toISOString(),
        leadId: c.lead_id,
      }));

    // Batch query appointments: by call_id and by org_id+lead_id+time window
    const appointmentCallIds = new Set<string>();
    const appointmentLeadIds = new Set<string>();
    
    if (callIds.length > 0) {
      const { data: appointmentsByCallId } = await supabaseAdmin
        .from('appointments')
        .select('call_id')
        .eq('org_id', orgId)
        .in('call_id', callIds);
      
      if (appointmentsByCallId) {
        for (const apt of appointmentsByCallId) {
          if (apt.call_id) appointmentCallIds.add(apt.call_id);
        }
      }
    }

    // Batch query tickets: by call_id and by org_id+lead_id+time window
    const ticketCallIds = new Set<string>();
    const ticketLeadIds = new Set<string>();
    
    if (callIds.length > 0) {
      const { data: ticketsByCallId } = await supabaseAdmin
        .from('tickets')
        .select('call_id')
        .eq('org_id', orgId)
        .in('call_id', callIds);
      
      if (ticketsByCallId) {
        for (const tkt of ticketsByCallId) {
          if (tkt.call_id) ticketCallIds.add(tkt.call_id);
        }
      }
    }

    // For time-window matching, query appointments/tickets in the relevant time ranges
    // This is an approximation - we query all appointments/tickets for the org and match in memory
    if (leadIds.length > 0 && timeRanges.length > 0) {
      const earliestStart = timeRanges.reduce((min, tr) => tr.start < min ? tr.start : min, timeRanges[0].start);
      const latestEnd = timeRanges.reduce((max, tr) => tr.end > max ? tr.end : max, timeRanges[0].end);

      const { data: appointmentsByTime } = await supabaseAdmin
        .from('appointments')
        .select('id, org_id, lead_id, created_at')
        .eq('org_id', orgId)
        .in('lead_id', leadIds)
        .gte('created_at', earliestStart)
        .lte('created_at', latestEnd);

      const { data: ticketsByTime } = await supabaseAdmin
        .from('tickets')
        .select('id, org_id, lead_id, created_at')
        .eq('org_id', orgId)
        .in('lead_id', leadIds)
        .gte('created_at', earliestStart)
        .lte('created_at', latestEnd);

      // Match appointments/tickets to calls by time window
      for (const tr of timeRanges) {
        if (!tr.leadId) continue;
        
        const hasAppt = appointmentsByTime?.some(apt => 
          apt.lead_id === tr.leadId && 
          apt.created_at >= tr.start && 
          apt.created_at <= tr.end
        );
        if (hasAppt) appointmentLeadIds.add(tr.callId);

        const hasTkt = ticketsByTime?.some(tkt => 
          tkt.lead_id === tr.leadId && 
          tkt.created_at >= tr.start && 
          tkt.created_at <= tr.end
        );
        if (hasTkt) ticketLeadIds.add(tr.callId);
      }
    }

    // Compute outcomes for each call
    for (const call of orgCalls) {
      const hasAppointment = appointmentCallIds.has(call.id) || appointmentLeadIds.has(call.id);
      const hasTicket = ticketCallIds.has(call.id) || ticketLeadIds.has(call.id);
      const isInProgress = !call.ended_at;
      const isDropped = call.ended_at && call.duration_seconds !== null && call.duration_seconds < 20;

      if (hasAppointment) {
        outcomeMap.set(call.id, 'Meeting Scheduled');
      } else if (hasTicket) {
        outcomeMap.set(call.id, 'Support Request');
      } else if (isInProgress) {
        outcomeMap.set(call.id, 'In progress');
      } else if (isDropped) {
        outcomeMap.set(call.id, 'Dropped Call');
      } else {
        outcomeMap.set(call.id, 'Completed');
      }
    }
  }

  return outcomeMap;
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
// Components
// ================================

function FilterToolbar({
  q,
  outcome,
  since,
}: {
  q?: string;
  outcome?: string;
  since?: string;
}) {
  return (
    <div className="rounded-md border bg-white p-4">
      <form method="GET" className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-grow">
          <label htmlFor="search" className="block text-sm font-medium text-gray-700">
            Search
          </label>
          <input
            type="text"
            name="q"
            id="search"
            defaultValue={q}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            placeholder="Search agent, outcome, etc."
          />
        </div>
        <div className="min-w-[150px]">
          <label htmlFor="outcome" className="block text-sm font-medium text-gray-700">
            Outcome
          </label>
          <select
            name="outcome"
            id="outcome"
            defaultValue={outcome}
            className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">All</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="min-w-[150px]">
          <label htmlFor="since" className="block text-sm font-medium text-gray-700">
            Time range
          </label>
          <select
            name="since"
            id="since"
            defaultValue={since}
            className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">Any time</option>
            <option value="1d">Last 24h</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>
        <div className="flex-shrink-0">
          <button
            type="submit"
            className="inline-flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
          >
            Filter
          </button>
        </div>
      </form>
    </div>
  );
}


// ================================
// Page
// ================================

export default async function CallsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("calls")
    .select(
      `
      id,
      org_id,
      lead_id,
      created_at,
      started_at,
      ended_at,
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
      <div className="mx-auto max-w-7xl px-4 py-6 text-red-600">
        Failed to load calls: {error.message}
      </div>
    );
  }

  const calls = Array.isArray(data) ? data : [];
  
  // Compute outcome labels based on database records (appointments/tickets)
  const outcomeLabels = await computeCallOutcomes(calls.map(c => ({
    id: c.id,
    org_id: c.org_id ?? null,
    lead_id: c.lead_id ?? null,
    started_at: c.started_at ?? null,
    ended_at: c.ended_at ?? null,
    duration_seconds: c.duration_seconds ?? null,
  })));

  const q = typeof searchParams.q === "string" ? searchParams.q : undefined;
  const outcomeFilter = typeof searchParams.outcome === "string" ? searchParams.outcome : undefined;
  const sinceFilter = typeof searchParams.since === "string" ? searchParams.since : undefined;

  const filteredCalls = calls.filter(call => {
    const outcomeLabel = outcomeLabels.get(call.id) ?? 'Completed';
    
    if (q) {
      const lowerQuery = q.toLowerCase();
      const agent = Array.isArray(call.agent) ? call.agent[0] : call.agent;
      const agentName = agent?.name ?? '';
      
      const searchable = [
        agentName,
        call.outcome,
        call.transcript,
        outcomeLabel,
      ].join(' ').toLowerCase();

      if (!searchable.includes(lowerQuery)) {
        return false;
      }
    }

    if (outcomeFilter) {
      const callOutcome = (call.outcome ?? "").toLowerCase();
      const isCompleted = callOutcome.includes("completed") || callOutcome.includes("end-of-call-report");
      const isFailed = callOutcome.includes("failed") || callOutcome.includes("error") || callOutcome.includes("no-answer");
      
      if (outcomeFilter === 'completed' && !isCompleted) return false;
      if (outcomeFilter === 'failed' && !isFailed) return false;
      if (outcomeFilter === 'other' && (isCompleted || isFailed)) return false;
    }
    
    if (sinceFilter) {
      const days = parseInt(sinceFilter.replace('d', ''), 10);
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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Calls
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Browse recent calls from all agents.
        </p>
      </div>

      <div className="mb-6">
        <FilterToolbar q={q} outcome={outcomeFilter} since={sinceFilter} />
      </div>

      {filteredCalls.length === 0 ? (
        <div className="rounded-md border bg-white p-6 text-center text-sm text-gray-700">
          {calls.length === 0 ? 'No calls found yet.' : 'No calls match your filters.'}
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
              {filteredCalls.map((call) => {
                const href = `/dashboard/calls/${call.id}`;
                const agentObj = Array.isArray(call.agent)
                  ? call.agent[0]
                  : call.agent;
                const agentName = agentObj?.name ?? "—";
                const outcomeLabel = outcomeLabels.get(call.id) ?? 'Completed';

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
