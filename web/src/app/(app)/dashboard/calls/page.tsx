import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveOrgId } from "@/lib/analytics/params";
import { getOrgTimezone } from "@/lib/tickets/utils.server";
import Link from "next/link";
import {
  TableCard,
  TableRoot,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui-horizon/table";
import { Toolbar } from "@/components/ui-horizon/toolbar";
import { EmptyState } from "@/components/ui-horizon/empty";

// Disable Next.js Server Component caching to ensure fresh data on every request
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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

import { FilterToolbar } from "./_components/FilterToolbar";


// ================================
// Page
// ================================

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Next.js 16: searchParams is a Promise, must await before use
  const resolvedSearchParams = await searchParams;
  
  const supabase = await createSupabaseServerClient();
  
  // Resolve org_id for tenant scoping (REQUIRED)
  const orgId = await resolveOrgId();

  // Normalize search params: handle string | string[] | undefined
  // If array, use the last value (most recent)
  const normalizeParam = (value: string | string[] | undefined): string | undefined => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value[value.length - 1];
    return undefined;
  };

  // Extract and parse search params
  const sinceFilter = normalizeParam(resolvedSearchParams.since);
  
  // Calculate cutoff for time filtering (timezone-aware for 7d/30d, timezone-independent for 1d)
  let cutoffUtcISO: string | undefined;
  if (sinceFilter) {
    const days = parseInt(sinceFilter.replace('d', ''), 10);
    if (!isNaN(days) && days > 0) {
      const now = new Date();
      
      if (days === 1) {
        // Last 24h: timezone-independent, just subtract 24 hours from now
        const cutoffUtc = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        cutoffUtcISO = cutoffUtc.toISOString();
      } else {
        // Last 7d/30d: timezone-aware "start of day" calculation
        // Resolve effective timezone: workspace timezone > browser timezone > UTC
        const workspaceTimezone = await getOrgTimezone(orgId);
        const effectiveTimezone = workspaceTimezone !== "UTC" 
          ? workspaceTimezone 
          : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        
        // Get today's date in effective timezone
        const todayInTZ = new Intl.DateTimeFormat("en-CA", {
          timeZone: effectiveTimezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(now);
        
        // Parse and subtract N days
        const [year, month, day] = todayInTZ.split('-').map(Number);
        const targetDate = new Date(year, month - 1, day);
        targetDate.setDate(targetDate.getDate() - days);
        
        // Find UTC time that corresponds to "00:00:00" on target date in effective timezone
        const midnightUTC = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0));
        
        // Format midnight UTC in effective timezone to see what time it is there
        const tzFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: effectiveTimezone,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        
        const timeInTZ = tzFormatter.format(midnightUTC);
        const [hour, minute] = timeInTZ.split(':').map(Number);
        
        // Adjust backwards to get to 00:00:00 in effective timezone
        const offsetMs = (hour * 60 + minute) * 60 * 1000;
        const cutoffUtc = new Date(midnightUTC.getTime() - offsetMs);
        cutoffUtcISO = cutoffUtc.toISOString();
      }
      
      // Debug logs (temporary)
      console.log("DEBUG time filter:", {
        sinceFilter,
        days,
        nowISO: now.toISOString(),
        cutoffISO: cutoffUtcISO,
        hoursAgo: (now.getTime() - new Date(cutoffUtcISO).getTime()) / (60 * 60 * 1000),
      });
    }
  }
  // Build Supabase query with org_id scoping and time range filter (server-side)
  let query = supabase
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
    .eq("org_id", orgId); // CRITICAL: Filter by org_id first
  
  // Apply time range filter if cutoff was calculated
  if (cutoffUtcISO) {
    query = query.gte("started_at", cutoffUtcISO);
  }

  // Order by started_at if filtering by time (prefer started_at), else created_at
  // When filtering by time, order by started_at DESC, nulls last, then created_at DESC
  const { data, error } = await query
    .order(sinceFilter ? "started_at" : "created_at", { ascending: false, nullsFirst: false })
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

  const q = normalizeParam(resolvedSearchParams.q);
  const outcomeFilter = normalizeParam(resolvedSearchParams.outcome);
  // sinceFilter already declared above for query building

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
      // Use computed outcomeLabel instead of raw call.outcome
      const lowerLabel = outcomeLabel.toLowerCase();
      // Map outcome labels to filter categories
      const isCompleted = lowerLabel === 'meeting scheduled' || lowerLabel === 'completed';
      const isFailed = lowerLabel === 'dropped call';
      const isOther = lowerLabel === 'support request' || lowerLabel === 'in progress';
      
      if (outcomeFilter === 'completed' && !isCompleted) return false;
      if (outcomeFilter === 'failed' && !isFailed) return false;
      if (outcomeFilter === 'other' && !isOther) return false;
    }
    
    // Time range filtering is now done in Supabase query (server-side)
    // No need to filter again client-side for time range

    return true;
  });

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <Toolbar
          left={
            <>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Calls
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Browse recent calls from all agents.
                </p>
              </div>
            </>
          }
        />
      </div>

      <div className="mb-6">
        <FilterToolbar />
      </div>

      {filteredCalls.length === 0 ? (
        <EmptyState
          title={calls.length === 0 ? 'No calls found yet.' : 'No calls match your filters.'}
        />
      ) : (
        <TableCard className="overflow-x-auto p-0">
          <TableRoot>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredCalls.map((call) => {
                const href = `/dashboard/calls/${call.id}`;
                const agentObj = Array.isArray(call.agent)
                  ? call.agent[0]
                  : call.agent;
                const agentName = agentObj?.name ?? "—";
                const outcomeLabel = outcomeLabels.get(call.id) ?? 'Completed';
                // Use started_at with fallback to created_at for display consistency
                const startedValue = call.started_at ?? call.created_at;

                return (
                  <TableRow key={call.id} className="hover:bg-muted/50">
                    <TableCell className="align-top">
                      <Link href={href} className="block group">
                        <div className="font-medium text-foreground group-hover:underline">
                          {agentName}
                        </div>
                      </Link>
                    </TableCell>

                    <TableCell className="align-top">
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
                    </TableCell>

                    <TableCell className="align-top">
                      <Link href={href} className="block" tabIndex={-1}>
                        {formatDate(startedValue)}
                      </Link>
                    </TableCell>

                    <TableCell className="align-top">
                      <Link href={href} className="block" tabIndex={-1}>
                        <span className={getDurationClass(call.duration_seconds)}>
                          {formatDuration(call.duration_seconds)}
                        </span>
                      </Link>
                    </TableCell>

                    <TableCell className="align-top">
                      <Link href={href} className="block" tabIndex={-1}>
                        <span className={getCostClass(call.cost_usd)}>
                          {money(call.cost_usd)}
                        </span>
                      </Link>
                    </TableCell>

                    <TableCell className="text-right align-top">
                      <Link
                        href={href}
                        className="rounded-md border border-border bg-card px-2.5 py-1 text-sm font-medium text-foreground shadow-sm hover:bg-muted"
                      >
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </TableRoot>
        </TableCard>
      )}
    </div>
  );
}
