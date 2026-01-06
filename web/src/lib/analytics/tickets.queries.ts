import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  TicketsAnalyticsParams,
  TicketsAnalyticsResult,
  TicketsAnalyticsKPIs,
  TicketsAnalyticsFunnel,
  TicketsAnalyticsResponseTimes,
  TicketsAnalyticsSeries,
} from "./tickets.types";
import {
  normalizeStatus,
  priorityToSlaSeconds,
  calculatePercentile,
  getTicketsDateRange,
} from "./tickets.utils";

/**
 * Get tickets analytics for the given parameters
 */
export async function getTicketsAnalytics(
  orgId: string,
  params: TicketsAnalyticsParams
): Promise<TicketsAnalyticsResult> {
  const supabase = await createSupabaseServerClient();
  const { range, from: customFrom, to: customTo } = params;
  const priority = params.priority;

  // Determine date range
  const { from, to } = customFrom && customTo
    ? { from: new Date(customFrom), to: new Date(customTo) }
    : getTicketsDateRange(range);

  const fromISO = from.toISOString();
  const toISO = to.toISOString();
  const nowISO = new Date().toISOString();

  // 1) Fetch tickets created in range (with priority filter if provided)
  let ticketsQuery = supabase
    .from("tickets")
    .select("id,created_at,status,priority")
    .eq("org_id", orgId)
    .gte("created_at", fromISO)
    .lte("created_at", toISO);

  // Type guard for valid priority
  const isValidPriority = (
    p: string | null | undefined | ""
  ): p is "low" | "medium" | "high" | "urgent" => {
    return p === "low" || p === "medium" || p === "high" || p === "urgent";
  };

  if (priority && isValidPriority(priority)) {
    ticketsQuery = ticketsQuery.eq("priority", priority);
  }

  const { data: ticketsCreated, error: ticketsError } = await ticketsQuery;

  if (ticketsError) {
    throw new Error(`Failed to fetch tickets: ${ticketsError.message}`);
  }

  const ticketIds = (ticketsCreated ?? []).map((t) => t.id);
  const createdCount = ticketsCreated?.length ?? 0;

  // Minimal instrumentation (dev only)
  if (process.env.NODE_ENV !== "production") {
    console.log(`[tickets-analytics] orgId=${orgId}, range=${range}, ticketsCount=${createdCount}, fromISO=${fromISO}, toISO=${toISO}`);
  }

  // 2) Fetch current open tickets (for openNowCount) - count all open/in_progress tickets
  const { count: openNowCount, error: openError } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .in("status", ["open", "in_progress"]);

  if (openError) {
    throw new Error(`Failed to fetch open tickets: ${openError.message}`);
  }

  // 3) Fetch ticket activity for the range (for funnel, response times, SLA)
  let activityQuery = supabase
    .from("ticket_activity")
    .select("id,ticket_id,event_type,created_at,diff")
    .eq("org_id", orgId)
    .gte("created_at", fromISO)
    .lte("created_at", toISO);

  if (ticketIds.length === 0) {
    // No tickets in range, return empty result with correct openNowCount
    const emptyResult = getEmptyResult();
    emptyResult.kpis.openNowCount = openNowCount ?? 0;
    return emptyResult;
  }

  activityQuery = activityQuery.in("ticket_id", ticketIds);

  const { data: activities, error: activitiesError } = await activityQuery;

  if (activitiesError) {
    throw new Error(`Failed to fetch ticket activity: ${activitiesError.message}`);
  }

  const activitiesList = activities ?? [];

  // Minimal instrumentation (dev only)
  if (process.env.NODE_ENV !== "production") {
    console.log(`[tickets-analytics] activityCount=${activitiesList.length}`);
  }

  // 4) Fetch ALL activity for tickets created in range (for first response time and time to close)
  // This includes activity outside the range window
  const { data: allActivities, error: allActivitiesError } = await supabase
    .from("ticket_activity")
    .select("id,ticket_id,event_type,created_at,diff")
    .eq("org_id", orgId)
    .in("ticket_id", ticketIds)
    .order("created_at", { ascending: true });

  if (allActivitiesError) {
    throw new Error(`Failed to fetch all ticket activity: ${allActivitiesError.message}`);
  }

  // Build maps for efficient lookup
  const ticketCreatedAtMap = new Map<string, string>();
  const ticketPriorityMap = new Map<string, string | null>();
  for (const ticket of ticketsCreated ?? []) {
    ticketCreatedAtMap.set(ticket.id, ticket.created_at);
    ticketPriorityMap.set(ticket.id, ticket.priority);
  }

  // Calculate KPIs
  const kpis = calculateKPIs(
    ticketsCreated ?? [],
    activitiesList,
    ticketCreatedAtMap,
    ticketPriorityMap,
    nowISO,
    openNowCount ?? 0
  );

  // Calculate funnel
  const funnel = calculateFunnel(ticketsCreated ?? [], activitiesList, ticketCreatedAtMap);

  // Calculate response times
  const responseTimes = calculateResponseTimes(
    ticketsCreated ?? [],
    allActivities ?? [],
    ticketCreatedAtMap,
    activitiesList
  );

  // Calculate series
  const series = calculateSeries(ticketsCreated ?? [], from, to, range);

  return {
    kpis,
    funnel,
    responseTimes,
    series,
  };
}

