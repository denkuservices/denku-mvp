import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Estimated savings (Sprint 12 · decision D4).
 *
 * The one number on Home that translates activity into money, restored from the legacy
 * dashboard. **The formula is copied exactly** from `lib/analytics/queries.ts` so the platform
 * and legacy surfaces cannot quote different figures for the same period:
 *
 *   savings = max(callMinutes × ($25/hour ÷ 60) − what the calls actually cost, 0)
 *
 * It is an estimate and the UI must say so. $25/hour is a stand-in for a human answering the
 * phone, not a measured rate for this business — presenting it as a guarantee is precisely the
 * over-claiming the honesty rules exist to prevent (R-018/R-046).
 *
 * Read-only, org-scoped, never throws: a failed read returns null and the tile renders "—"
 * rather than a confident zero.
 */

/** Stand-in hourly cost of a human answering the phone. Same constant as the legacy analytics. */
export const HUMAN_AGENT_HOURLY_RATE = 25;

export interface EstimatedSavings {
  usd: number;
  /** Minutes of call time the estimate is based on. */
  minutes: number;
  windowDays: number;
}

export function computeSavings(
  rows: Array<{ duration_seconds: number | null; cost_usd: number | null }>
): { usd: number; minutes: number } {
  const totalSeconds = rows.reduce((sum, r) => sum + Number(r.duration_seconds ?? 0), 0);
  const totalCost = rows.reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0);
  const minutes = totalSeconds / 60;
  const humanCost = minutes * (HUMAN_AGENT_HOURLY_RATE / 60);
  return { usd: Math.max(humanCost - totalCost, 0), minutes };
}

export async function getEstimatedSavings(
  orgId: string,
  windowDays = 7,
  db: SupabaseClient = supabaseAdmin
): Promise<EstimatedSavings | null> {
  if (!orgId) return null;

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (windowDays - 1));
  since.setUTCHours(0, 0, 0, 0);

  try {
    const { data, error } = await db
      .from("calls")
      .select("duration_seconds, cost_usd")
      .eq("org_id", orgId)
      .gte("started_at", since.toISOString());

    if (error || !data) return null;
    const { usd, minutes } = computeSavings(data as Array<{ duration_seconds: number | null; cost_usd: number | null }>);
    return { usd, minutes, windowDays };
  } catch (err) {
    console.error("[PLATFORM][READMODEL][SAVINGS]", err instanceof Error ? err.message : String(err));
    return null;
  }
}
