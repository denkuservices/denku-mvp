import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * What a contact is actually *doing* — the half the Contacts list was missing.
 *
 * The list showed a name, a lifecycle pill, a one-word source and a date. Four columns, but only
 * one of them carried information a person could act on, which is why a screen with real rows in
 * it still read as a single column of names. Meanwhile the same workspace held 104 tickets, 197
 * calls and a calendar of appointments, none of which the list knew about.
 *
 * This joins that work back onto the person it belongs to. Nothing here is invented: every field
 * is an aggregate over rows that already exist and are already linked by `lead_id`.
 *
 * **Batched, never per-row.** One query per source table with `.in("lead_id", ids)`, folded in
 * memory. A list of 50 contacts costs three queries, not 150 — an N+1 here would be invisible in
 * development and fatal on a workspace with history.
 *
 * Never throws: a failed aggregate degrades to "no activity known" so the list still renders.
 * Contacts are the surface a business opens when a customer is on the phone; it does not get to
 * be down because a count could not be computed.
 */

export interface ContactInsight {
  /** Requests still open — the number that should pull the eye. */
  openRequests: number;
  totalRequests: number;
  /** The soonest appointment in the future, if any. */
  nextAppointmentAt: string | null;
  nextAppointmentStatus: string | null;
  /** Appointments already held — a returning customer looks different from a new one. */
  pastAppointments: number;
  /** Calls exchanged, and when the last one was. */
  calls: number;
  lastCallAt: string | null;
  /** Total talk time in seconds, across every call. */
  talkSeconds: number;
}

export const EMPTY_INSIGHT: ContactInsight = {
  openRequests: 0,
  totalRequests: 0,
  nextAppointmentAt: null,
  nextAppointmentStatus: null,
  pastAppointments: 0,
  calls: 0,
  lastCallAt: null,
  talkSeconds: 0,
};

/** Ticket statuses that mean "still needs a person". Anything else is finished. */
const OPEN_TICKET_STATUSES = new Set(["open", "pending", "in_progress", "new"]);

/** Appointment statuses that still represent a commitment. */
const LIVE_APPOINTMENT_STATUSES = new Set(["requested", "scheduled", "confirmed"]);

export interface TicketRow {
  lead_id: string | null;
  status: string | null;
}
export interface AppointmentRow {
  lead_id: string | null;
  status: string | null;
  start_at: string | null;
}
export interface CallRow {
  lead_id: string | null;
  created_at: string | null;
  duration_seconds: number | null;
}

/**
 * Fold raw rows into per-contact insight. Pure — exported so the interesting rules (which status
 * counts as open, which appointment is "next", how an appointment with no date is treated) are
 * testable without a database.
 *
 * `now` is a parameter rather than `Date.now()` so "upcoming" is deterministic in a test.
 */
export function buildContactInsights(input: {
  tickets: TicketRow[];
  appointments: AppointmentRow[];
  calls: CallRow[];
  now?: Date;
}): Map<string, ContactInsight> {
  const now = (input.now ?? new Date()).getTime();
  const out = new Map<string, ContactInsight>();

  const forId = (id: string): ContactInsight => {
    const existing = out.get(id);
    if (existing) return existing;
    const fresh = { ...EMPTY_INSIGHT };
    out.set(id, fresh);
    return fresh;
  };

  for (const t of input.tickets) {
    if (!t.lead_id) continue;
    const insight = forId(t.lead_id);
    insight.totalRequests += 1;
    if (OPEN_TICKET_STATUSES.has((t.status ?? "open").toLowerCase())) insight.openRequests += 1;
  }

  for (const a of input.appointments) {
    if (!a.lead_id) continue;
    const insight = forId(a.lead_id);
    const at = a.start_at ? Date.parse(a.start_at) : Number.NaN;
    const live = LIVE_APPOINTMENT_STATUSES.has((a.status ?? "").toLowerCase());

    // An appointment with no time yet is a REQUEST, not a booking. It must not be presented as
    // "next" — the AI creates these before anyone has agreed a slot, and showing a blank date
    // where a commitment belongs is exactly the kind of claim this product refuses to make.
    if (!Number.isFinite(at)) continue;

    if (at >= now && live) {
      const current = insight.nextAppointmentAt ? Date.parse(insight.nextAppointmentAt) : Infinity;
      if (at < current) {
        insight.nextAppointmentAt = a.start_at;
        insight.nextAppointmentStatus = a.status;
      }
    } else if (at < now) {
      insight.pastAppointments += 1;
    }
  }

  for (const c of input.calls) {
    if (!c.lead_id) continue;
    const insight = forId(c.lead_id);
    insight.calls += 1;
    insight.talkSeconds += Math.max(0, Number(c.duration_seconds ?? 0));
    if (c.created_at) {
      const previous = insight.lastCallAt ? Date.parse(insight.lastCallAt) : -Infinity;
      if (Date.parse(c.created_at) > previous) insight.lastCallAt = c.created_at;
    }
  }

  return out;
}

/**
 * Load insight for a set of contacts. Org-scoped on every query — `lead_id` alone would happily
 * match another tenant's row.
 */
export async function loadContactInsights(
  orgId: string,
  contactIds: string[],
  db: SupabaseClient = supabaseAdmin
): Promise<Map<string, ContactInsight>> {
  if (!orgId || contactIds.length === 0) return new Map();

  try {
    const [tickets, appointments, calls] = await Promise.all([
      db
        .from("tickets")
        .select("lead_id, status")
        .eq("org_id", orgId)
        .in("lead_id", contactIds),
      db
        .from("appointments")
        .select("lead_id, status, start_at")
        .eq("org_id", orgId)
        .in("lead_id", contactIds),
      db
        .from("calls")
        .select("lead_id, created_at, duration_seconds")
        .eq("org_id", orgId)
        .in("lead_id", contactIds),
    ]);

    return buildContactInsights({
      tickets: (tickets.data ?? []) as TicketRow[],
      appointments: (appointments.data ?? []) as AppointmentRow[],
      calls: (calls.data ?? []) as CallRow[],
    });
  } catch (err) {
    console.error("[CRM][INSIGHTS][FAILED]", err instanceof Error ? err.message : String(err));
    return new Map();
  }
}