/**
 * Calculate KPIs
 */
function calculateKPIs(
  ticketsCreated: Array<{ id: string; created_at: string; status: string; priority: string | null }>,
  activities: Array<{ ticket_id: string; event_type: string; created_at: string; diff: any }>,
  ticketCreatedAtMap: Map<string, string>,
  ticketPriorityMap: Map<string, string | null>,
  nowISO: string,
  openNowCount: number
): TicketsAnalyticsKPIs {
  // Closed count: tickets with close events in activities
  const closedTicketIds = new Set<string>();
  for (const activity of activities) {
    if (activity.event_type === "ticket.resolved" || activity.event_type === "ticket.status_changed") {
      // Check if diff indicates closed status
      if (activity.diff && typeof activity.diff === "object") {
        const statusDiff = activity.diff.status;
        if (statusDiff && typeof statusDiff === "object") {
          const after = statusDiff.after;
          if (after === "closed" || after === "resolved") {
            closedTicketIds.add(activity.ticket_id);
          }
        }
      } else if (activity.event_type === "ticket.resolved") {
        closedTicketIds.add(activity.ticket_id);
      }
    }
  }
  const closedCount = closedTicketIds.size;

  // SLA breaches
  let slaBreachedCount = 0;
  const meaningfulActionTypes = ["ticket.comment_posted", "ticket.status_changed", "ticket.priority_changed"];

  // Build first action time per ticket
  const firstActionMap = new Map<string, string>();
  for (const activity of activities) {
    if (meaningfulActionTypes.includes(activity.event_type)) {
      const existing = firstActionMap.get(activity.ticket_id);
      if (!existing || activity.created_at < existing) {
        firstActionMap.set(activity.ticket_id, activity.created_at);
      }
    }
  }

  for (const ticket of ticketsCreated) {
    const priority = ticketPriorityMap.get(ticket.id);
    const slaThreshold = priorityToSlaSeconds(priority);
    const createdAt = new Date(ticket.created_at).getTime();
    const firstActionAt = firstActionMap.get(ticket.id);

    if (firstActionAt) {
      const firstActionTime = new Date(firstActionAt).getTime();
      const responseTime = (firstActionTime - createdAt) / 1000; // seconds
      if (responseTime > slaThreshold) {
        slaBreachedCount++;
      }
    } else {
      // No response yet - check if breached
      const now = new Date(nowISO).getTime();
      const elapsed = (now - createdAt) / 1000; // seconds
      if (elapsed > slaThreshold) {
        slaBreachedCount++;
      }
    }
  }

  const slaBreachedRate = ticketsCreated.length > 0 ? slaBreachedCount / ticketsCreated.length : 0;

  return {
    createdCount: ticketsCreated.length,
    closedCount,
    openNowCount,
    slaBreachedCount,
    slaBreachedRate,
  };
}

