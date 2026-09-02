import type { ContactListView } from "@/lib/platform/readModel/contacts";
import { EMPTY_INSIGHT, type ContactInsight } from "@/lib/platform/readModel/contactInsights";

/**
 * The Contacts list, as data rules rather than JSX.
 *
 * Segments, sorting and the CSV all live here — pure, no Supabase, no React — because they are
 * the part with actual decisions in them ("what counts as needing attention?") and the part most
 * likely to drift between the table, the metric cards and the export if each re-implemented it.
 * The page reads this; so does the export route; so do the tests.
 */

export type ContactRow = ContactListView & { insight: ContactInsight };

export function withInsights(
  contacts: ContactListView[],
  insights: Map<string, ContactInsight>
): ContactRow[] {
  return contacts.map((c) => ({ ...c, insight: insights.get(c.id) ?? EMPTY_INSIGHT }));
}

/* ------------------------------------------------------------------- segments */

export const SEGMENTS = [
  {
    value: "",
    label: "All",
    hint: "Everyone your AI team has spoken to.",
  },
  {
    value: "attention",
    label: "Needs attention",
    hint: "Has at least one request still open.",
  },
  {
    value: "upcoming",
    label: "Upcoming",
    hint: "Has an appointment still to come.",
  },
  {
    value: "new",
    label: "New",
    hint: "Heard from, not yet followed up.",
  },
  {
    value: "qualified",
    label: "Qualified",
    hint: "Worth your team's time.",
  },
  {
    value: "quiet",
    label: "Gone quiet",
    hint: "Nothing from them in 30 days, and nothing open.",
  },
] as const;

export type SegmentValue = (typeof SEGMENTS)[number]["value"];

export function isSegment(value: string): value is SegmentValue {
  return SEGMENTS.some((s) => s.value === value);
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/**
 * Does this row belong in that segment?
 *
 * "Gone quiet" deliberately excludes anyone with an open request: a customer waiting on you is
 * not dormant, they are neglected, and putting them in a segment named after silence is how they
 * stay that way.
 */
export function matchesSegment(row: ContactRow, segment: string, now: number = Date.now()): boolean {
  switch (segment) {
    case "attention":
      return row.insight.openRequests > 0;
    case "upcoming":
      return Boolean(row.insight.nextAppointmentAt);
    case "new":
      return row.status === "new";
    case "qualified":
      return row.status === "qualified";
    case "quiet": {
      if (row.insight.openRequests > 0) return false;
      const last = Date.parse(row.lastSeenAt ?? "");
      return Number.isFinite(last) && now - last > THIRTY_DAYS;
    }
    default:
      return true;
  }
}

export function matchesSearch(row: ContactRow, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return [row.displayName, row.primaryHandle, row.source, row.status]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

/* -------------------------------------------------------------------- sorting */

export const SORTS = [
  { value: "recent", label: "Recent activity" },
  { value: "attention", label: "Most open requests" },
  { value: "upcoming", label: "Soonest appointment" },
  { value: "calls", label: "Most calls" },
  { value: "name", label: "Name (A–Z)" },
] as const;

export type SortValue = (typeof SORTS)[number]["value"];

export function isSort(value: string): value is SortValue {
  return SORTS.some((s) => s.value === value);
}

function time(iso: string | null): number {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? t : 0;
}

/**
 * Sort a copy, never in place.
 *
 * Every comparator falls through to recent activity, so rows that tie on the chosen measure —
 * which, on a count of zero, is most of them — still come back in a stable, meaningful order
 * instead of whatever the database happened to return.
 */
export function sortRows(rows: ContactRow[], sort: string): ContactRow[] {
  const byRecent = (a: ContactRow, b: ContactRow) => time(b.lastSeenAt) - time(a.lastSeenAt);

  const copy = [...rows];
  switch (sort) {
    case "attention":
      return copy.sort(
        (a, b) => b.insight.openRequests - a.insight.openRequests || byRecent(a, b)
      );
    case "upcoming":
      // Contacts with no appointment sink, rather than sorting as "the year 1970".
      return copy.sort((a, b) => {
        const at = a.insight.nextAppointmentAt ? time(a.insight.nextAppointmentAt) : Infinity;
        const bt = b.insight.nextAppointmentAt ? time(b.insight.nextAppointmentAt) : Infinity;
        return at - bt || byRecent(a, b);
      });
    case "calls":
      return copy.sort((a, b) => b.insight.calls - a.insight.calls || byRecent(a, b));
    case "name":
      return copy.sort((a, b) =>
        (a.displayName || a.primaryHandle || "").localeCompare(
          b.displayName || b.primaryHandle || "",
          undefined,
          { sensitivity: "base" }
        )
      );
    default:
      return copy.sort(byRecent);
  }
}

/* ---------------------------------------------------------------------- shape */

export interface ContactsQuery {
  q: string;
  segment: string;
  sort: string;
  page: number;
}

export const CONTACTS_PAGE_SIZE = 25;

export function parseContactsQuery(params: Record<string, string | undefined>): ContactsQuery {
  const segment = (params.segment ?? "").trim();
  const sort = (params.sort ?? "").trim();
  const page = Number.parseInt(params.page ?? "1", 10);
  return {
    q: (params.q ?? "").trim().slice(0, 120),
    segment: isSegment(segment) ? segment : "",
    sort: isSort(sort) ? sort : "recent",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Build a querystring that preserves everything except what the caller overrides. */
export function contactsHref(current: ContactsQuery, patch: Partial<ContactsQuery>): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.segment) params.set("segment", next.segment);
  if (next.sort && next.sort !== "recent") params.set("sort", next.sort);
  // A page reset is the right default for every filter change, so `page` is only kept when the
  // caller explicitly asks for one.
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return `/dashboard/crm/contacts${qs ? `?${qs}` : ""}`;
}

/* ------------------------------------------------------------------------ csv */

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The list as a spreadsheet — the same rows, in the same order, as whatever is on screen.
 *
 * A CRM that will not give a business its own customer list back is holding it hostage, and this
 * is the cheapest possible way not to be that.
 */
export function contactsToCsv(rows: ContactRow[]): string {
  const header = [
    "name",
    "contact",
    "lifecycle",
    "source",
    "channels",
    "open_requests",
    "total_requests",
    "next_appointment_utc",
    "past_appointments",
    "calls",
    "talk_minutes",
    "last_activity_utc",
  ];

  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.displayName ?? "",
        r.primaryHandle ?? "",
        r.status ?? "",
        r.source ?? "",
        r.channels.join(" "),
        r.insight.openRequests,
        r.insight.totalRequests,
        r.insight.nextAppointmentAt ?? "",
        r.insight.pastAppointments,
        r.insight.calls,
        Math.round(r.insight.talkSeconds / 60),
        r.lastSeenAt ?? "",
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\r\n");
}
