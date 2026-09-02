import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import {
  buildContactInsights,
  EMPTY_INSIGHT,
  type ContactInsight,
} from "@/lib/platform/readModel/contactInsights";
import {
  CONTACTS_PAGE_SIZE,
  SEGMENTS,
  SORTS,
  contactsHref,
  contactsToCsv,
  isSegment,
  isSort,
  matchesSearch,
  matchesSegment,
  parseContactsQuery,
  sortRows,
  withInsights,
  type ContactRow,
} from "@/lib/platform/crm/contactRows";

/**
 * The Customers list.
 *
 * The screen was four columns of which one carried information, because the work each customer
 * had generated — requests, calls, appointments — lived in the same database and was never joined
 * onto them. These tests cover the join and the rules built on top of it: which ticket counts as
 * open, which appointment counts as "next", what "needs attention" means, and what a business
 * gets when it exports its own customer list.
 */

const NOW = new Date("2026-09-02T12:00:00.000Z");

function row(over: Partial<ContactRow> = {}): ContactRow {
  return {
    id: "c1",
    displayName: "Ada Lovelace",
    primaryHandle: "+15551234567",
    channels: ["voice"],
    source: "inbound_call",
    status: "new",
    lastSeenAt: "2026-09-01T10:00:00.000Z",
    insight: { ...EMPTY_INSIGHT },
    ...over,
  };
}

function insight(over: Partial<ContactInsight> = {}): ContactInsight {
  return { ...EMPTY_INSIGHT, ...over };
}

describe("insights — joining the work back onto the person", () => {
  it("counts open requests separately from the total", () => {
    const map = buildContactInsights({
      tickets: [
        { lead_id: "c1", status: "open" },
        { lead_id: "c1", status: "open" },
        { lead_id: "c1", status: "closed" },
      ],
      appointments: [],
      calls: [],
      now: NOW,
    });
    expect(map.get("c1")?.openRequests).toBe(2);
    expect(map.get("c1")?.totalRequests).toBe(3);
  });

  it("treats a ticket with no status as open, not as finished", () => {
    // Failing the other way would hide a customer who is waiting.
    const map = buildContactInsights({
      tickets: [{ lead_id: "c1", status: null }],
      appointments: [],
      calls: [],
      now: NOW,
    });
    expect(map.get("c1")?.openRequests).toBe(1);
  });

  it("picks the SOONEST future appointment as next", () => {
    const map = buildContactInsights({
      tickets: [],
      appointments: [
        { lead_id: "c1", status: "scheduled", start_at: "2026-09-20T09:00:00.000Z" },
        { lead_id: "c1", status: "scheduled", start_at: "2026-09-05T09:00:00.000Z" },
      ],
      calls: [],
      now: NOW,
    });
    expect(map.get("c1")?.nextAppointmentAt).toBe("2026-09-05T09:00:00.000Z");
  });

  it("counts a past appointment as history, never as next", () => {
    const map = buildContactInsights({
      tickets: [],
      appointments: [{ lead_id: "c1", status: "scheduled", start_at: "2026-08-01T09:00:00.000Z" }],
      calls: [],
      now: NOW,
    });
    expect(map.get("c1")?.nextAppointmentAt).toBeNull();
    expect(map.get("c1")?.pastAppointments).toBe(1);
  });

  it("does not present an undated request as a booking", () => {
    // The AI creates appointment REQUESTS before a slot is agreed. Showing one as "next" would
    // put a commitment on screen that nobody made.
    const map = buildContactInsights({
      tickets: [],
      appointments: [{ lead_id: "c1", status: "requested", start_at: null }],
      calls: [],
      now: NOW,
    });
    expect(map.get("c1")?.nextAppointmentAt).toBeNull();
    expect(map.get("c1")?.pastAppointments).toBe(0);
  });

  it("ignores a cancelled future appointment", () => {
    const map = buildContactInsights({
      tickets: [],
      appointments: [{ lead_id: "c1", status: "cancelled", start_at: "2026-09-20T09:00:00.000Z" }],
      calls: [],
      now: NOW,
    });
    expect(map.get("c1")?.nextAppointmentAt).toBeNull();
  });

  it("sums talk time and keeps the most recent call", () => {
    const map = buildContactInsights({
      tickets: [],
      appointments: [],
      calls: [
        { lead_id: "c1", created_at: "2026-08-01T10:00:00.000Z", duration_seconds: 120 },
        { lead_id: "c1", created_at: "2026-08-30T10:00:00.000Z", duration_seconds: 90 },
      ],
      now: NOW,
    });
    expect(map.get("c1")?.calls).toBe(2);
    expect(map.get("c1")?.talkSeconds).toBe(210);
    expect(map.get("c1")?.lastCallAt).toBe("2026-08-30T10:00:00.000Z");
  });

  it("drops rows that belong to nobody rather than inventing a contact", () => {
    const map = buildContactInsights({
      tickets: [{ lead_id: null, status: "open" }],
      appointments: [],
      calls: [{ lead_id: null, created_at: "2026-08-01T10:00:00.000Z", duration_seconds: 60 }],
      now: NOW,
    });
    expect(map.size).toBe(0);
  });

  it("gives a contact with no activity the empty insight", () => {
    const rows = withInsights([{ ...row(), insight: undefined } as never], new Map());
    expect(rows[0].insight).toEqual(EMPTY_INSIGHT);
  });
});

