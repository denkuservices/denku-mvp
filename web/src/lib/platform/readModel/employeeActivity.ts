import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ConversationView, EmployeeView } from "@/lib/platform/readModel/types";
import { listConversationViews } from "@/lib/platform/readModel/conversations";
import { listRequestViews } from "@/lib/platform/readModel/requests";
import { evaluateConnectionHealth, type HealthSeverity } from "@/lib/platform/connectionHealth";

/**
 * Employee activity + attention (Phase 5).
 *
 * The AI Team roster has to answer "who is working, and how are they doing?" — which means
 * outcomes, not configuration. This computes both from records that already exist: conversations
 * handled (read model) and requests produced (artifacts), plus the connection health of the
 * channels the employee owns.
 *
 * **Every number here is observed, never estimated.** `conversationsHandled` counts conversations
 * within a bounded recent window and says so via `windowDays`; there is no all-time total,
 * because the read model scans a window and inventing a total from it would be the exact R-018
 * violation Sprint 8.5 caught.
 */

/** How far back roster activity looks. Matches what an owner means by "this week". */
export const ACTIVITY_WINDOW_DAYS = 7;

export interface EmployeeActivity {
  employeeId: string;
  /** Conversations handled within `windowDays`. A floor when `bounded`. */
  conversationsHandled: number;
  /** Requests (tickets + appointments) this employee's conversations produced in the window. */
  requestsProduced: number;
  lastActiveAt: string | null;
  windowDays: number;
  /** True when the underlying scan hit its bound, so counts are floors, not totals. */
  bounded: boolean;
}

export type AttentionSeverity = Exclude<HealthSeverity, "ok">;

export interface EmployeeAttention {
  severity: AttentionSeverity;
  /** Plain-language, actionable. Never a raw error string. */
  message: string;
}

/** Pure: reduce an employee's conversations + linked requests into an activity summary. */
export function summarizeEmployeeActivity(
  employeeId: string,
  conversations: ConversationView[],
  requestCallIds: ReadonlySet<string>,
  opts: { windowDays?: number; bounded?: boolean } = {}
): EmployeeActivity {
  const mine = conversations.filter((c) => c.employeeId === employeeId);
  let lastActiveAt: string | null = null;
  let requestsProduced = 0;

  for (const c of mine) {
    const at = c.lastActivityAt ?? c.startedAt;
    if (at && (!lastActiveAt || Date.parse(at) > Date.parse(lastActiveAt))) lastActiveAt = at;
    if (requestCallIds.has(c.id)) requestsProduced += 1;
  }

  return {
    employeeId,
    conversationsHandled: mine.length,
    requestsProduced,
    lastActiveAt,
    windowDays: opts.windowDays ?? ACTIVITY_WINDOW_DAYS,
    bounded: opts.bounded ?? false,
  };
}

/**
 * Pure: does this employee need a human's attention right now?
 *
 * Derived from what we can actually observe — channel connection health and whether the employee
 * can work at all. Returns null when nothing is wrong; the roster shows an all-clear rather than
 * manufacturing a warning to fill space.
 */
export function employeeAttention(employee: EmployeeView): EmployeeAttention | null {
  if (employee.channels.length === 0) {
    return {
      severity: "warn",
      message: "No channel connected — this employee has no way to reach your customers.",
    };
  }

  // Worst channel wins: one broken channel is worth surfacing even if the others are fine.
  let worst: EmployeeAttention | null = null;
  for (const channel of employee.channels) {
    const health = evaluateConnectionHealth({
      status: channel.status,
      // A channel with no adapter is "coming soon", not "broken" — never an alert.
      adopted: channel.status === "coming_soon" ? false : undefined,
      expiresAt: (channel.meta?.tokenExpiresAt as string | undefined) ?? null,
      lastError: (channel.meta?.lastError as string | undefined) ?? null,
    });
    if (health.severity === "ok" || health.severity === "neutral") continue;

    const candidate: EmployeeAttention = {
      severity: health.severity,
      message: `${channel.label}: ${health.detail ?? health.label}`,
    };
    if (!worst || (worst.severity === "warn" && candidate.severity === "critical")) worst = candidate;
  }
  return worst;
}

/**
 * Activity for every employee in one pass. Two queries total rather than two per employee —
 * the roster must not become an N+1 as the team grows.
 */
export async function getTeamActivity(
  orgId: string,
  employees: EmployeeView[],
  db: SupabaseClient = supabaseAdmin,
  windowDays = ACTIVITY_WINDOW_DAYS
): Promise<Map<string, EmployeeActivity>> {
  const out = new Map<string, EmployeeActivity>();
  if (!orgId || employees.length === 0) return out;

  const SCAN = 500;
  const since = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  const [conversations, requests] = await Promise.all([
    // Only ids and timestamps are read below, so this scan of five hundred rows skips the
    // transcripts entirely (see `preview` on ListConversationsOpts).
    listConversationViews(orgId, { limit: SCAN, preview: false }, db).catch(() => [] as ConversationView[]),
    listRequestViews(orgId, { limit: SCAN }, db)
      .then((r) => r.items)
      .catch(() => []),
  ]);

  const inWindow = conversations.filter((c) => {
    const at = c.lastActivityAt ?? c.startedAt;
    return at ? Date.parse(at) >= since : false;
  });

  // A request is attributed to the conversation that produced it, via its call link.
  const requestCallIds = new Set(requests.map((r) => r.callId).filter((id): id is string => Boolean(id)));
  const bounded = conversations.length >= SCAN;

  for (const employee of employees) {
    out.set(employee.id, summarizeEmployeeActivity(employee.id, inWindow, requestCallIds, { windowDays, bounded }));
  }
  return out;
}
