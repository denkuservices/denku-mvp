import { describe, it, expect } from "vitest";
import {
  dayKey,
  groupByDay,
  monthGridDays,
} from "@/app/(app)/dashboard/_platform/crm/RequestCalendar";
import type { RequestView } from "@/lib/platform/readModel/requests";

/**
 * The appointments calendar's grid maths.
 *
 * Everything about the calendar that can be wrong without being obviously wrong lives in these
 * three functions: a month that starts on the wrong weekday, a booking that lands on the wrong
 * square, a trailing week of empty cells. All are pure, so all are checked here rather than by
 * squinting at a rendered grid.
 */

function appointment(id: string, occursAt: string | null): RequestView {
  return {
    id,
    type: "appointment",
    title: "Appointment",
    body: null,
    status: "scheduled",
    priority: null,
    occursAt,
    createdAt: "2026-09-01T00:00:00.000Z",
    callId: null,
    contactId: null,
    who: null,
    href: `/dashboard/crm/appointments/${id}`,
  };
}

describe("monthGridDays", () => {
  it("starts the grid on the Monday on or before the 1st", () => {
    // 1 September 2026 is a Tuesday, so the grid opens on Monday 31 August.
    const days = monthGridDays(2026, 8);
    expect(days[0].getUTCDay()).toBe(1);
    expect(dayKey(days[0])).toBe("2026-08-31");
  });

  it("opens on the 1st itself when the month already starts on a Monday", () => {
    // 1 June 2026 is a Monday — no leading days from May.
    const days = monthGridDays(2026, 5);
    expect(dayKey(days[0])).toBe("2026-06-01");
  });

  it("always renders whole weeks", () => {
    for (let month = 0; month < 12; month++) {
      expect(monthGridDays(2026, month).length % 7).toBe(0);
    }
  });

  it("drops the sixth row when it would be entirely next month", () => {
    // September 2026 fits in five rows; a fixed 42-cell grid would add a dead week.
    expect(monthGridDays(2026, 8)).toHaveLength(35);
  });

  it("keeps six rows when the month genuinely needs them", () => {
    // August 2026 starts on a Saturday and has 31 days — it cannot fit in five weeks.
    expect(monthGridDays(2026, 7)).toHaveLength(42);
  });

  it("contains every day of the month exactly once", () => {
    const days = monthGridDays(2026, 1); // February
    const inMonth = days.filter((d) => d.getUTCMonth() === 1);
    expect(inMonth).toHaveLength(28);
    expect(new Set(inMonth.map(dayKey)).size).toBe(28);
  });

  it("rolls over a year boundary without losing December or January", () => {
    const december = monthGridDays(2026, 11);
    expect(december.some((d) => dayKey(d) === "2026-12-31")).toBe(true);
    const january = monthGridDays(2027, 0);
    expect(january.some((d) => dayKey(d) === "2027-01-01")).toBe(true);
  });
});

describe("groupByDay", () => {
  it("buckets appointments by their start day", () => {
    const grouped = groupByDay([
      appointment("a", "2026-09-03T09:00:00.000Z"),
      appointment("b", "2026-09-03T14:30:00.000Z"),
      appointment("c", "2026-09-04T09:00:00.000Z"),
    ]);

    expect(grouped.get("2026-09-03")?.map((r) => r.id)).toEqual(["a", "b"]);
    expect(grouped.get("2026-09-04")?.map((r) => r.id)).toEqual(["c"]);
  });

  it("orders a day earliest-first, whatever order it was given them in", () => {
    const grouped = groupByDay([
      appointment("late", "2026-09-03T17:00:00.000Z"),
      appointment("early", "2026-09-03T08:00:00.000Z"),
    ]);
    expect(grouped.get("2026-09-03")?.map((r) => r.id)).toEqual(["early", "late"]);
  });

  it("skips bookings with no time rather than inventing a day for them", () => {
    // These are real — the AI can book "sometime next week" — and the calendar says so in words
    // instead of dropping them on an arbitrary square.
    const grouped = groupByDay([appointment("no-time", null)]);
    expect(grouped.size).toBe(0);
  });

  it("ignores an unparseable timestamp instead of throwing", () => {
    const grouped = groupByDay([appointment("broken", "not-a-date")]);
    expect(grouped.size).toBe(0);
  });
});