describe("segments — the questions the list can answer", () => {
  it("needs attention means an open request", () => {
    expect(matchesSegment(row({ insight: insight({ openRequests: 1 }) }), "attention")).toBe(true);
    expect(matchesSegment(row(), "attention")).toBe(false);
  });

  it("upcoming means an appointment still to come", () => {
    expect(
      matchesSegment(row({ insight: insight({ nextAppointmentAt: "2026-09-20T09:00:00Z" }) }), "upcoming")
    ).toBe(true);
    expect(matchesSegment(row(), "upcoming")).toBe(false);
  });

  it("gone quiet excludes anyone still waiting on you", () => {
    // A customer with an open request is neglected, not dormant. Filing them under silence is how
    // they stay unanswered.
    const stale = "2026-06-01T00:00:00.000Z";
    expect(matchesSegment(row({ lastSeenAt: stale }), "quiet", NOW.getTime())).toBe(true);
    expect(
      matchesSegment(
        row({ lastSeenAt: stale, insight: insight({ openRequests: 1 }) }),
        "quiet",
        NOW.getTime()
      )
    ).toBe(false);
  });

  it("gone quiet needs real silence, not a recent conversation", () => {
    expect(
      matchesSegment(row({ lastSeenAt: "2026-09-01T10:00:00.000Z" }), "quiet", NOW.getTime())
    ).toBe(false);
  });

  it("an unknown segment shows everyone rather than nobody", () => {
    expect(matchesSegment(row(), "nonsense")).toBe(true);
  });

  it("every offered segment is one the code can evaluate", () => {
    for (const segment of SEGMENTS) expect(isSegment(segment.value)).toBe(true);
  });
});

describe("search", () => {
  it("matches on name, handle and source", () => {
    expect(matchesSearch(row(), "ada")).toBe(true);
    expect(matchesSearch(row(), "5551234")).toBe(true);
    expect(matchesSearch(row(), "inbound")).toBe(true);
    expect(matchesSearch(row(), "zebra")).toBe(false);
  });

  it("an empty term matches everyone", () => {
    expect(matchesSearch(row(), "   ")).toBe(true);
  });
});

