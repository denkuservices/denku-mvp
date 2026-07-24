import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listConversationViews } from "@/lib/platform/readModel/conversations";
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

  const views = await listConversationViews(orgId, { limit }, db);
  return {
    total: views.length,
    byChannel: aggregateByChannel(views),
    byEmployee: aggregateByEmployee(views),
    byDay: aggregateByDay(views, windowDays),
    byIntent: aggregateByIntent(views),
    limited: views.length >= limit,
    windowDays,
  };
}

/** Convenience: total artifacts (channel-agnostic) for the outcome tiles. Never throws. */
export async function getArtifactCounts(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<{ tickets: number; appointments: number }> {
  if (!orgId) return { tickets: 0, appointments: 0 };
  try {
    const t = await db.from("tickets").select("id", { count: "exact", head: true }).eq("org_id", orgId);
    const a = await db.from("appointments").select("id", { count: "exact", head: true }).eq("org_id", orgId);
    return { tickets: t.count ?? 0, appointments: a.count ?? 0 };
  } catch {
    return { tickets: 0, appointments: 0 };
  }
}
