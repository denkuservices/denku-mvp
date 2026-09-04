import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listConversationViews, filterConversationViews } from "@/lib/platform/readModel/conversations";
import type { ConversationView } from "@/lib/platform/readModel/types";
import type { Channel } from "@/lib/platform/channels";

/**
 * Aggregation read model (Sprint 5.5, Q0) — the shared numeric layer behind the platform
 * Dashboard and Analytics. Pure aggregation functions operate on ConversationView[] (so
 * they're unit-testable and channel/storage-agnostic); `getConversationAggregates` fetches
 * via the conversations read model and runs them.
 *
 * Honesty (R-018): the fetch is bounded by `limit`; when the bound is hit the result is
 * flagged `limited: true` so surfaces can say "recent N", never implying an all-time total
 * that wasn't counted.
 */

export interface EmployeeCount {
  employeeId: string;
  name: string;
  count: number;
}
export interface DayCount {
  date: string; // YYYY-MM-DD (UTC)
  count: number;
}
export interface ConversationAggregates {
  total: number;
  byChannel: Record<string, number>;
  byEmployee: EmployeeCount[];
  byDay: DayCount[];
  byIntent: Record<string, number>;
  /** true when the fetch hit its bound → figures are "recent", not all-time. */
  limited: boolean;
  windowDays: number;
}

// --- pure aggregations ------------------------------------------------------

export function aggregateByChannel(views: ConversationView[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of views) out[v.channel] = (out[v.channel] ?? 0) + 1;
  return out;
}