describe("sorting", () => {
  const quiet = row({ id: "quiet", lastSeenAt: "2026-01-01T00:00:00.000Z" });
  const busy = row({
    id: "busy",
    lastSeenAt: "2026-02-01T00:00:00.000Z",
    insight: insight({ openRequests: 3, calls: 9 }),
  });
  const booked = row({
    id: "booked",
    lastSeenAt: "2026-03-01T00:00:00.000Z",
    insight: insight({ nextAppointmentAt: "2026-09-04T09:00:00.000Z" }),
  });

  it("does not mutate the array it was given", () => {
    const input = [quiet, busy, booked];
    sortRows(input, "name");
    expect(input.map((r) => r.id)).toEqual(["quiet", "busy", "booked"]);
  });

  it("defaults to most recent activity", () => {
    expect(sortRows([quiet, busy, booked], "recent").map((r) => r.id)).toEqual([
      "booked",
      "busy",
      "quiet",
    ]);
  });

  it("puts the most open requests first", () => {
    expect(sortRows([quiet, busy, booked], "attention")[0].id).toBe("busy");
  });

  it("sinks contacts with no appointment when sorting by soonest", () => {
    // Otherwise "no appointment" sorts as 1970 and buries the one booking that exists.
    expect(sortRows([quiet, busy, booked], "upcoming").map((r) => r.id)).toEqual([
      "booked",
      "busy",
      "quiet",
    ]);
  });

  it("breaks ties on recent activity rather than leaving them arbitrary", () => {
    const a = row({ id: "a", lastSeenAt: "2026-01-01T00:00:00.000Z" });
    const b = row({ id: "b", lastSeenAt: "2026-05-01T00:00:00.000Z" });
    expect(sortRows([a, b], "attention").map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("every offered sort is one the code can apply", () => {
    for (const sort of SORTS) expect(isSort(sort.value)).toBe(true);
  });
});

describe("the query in the URL", () => {
  it("keeps only values it understands", () => {
    const q = parseContactsQuery({ segment: "nonsense", sort: "nonsense", page: "-4" });
    expect(q.segment).toBe("");
    expect(q.sort).toBe("recent");
    expect(q.page).toBe(1);
  });

  it("caps a huge search term", () => {
    expect(parseContactsQuery({ q: "x".repeat(500) }).q.length).toBe(120);
  });

  it("resets to the first page whenever a filter changes", () => {
    // Landing on page 4 of a segment that has two pages is how a filter looks broken.
    const current = { q: "", segment: "", sort: "recent", page: 4 };
    expect(contactsHref(current, { segment: "attention", page: 1 })).toBe(
      "/dashboard/crm/contacts?segment=attention"
    );
  });

  it("preserves the search when switching segment", () => {
    const current = { q: "ada", segment: "", sort: "recent", page: 1 };
    expect(contactsHref(current, { segment: "qualified" })).toBe(
      "/dashboard/crm/contacts?q=ada&segment=qualified"
    );
  });

  it("leaves the default sort out of the URL", () => {
    const current = { q: "", segment: "", sort: "recent", page: 1 };
    expect(contactsHref(current, {})).toBe("/dashboard/crm/contacts");
  });

  it("pages 25 at a time", () => {
    expect(CONTACTS_PAGE_SIZE).toBe(25);
  });
});

describe("the CSV a business can take away", () => {
  it("carries the joined work, not just the name", () => {
    const csv = contactsToCsv([
      row({
        insight: insight({
          openRequests: 2,
          totalRequests: 5,
          nextAppointmentAt: "2026-09-05T09:00:00.000Z",
          calls: 3,
          talkSeconds: 360,
        }),
      }),
    ]);
    const [header, first] = csv.split("\r\n");
    expect(header).toContain("open_requests");
    expect(header).toContain("next_appointment_utc");
    expect(first).toContain("Ada Lovelace");
    expect(first).toContain("2,5");
    expect(first).toContain("6"); // 360 seconds → 6 talk minutes
  });

  it("quotes a name containing a comma so the columns do not shift", () => {
    const csv = contactsToCsv([row({ displayName: "Lovelace, Ada" })]);
    expect(csv).toContain('"Lovelace, Ada"');
  });

  it("produces only a header for an empty list", () => {
    expect(contactsToCsv([]).split("\r\n")).toHaveLength(1);
  });
});
