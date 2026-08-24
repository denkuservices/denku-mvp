import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Requests read model (Sprint 8.5 / R-122).
 *
 * **Why "Requests":** Tickets and Appointments are one concept — *what the AI produced from a
 * conversation* — split across two nav items only because they're two tables. A plumber doesn't run
 * a "ticket queue"; they have requests, some of which are booked. Deliberately **not** "Tasks":
 * that noun is reserved for R-113 (pending work — follow-ups, callbacks), and the collision would
 * be permanent.
 *
 * Sourced by querying `tickets` + `appointments` directly and merging in code, rather than the
 * `artifacts` view — the view ships in the (unapplied) Sprint 4.5 migration, and this surface must
 * work today. When the view is applied, this can swap to it with no change to the view types.
 */

export type RequestType = "ticket" | "appointment";

export interface RequestView {
  id: string;
  type: RequestType;
  title: string;
  /** Ticket description / appointment notes. */
  body: string | null;
  status: string | null;
  priority: string | null;
  /** Appointment start time; null for tickets. */
  occursAt: string | null;
  createdAt: string;
  /** The conversation that produced it, when linked. */
  callId: string | null;
  contactId: string | null;
  /** Where this request's detail lives (existing detail pages are preserved). */
  href: string;
}

interface TicketRow {
  id: string;
  subject: string | null;
  description: string | null;
  status: string | null;
  priority: string | null;
  created_at: string;
  call_id: string | null;
  lead_id: string | null;
}

interface AppointmentRow {
  id: string;
  notes: string | null;
  status: string | null;
  start_at: string | null;
  created_at: string;
  call_id: string | null;
  lead_id: string | null;
}

export function ticketToRequest(row: TicketRow): RequestView {
  return {
    id: row.id,
    type: "ticket",
    title: row.subject?.trim() || "Request",
    body: row.description,
    status: row.status,
    priority: row.priority,
    occursAt: null,
    createdAt: row.created_at,
    callId: row.call_id,
    contactId: row.lead_id,
    href: `/dashboard/tickets/${row.id}`,
  };
}

export function appointmentToRequest(row: AppointmentRow): RequestView {
  return {
    id: row.id,
    type: "appointment",
    title: "Appointment",
    body: row.notes,
    status: row.status,
    priority: null,
    occursAt: row.start_at,
    createdAt: row.created_at,
    callId: row.call_id,
    contactId: row.lead_id,
    href: `/dashboard/appointments`,
  };
}

/** Newest first, by the time that matters for each type. Pure. */
export function sortRequests(a: RequestView, b: RequestView): number {
  const at = Date.parse(a.occursAt ?? a.createdAt);
  const bt = Date.parse(b.occursAt ?? b.createdAt);
  return (Number.isNaN(bt) ? 0 : bt) - (Number.isNaN(at) ? 0 : at);
}

export interface ListRequestsOpts {
  type?: RequestType;
  status?: string;
  search?: string;
  limit?: number;
  /**
   * Restrict to one contact, **pushed into the query** rather than filtered afterwards.
   *
   * The contact timeline needs every request for one person, not the org's most recent N with
   * that person's filtered out of them — scanning-then-filtering silently drops a customer's
   * older history once the org passes the scan limit, on the one surface that promises a
   * complete journey.
   */
  contactId?: string;
}

/** Filter requests in memory. Pure + testable. */
export function filterRequests(rows: RequestView[], opts: ListRequestsOpts): RequestView[] {
  const q = (opts.search ?? "").trim().toLowerCase();
  return rows.filter((r) => {
    if (opts.type && r.type !== opts.type) return false;
    if (opts.status && (r.status ?? "") !== opts.status) return false;
    if (q) {
      const hay = [r.title, r.body, r.status].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export interface RequestsResult {
  items: RequestView[];
  counts: { all: number; ticket: number; appointment: number };
}

export async function listRequestViews(
  orgId: string,
  opts: ListRequestsOpts = {},
  db: SupabaseClient = supabaseAdmin
): Promise<RequestsResult> {
  const empty: RequestsResult = { items: [], counts: { all: 0, ticket: 0, appointment: 0 } };
  if (!orgId) return empty;
  const limit = opts.limit ?? 200;

  try {
    let ticketQuery = db
      .from("tickets")
      .select("id, subject, description, status, priority, created_at, call_id, lead_id")
      .eq("org_id", orgId);
    let appointmentQuery = db
      .from("appointments")
      .select("id, notes, status, start_at, created_at, call_id, lead_id")
      .eq("org_id", orgId);

    // Narrow at the database, not afterwards — see `contactId` on ListRequestsOpts.
    if (opts.contactId) {
      ticketQuery = ticketQuery.eq("lead_id", opts.contactId);
      appointmentQuery = appointmentQuery.eq("lead_id", opts.contactId);
    }

    const [t, a] = await Promise.all([
      ticketQuery.order("created_at", { ascending: false }).limit(limit),
      appointmentQuery.order("start_at", { ascending: false }).limit(limit),
    ]);

    const all = [
      ...((t.data ?? []) as TicketRow[]).map(ticketToRequest),
      ...((a.data ?? []) as AppointmentRow[]).map(appointmentToRequest),
    ];

    // Counts reflect the unfiltered set, so the type tabs show real totals.
    const counts = {
      all: all.length,
      ticket: all.filter((r) => r.type === "ticket").length,
      appointment: all.filter((r) => r.type === "appointment").length,
    };

    return { items: filterRequests(all, opts).sort(sortRequests), counts };
  } catch (err) {
    console.error("[PLATFORM][READMODEL][REQUESTS]", err instanceof Error ? err.message : String(err));
    return empty;
  }
}