export function aggregateByEmployee(views: ConversationView[]): EmployeeCount[] {
  const map = new Map<string, EmployeeCount>();
  for (const v of views) {
    const id = v.employeeId ?? "unassigned";
    const cur = map.get(id) ?? { employeeId: id, name: v.employeeName ?? "Unassigned", count: 0 };
    cur.count += 1;
    map.set(id, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function aggregateByIntent(views: ConversationView[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of views) {
    const key = v.intent ?? "unknown";
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/** Per-day counts for the last `days` days (UTC), zero-filled so charts are continuous. */
export function aggregateByDay(views: ConversationView[], days: number): DayCount[] {
  const buckets = new Map<string, number>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const v of views) {
    if (!v.lastActivityAt) continue;
    const key = v.lastActivityAt.slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

// --- fetch + assemble -------------------------------------------------------

export async function getConversationAggregates(
  orgId: string,
  opts: { limit?: number; windowDays?: number } = {},
  db: SupabaseClient = supabaseAdmin
): Promise<ConversationAggregates> {
  const limit = opts.limit ?? 500;
  const windowDays = opts.windowDays ?? 14;
  const empty: ConversationAggregates = {
    total: 0,
    byChannel: {},
    byEmployee: [],
    byDay: aggregateByDay([], windowDays),
    byIntent: {},
    limited: false,
    windowDays,
  };
  if (!orgId) return empty;

  // Counting only: nothing below reads a row's preview, so the transcripts stay in the
  // database instead of crossing the wire (see `preview` on ListConversationsOpts).
  const scanned = await listConversationViews(orgId, { limit, preview: false }, db);

  /**
   * Restrict every aggregate to the window before counting.
   *
   * `windowDays` used to reach only `aggregateByDay`, so the chart showed the last N days while
   * `total`, `byChannel`, `byEmployee` and `byIntent` counted everything scanned — and Home
   * printed all of them under an "Accomplished · last 7 days" heading. On this workspace that
   * rendered "Conversations handled 181 / last 7 days" above a chart of the same seven days
   * showing single digits, because the newest call was six months old. The number was true of
   * all time and false of the label, which is exactly the R-018 failure the honesty rule exists
   * to prevent: a real figure made misleading by its frame.
   *
   * `listConversationViews` applies no date bound (only `contactId` / `ids` reach the query), so
   * the window is applied here, over the scanned page, using the same `from` semantics the list
   * surfaces use.
   */
  const from = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const views = filterConversationViews(scanned, { from });

  return {
    total: views.length,
    byChannel: aggregateByChannel(views),
    byEmployee: aggregateByEmployee(views),
    byDay: aggregateByDay(views, windowDays),
    byIntent: aggregateByIntent(views),
    // `limited` describes the SCAN, not the window: it means older conversations may exist
    // beyond the scanned page, so a windowed count could be a floor rather than a total.
    limited: scanned.length >= limit,
    windowDays,
  };
}

/**
 * Artifact counts (channel-agnostic) for the outcome tiles — plus the **open** counts the
 * action-first dashboard needs to answer "does anything need me?" (R-121). Never throws.
 */
export async function getArtifactCounts(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<{ tickets: number; appointments: number; openTickets: number; upcomingAppointments: number }> {
  const empty = { tickets: 0, appointments: 0, openTickets: 0, upcomingAppointments: 0 };
  if (!orgId) return empty;
  try {
    // Four counts that know nothing about each other, issued together rather than in a ladder
    // (perf, 2026-09-04): as four awaits this cost four cross-country round-trips on the first
    // screen after sign-in.
    const [t, a, openT, upcomingA] = await Promise.all([
      db.from("tickets").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      db.from("appointments").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      // "Needs attention": tickets nobody has closed, and appointments still ahead of now.
      db
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "open"),
      db
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "scheduled")
        .gte("start_at", new Date().toISOString()),
    ]);
    return {
      tickets: t.count ?? 0,
      appointments: a.count ?? 0,
      openTickets: openT.count ?? 0,
      upcomingAppointments: upcomingA.count ?? 0,
    };
  } catch {
    return empty;
  }
}

// --- Sprint 12: ranges, comparison and rhythm -------------------------------

/** An analytics range, in days. The three the legacy analytics offered. */
export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export function resolveRange(value: string | null | undefined): AnalyticsRange {
  const n = Number((value ?? "").replace(/[^0-9]/g, ""));
  return (ANALYTICS_RANGES as readonly number[]).includes(n) ? (n as AnalyticsRange) : 7;
}

/** Per-hour-of-day counts (UTC), zero-filled — the "when is my phone busiest" shape. */
export function aggregateByHour(views: ConversationView[]): number[] {
  const buckets = new Array(24).fill(0) as number[];
  for (const v of views) {
    const ts = v.lastActivityAt ?? v.startedAt;
    if (!ts) continue;
    const h = new Date(ts).getUTCHours();
    if (Number.isFinite(h) && h >= 0 && h < 24) buckets[h] += 1;
  }
  return buckets;
}

/** UTC midnight `days` ago. */
function cutoff(days: number, now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1));
}

/** Split a scan into the current window and the one immediately before it. Pure. */
export function splitByPeriod(
  views: ConversationView[],
  days: number,
  now = new Date()
): { current: ConversationView[]; previous: ConversationView[] } {
  const startCurrent = cutoff(days, now);
  const startPrevious = cutoff(days * 2, now);
  const current: ConversationView[] = [];
  const previous: ConversationView[] = [];

  for (const v of views) {
    const ts = Date.parse(v.lastActivityAt ?? v.startedAt ?? "");
    if (Number.isNaN(ts)) continue;
    if (ts >= startCurrent) current.push(v);
    else if (ts >= startPrevious) previous.push(v);
  }
  return { current, previous };
}

export interface RangedAggregates extends ConversationAggregates {
  byHour: number[];
  /** Conversation count over the immediately preceding window of the same length. */
  previousTotal: number;
  /**
   * True when the scan hit its bound, so the *previous* period is under-counted and any
   * comparison against it would flatter the current one. Callers must not render a delta.
   */
  comparisonBounded: boolean;
}

/**
 * Range-aware aggregates (Sprint 12).
 *
 * The scan is still bounded, and that bound is still reported rather than hidden — but the
 * figures are now scoped to the requested window instead of "whatever the last N conversations
 * happened to be", so a 30-day range means thirty days.
 *
 * The comparison is deliberately suppressed when the scan is bounded: a truncated scan loses
 * the OLDEST rows first, which is exactly the previous period, and a delta computed against a
 * partial baseline reads as growth that did not happen (R-018).
 */
export async function getRangedAggregates(
  orgId: string,
  opts: { range?: AnalyticsRange; limit?: number } = {},
  db: SupabaseClient = supabaseAdmin
): Promise<RangedAggregates> {
  const range = opts.range ?? 7;
  const limit = opts.limit ?? 1000;
  const empty: RangedAggregates = {
    total: 0,
    byChannel: {},
    byEmployee: [],
    byDay: aggregateByDay([], range),
    byIntent: {},
    byHour: new Array(24).fill(0),
    limited: false,
    previousTotal: 0,
    comparisonBounded: false,
    windowDays: range,
  };
  if (!orgId) return empty;

  // Counting only — same reasoning as above.
  const views = await listConversationViews(orgId, { limit, preview: false }, db);
  const bounded = views.length >= limit;
  const { current, previous } = splitByPeriod(views, range);

  return {
    total: current.length,
    byChannel: aggregateByChannel(current),
    byEmployee: aggregateByEmployee(current),
    byDay: aggregateByDay(current, range),
    byIntent: aggregateByIntent(current),
    byHour: aggregateByHour(current),
    limited: bounded,
    previousTotal: previous.length,
    comparisonBounded: bounded,
    windowDays: range,
  };
}
