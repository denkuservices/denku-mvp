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
  /**
   * Who the request is about, in words.
   *
   * A list of requests whose rows all read "Support Request" is a list nobody can scan: the row
   * that matters is found by the customer's name or number, not by a subject the AI generated
   * from a template. Resolved from the ticket's own requester fields first (what the AI actually
   * captured on the call) and from the linked contact otherwise.
   */
  who: string | null;
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
  requester_name?: string | null;
  requester_phone?: string | null;
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
    who: row.requester_name?.trim() || row.requester_phone?.trim() || null,
    href: requestHref("ticket", row.id),
  };
}

/**
 * Where an appointment's detail lives.
 *
 * Sprint 9 · T4: this used to be the bare `/dashboard/appointments` list, which the platform
 * middleware redirects straight back to Requests — so clicking an appointment returned you to
 * the page you clicked from, and no appointment's details were reachable anywhere in the
 * product. Interim detail route until Sprint 13's unified Request detail replaces it.
 */
export function appointmentHref(id: string): string {
  return requestHref("appointment", id);
}

/**
 * Where a request's detail lives — one URL shape for both types (Sprint 13).
 *
 * Tickets and appointments are one concept split across two tables, and until now they were also
 * split across two URL shapes: a legacy ticket page and an interim appointment route. The type
 * rides along as a query param so the page can dispatch without probing both tables; it is a
 * hint, not a trust boundary — the page still resolves the id org-scoped either way.
 */
export function requestHref(type: RequestType, id: string): string {
  return `/dashboard/crm/requests/${id}?type=${type}`;
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
    // Appointments carry no requester columns of their own — the name comes from the linked
    // contact, resolved by `attachContactNames`.
    who: null,
    href: appointmentHref(row.id),
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

export interface AppointmentDetailView extends RequestView {
  /** Appointment end time, when the booking recorded one. */
  endsAt: string | null;
  /**
   * What was said on the call that produced this booking.
   *
   * The detail page's whole job is to answer "what was actually agreed", and the answer lives in
   * the conversation — not in `notes`, which the deterministic booking path fills with a raw dump
   * and the tool path often leaves empty. Detail read only; the list never selects it.
   */
  transcript: string | null;
}

/**
 * One appointment, org-scoped (Sprint 9 · T4).
 *
 * Returns null when it doesn't exist or belongs to another org — the caller renders a 404, so a
 * guessed id can never confirm another tenant's appointment. Fails soft on read errors.
 */
export async function getAppointmentDetail(
  orgId: string,
  appointmentId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<AppointmentDetailView | null> {
  if (!orgId || !appointmentId) return null;

  try {
    const { data, error } = await db
      .from("appointments")
      .select("id, notes, status, start_at, end_at, created_at, call_id, lead_id")
      .eq("id", appointmentId)
      .eq("org_id", orgId)
      .maybeSingle<AppointmentRow & { end_at: string | null }>();

    if (error || !data) return null;

    /*
     * The transcript is fetched separately rather than joined.
     *
     * A PostgREST embed would make the appointment read depend on the FK between `appointments`
     * and `calls` being present and named as expected — and a missing relationship there would
     * fail the whole read, turning "we could not load the transcript" into "this appointment does
     * not exist". Two queries, and the second one is allowed to come back empty.
     */
    let transcript: string | null = null;
    if (data.call_id) {
      const { data: call } = await db
        .from("calls")
        .select("transcript")
        .eq("org_id", orgId)
        .eq("id", data.call_id)
        .maybeSingle<{ transcript: string | null }>();
      transcript = call?.transcript ?? null;
    }

    const base = await attachContactNames(orgId, [appointmentToRequest(data)], db);

    return { ...base[0], endsAt: data.end_at ?? null, transcript };
  } catch (err) {
    console.error(
      "[PLATFORM][READMODEL][REQUESTS][DETAIL]",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Fill in `who` from the linked contact wherever the request itself did not carry a name.
 *
 * One extra query for the whole page, not one per row: the ids are collected first and fetched
 * with a single `in`. Fails soft — a request with no resolvable name is a row that reads a little
 * thinner, never a page that fails to load.
 */
async function attachContactNames(
  orgId: string,
  rows: RequestView[],
  db: SupabaseClient
): Promise<RequestView[]> {
  const missing = [...new Set(rows.filter((r) => !r.who && r.contactId).map((r) => r.contactId!))];
  if (missing.length === 0) return rows;

  try {
    const { data } = await db
      .from("leads")
      .select("id, name, phone, email")
      .eq("org_id", orgId)
      .in("id", missing);

    const byId = new Map<string, string>();
    for (const lead of (data ?? []) as Array<{
      id: string;
      name: string | null;
      phone: string | null;
      email: string | null;
    }>) {
      const label = lead.name?.trim() || lead.phone?.trim() || lead.email?.trim();
      if (label) byId.set(lead.id, label);
    }

    return rows.map((r) =>
      r.who || !r.contactId ? r : { ...r, who: byId.get(r.contactId) ?? null }
    );
  } catch {
    return rows;
  }
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
      .select(
        "id, subject, description, status, priority, created_at, call_id, lead_id, requester_name, requester_phone"
      )
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

    const all = await attachContactNames(
      orgId,
      [
        ...((t.data ?? []) as TicketRow[]).map(ticketToRequest),
        ...((a.data ?? []) as AppointmentRow[]).map(appointmentToRequest),
      ],
      db
    );

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
