import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Outcome counts for Home (Phase 6) — what the AI team ACCOMPLISHED in a period.
 *
 * Deliberately distinct from `getArtifactCounts`, which reports all-time totals and open work.
 * Home's question is "what did my AI team do for me *this week*"; answering it with an all-time
 * number would flatter the product while telling the owner nothing.
 *
 * Every count is a real `count: exact` over an indexed window — no scanning, no estimating — and
 * `null` when a query fails, so the UI can omit a tile instead of rendering a confident zero.
 * **A zero and an unknown are different facts and must not look the same.**
 */

export interface OutcomeCounts {
  /** People who first reached this business inside the window. */
  newContacts: number | null;
  /** Requests the AI created from conversations in the window. */
  requestsCreated: number | null;
  /** Requests closed inside the window — work that actually got finished. */
  requestsResolved: number | null;
  /** Appointments booked in the window (whenever they occur). */
  appointmentsBooked: number | null;
  windowDays: number;
}

/** Rows in `table` for this org whose `column` falls inside the window. Null on any failure. */
async function countSince(
  db: SupabaseClient,
  table: string,
  orgId: string,
  column: string,
  sinceIso: string
): Promise<number | null> {
  try {
    const { count, error } = await db
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte(column, sinceIso);
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

/** As `countSince`, additionally constrained to one status value. */
async function countSinceWithStatus(
  db: SupabaseClient,
  table: string,
  orgId: string,
  column: string,
  sinceIso: string,
  status: string
): Promise<number | null> {
  try {
    const { count, error } = await db
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", status)
      .gte(column, sinceIso);
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

export async function getOutcomeCounts(
  orgId: string,
  windowDays = 7,
  db: SupabaseClient = supabaseAdmin
): Promise<OutcomeCounts> {
  const empty: OutcomeCounts = {
    newContacts: null,
    requestsCreated: null,
    requestsResolved: null,
    appointmentsBooked: null,
    windowDays,
  };
  if (!orgId) return empty;

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const [newContacts, requestsCreated, requestsResolved, appointmentsBooked] = await Promise.all([
    countSince(db, "leads", orgId, "created_at", since),
    countSince(db, "tickets", orgId, "created_at", since),
    // "Resolved" is measured on updated_at with a closed status: the row moved to done inside the
    // window, which is the fact an owner cares about — not when it was first raised.
    countSinceWithStatus(db, "tickets", orgId, "updated_at", since, "closed"),
    countSince(db, "appointments", orgId, "created_at", since),
  ]);

  return { newContacts, requestsCreated, requestsResolved, appointmentsBooked, windowDays };
}