/**
 * Calculate funnel metrics
 */
function calculateFunnel(
  ticketsCreated: Array<{ id: string; created_at: string }>,
  activities: Array<{ ticket_id: string; event_type: string; diff: any }>,
  ticketCreatedAtMap: Map<string, string>
): TicketsAnalyticsFunnel {
  const created = ticketsCreated.length;

  // Tickets that reached in_progress
  const inProgressTicketIds = new Set<string>();
  for (const activity of activities) {
    if (activity.event_type === "ticket.status_changed") {
      if (activity.diff && typeof activity.diff === "object") {
        const statusDiff = activity.diff.status;
        if (statusDiff && typeof statusDiff === "object") {
          const after = statusDiff.after;
          if (after === "in_progress" || after === "in-progress") {
            inProgressTicketIds.add(activity.ticket_id);
          }
        }
      }
    }
  }
  const inProgress = inProgressTicketIds.size;

  // Tickets that were closed
  const closedTicketIds = new Set<string>();
  for (const activity of activities) {
    if (activity.event_type === "ticket.resolved" || activity.event_type === "ticket.status_changed") {
      if (activity.diff && typeof activity.diff === "object") {
        const statusDiff = activity.diff.status;
        if (statusDiff && typeof statusDiff === "object") {
          const after = statusDiff.after;
          if (after === "closed" || after === "resolved") {
            closedTicketIds.add(activity.ticket_id);
          }
        }
      } else if (activity.event_type === "ticket.resolved") {
        closedTicketIds.add(activity.ticket_id);
      }
    }
  }
  const closed = closedTicketIds.size;

  const createdToInProgressRate = created > 0 ? inProgress / created : 0;
  const inProgressToClosedRate = inProgress > 0 ? closed / inProgress : 0;

  return {
    created,
    inProgress,
    closed,
    createdToInProgressRate,
    inProgressToClosedRate,
  };
}

/**
 * Calculate response times
 */
function calculateResponseTimes(
  ticketsCreated: Array<{ id: string; created_at: string }>,
  allActivities: Array<{ ticket_id: string; event_type: string; created_at: string; diff: any }>,
  ticketCreatedAtMap: Map<string, string>,
  activitiesInRange: Array<{ ticket_id: string; event_type: string; created_at: string; diff: any }>
): TicketsAnalyticsResponseTimes {
  const meaningfulActionTypes = ["ticket.comment_posted", "ticket.status_changed", "ticket.priority_changed"];

  const firstResponseTimes: number[] = [];
  const timeToCloseTimes: number[] = [];

  // Build activity maps per ticket (sorted by created_at)
  const activitiesByTicket = new Map<string, Array<{ event_type: string; created_at: string; diff: any }>>();
  for (const activity of allActivities) {
    if (!activitiesByTicket.has(activity.ticket_id)) {
      activitiesByTicket.set(activity.ticket_id, []);
    }
    activitiesByTicket.get(activity.ticket_id)!.push(activity);
  }

  // Sort activities by created_at for each ticket
  for (const [ticketId, activities] of activitiesByTicket.entries()) {
    activities.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  for (const ticket of ticketsCreated) {
    const createdAt = new Date(ticket.created_at).getTime();
    const ticketActivities = activitiesByTicket.get(ticket.id) ?? [];

    // First response time (earliest meaningful action)
    let firstActionAt: string | null = null;
    for (const activity of ticketActivities) {
      if (meaningfulActionTypes.includes(activity.event_type)) {
        firstActionAt = activity.created_at;
        break;
      }
    }
    if (firstActionAt) {
      const firstActionTime = new Date(firstActionAt).getTime();
      const responseTime = (firstActionTime - createdAt) / 1000; // seconds
      firstResponseTimes.push(responseTime);
    }

    // Time to close (earliest close event)
    let closeEventAt: string | null = null;
    for (const activity of ticketActivities) {
      if (activity.event_type === "ticket.resolved") {
        closeEventAt = activity.created_at;
        break;
      } else if (activity.event_type === "ticket.status_changed" && activity.diff) {
        // Parse diff to check if status changed to closed
        try {
          const diff = typeof activity.diff === "string" ? JSON.parse(activity.diff) : activity.diff;
          if (diff && typeof diff === "object" && diff.status) {
            const statusDiff = diff.status;
            if (statusDiff && typeof statusDiff === "object") {
              const after = statusDiff.after;
              if (after === "closed" || after === "resolved") {
                closeEventAt = activity.created_at;
                break;
              }
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
    if (closeEventAt) {
      const closeTime = new Date(closeEventAt).getTime();
      const timeToClose = (closeTime - createdAt) / 1000; // seconds
      timeToCloseTimes.push(timeToClose);
    }
  }

  // Calculate percentiles
  const sortedFirstResponse = [...firstResponseTimes].sort((a, b) => a - b);
  const sortedTimeToClose = [...timeToCloseTimes].sort((a, b) => a - b);

  const firstResponseMedian = calculatePercentile(sortedFirstResponse, 0.5);
  const firstResponseP90 = calculatePercentile(sortedFirstResponse, 0.9);
  const timeToCloseMedian = calculatePercentile(sortedTimeToClose, 0.5);
  const timeToCloseP90 = calculatePercentile(sortedTimeToClose, 0.9);

  return {
    firstResponseMedianSec: firstResponseMedian,
    firstResponseP90Sec: firstResponseP90,
    timeToCloseMedianSec: timeToCloseMedian,
    timeToCloseP90Sec: timeToCloseP90,
  };
}

/**
 * Calculate time series data
 */
function calculateSeries(
  ticketsCreated: Array<{ id: string; created_at: string; priority: string | null }>,
  from: Date,
  to: Date,
  range: "24h" | "7d" | "30d" | "90d"
): TicketsAnalyticsSeries {
  // Determine bucket size
  const isHourly = range === "24h";
  const bucketMs = isHourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 1 hour or 1 day

  // Create time buckets
  const buckets = new Map<string, number>();
  let current = new Date(from);
  while (current <= to) {
    const key = isHourly
      ? current.toISOString().slice(0, 13) + ":00:00Z" // YYYY-MM-DDTHH:00:00Z
      : current.toISOString().slice(0, 10); // YYYY-MM-DD
    buckets.set(key, 0);
    current = new Date(current.getTime() + bucketMs);
  }

  // Count tickets per bucket
  for (const ticket of ticketsCreated) {
    const ticketDate = new Date(ticket.created_at);
    const key = isHourly
      ? ticketDate.toISOString().slice(0, 13) + ":00:00Z"
      : ticketDate.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const createdOverTime = Array.from(buckets.entries())
    .map(([ts, count]) => ({ ts, count }))
    .sort((a, b) => a.ts.localeCompare(b.ts));

  // Priority breakdown
  const priorityCounts = new Map<string, number>();
  for (const ticket of ticketsCreated) {
    const priority = ticket.priority?.trim().toLowerCase() || "unassigned";
    priorityCounts.set(priority, (priorityCounts.get(priority) ?? 0) + 1);
  }

  const priorityBreakdown = Array.from(priorityCounts.entries())
    .map(([priority, count]) => ({ priority, count }))
    .sort((a, b) => b.count - a.count);

  return {
    createdOverTime,
    priorityBreakdown,
  };
}

/**
 * Get empty result structure
 */
function getEmptyResult(): TicketsAnalyticsResult {
  return {
    kpis: {
      createdCount: 0,
      closedCount: 0,
      openNowCount: 0,
      slaBreachedCount: 0,
      slaBreachedRate: 0,
    },
    funnel: {
      created: 0,
      inProgress: 0,
      closed: 0,
      createdToInProgressRate: 0,
      inProgressToClosedRate: 0,
    },
    responseTimes: {
      firstResponseMedianSec: null,
      firstResponseP90Sec: null,
      timeToCloseMedianSec: null,
      timeToCloseP90Sec: null,
    },
    series: {
      createdOverTime: [],
      priorityBreakdown: [],
    },
  };
}

