import { describe, it, expect } from "vitest";

import {
  AFTER_HOURS_BEHAVIOURS,
  BusinessHoursSchema,
  DAY_NAMES,
  defaultBusinessHours,
  describeBusinessHours,
  evaluateBusinessHours,
  buildHoursPromptBlock,
  parseBusinessHours,
  type BusinessHours,
} from "@/lib/business-hours/schema";

/**
 * The business-hours engine.
 *
 * This module decides whether a real business's phone is treated as open, so the cases that matter
 * are the ones that are easy to get wrong and impossible to notice: the shift that crosses
 * midnight, the public holiday that has to beat the weekly pattern, the DST changeover where a
 * fixed UTC offset would be an hour out for half the year, and — most important of all — the
 * workspace with no hours set, which must stay open.
 */

/** Mon–Fri 09:00–17:00, weekends closed. */
function weekdays9to5(): BusinessHours {
  return defaultBusinessHours();
}

function at(iso: string): Date {
  return new Date(iso);
}

describe("business hours — the safe default", () => {
  it("treats a workspace with no hours as always open", () => {
    // Every workspace that predates this feature has null here. None of them agreed to have
    // their phone line treated as closed.
    expect(evaluateBusinessHours(null, "America/New_York", at("2026-09-06T04:00:00Z")).open).toBe(true);
  });

  it("treats an unparseable schedule as no schedule, not as closed", () => {
    expect(parseBusinessHours({ days: "nope" })).toBeNull();
    expect(parseBusinessHours(null)).toBeNull();
    expect(evaluateBusinessHours(parseBusinessHours("{}"), "UTC").open).toBe(true);
  });

  it("stays open when the timezone string is not a real zone", () => {
    // A typo in a settings column must not close a business.
    expect(evaluateBusinessHours(weekdays9to5(), "Not/AZone", at("2026-09-06T04:00:00Z")).open).toBe(
      true
    );
  });
});

describe("business hours — the weekly pattern", () => {
  const hours = weekdays9to5();

  it("is open inside the range, in the business's own timezone", () => {
    // 2026-09-03 is a Thursday. 14:00 UTC is 10:00 in New York.
    const verdict = evaluateBusinessHours(hours, "America/New_York", at("2026-09-03T14:00:00Z"));
    expect(verdict.open).toBe(true);
    expect(verdict.reason).toBe("within");
  });

  it("is closed before opening", () => {
    // 12:00 UTC is 08:00 in New York — an hour before the doors open.
    expect(evaluateBusinessHours(hours, "America/New_York", at("2026-09-03T12:00:00Z")).open).toBe(
      false
    );
  });

  it("is closed at exactly the closing time", () => {
    // 21:00 UTC is 17:00 in New York. Closing time means closed: the interval is half-open.
    expect(evaluateBusinessHours(hours, "America/New_York", at("2026-09-03T21:00:00Z")).open).toBe(
      false
    );
  });

  it("is open at exactly the opening time", () => {
    // 13:00 UTC is 09:00 in New York.
    expect(evaluateBusinessHours(hours, "America/New_York", at("2026-09-03T13:00:00Z")).open).toBe(
      true
    );
  });

  it("is closed on a day marked closed", () => {
    // 2026-09-06 is a Sunday.
    const verdict = evaluateBusinessHours(hours, "America/New_York", at("2026-09-06T15:00:00Z"));
    expect(verdict.open).toBe(false);
    expect(verdict.reason).toBe("day_closed");
  });

  it("reads the same wall-clock hours on both sides of a DST change", () => {
    // The whole reason `Intl` is used instead of a stored offset. 14:00 UTC is 10:00 in New York
    // in July (EDT, UTC-4) and 09:00 in January (EST, UTC-5) — both inside 09:00–17:00 — while
    // 13:30 UTC is 09:30 in July (open) and 08:30 in January (closed).
    expect(evaluateBusinessHours(hours, "America/New_York", at("2026-07-02T13:30:00Z")).open).toBe(
      true
    );
    expect(evaluateBusinessHours(hours, "America/New_York", at("2026-01-08T13:30:00Z")).open).toBe(
      false
    );
  });
});

describe("business hours — overnight shifts", () => {
  /** A bar: open 22:00 to 02:00, Thursday through Saturday. */
  function bar(): BusinessHours {
    const base = defaultBusinessHours();
    return {
      ...base,
      days: base.days.map((d) =>
        d.day >= 4 && d.day <= 6
          ? { ...d, closed: false, intervals: [{ open: "22:00", close: "02:00" }] }
          : { ...d, closed: true, intervals: [] }
      ),
    };
  }

  it("is open late on the evening the shift starts", () => {
    // Thursday 2026-09-03, 23:00 UTC.
    expect(evaluateBusinessHours(bar(), "UTC", at("2026-09-03T23:00:00Z")).open).toBe(true);
  });

  it("is still open in the small hours of the following morning", () => {
    // Friday 2026-09-04 at 01:00 — Friday is itself an open day here, but 01:00 is not inside
    // Friday's own 22:00–02:00; it is the spill-over from Thursday.
    expect(evaluateBusinessHours(bar(), "UTC", at("2026-09-04T01:00:00Z")).open).toBe(true);
  });

  it("is closed after the overnight shift ends", () => {
    expect(evaluateBusinessHours(bar(), "UTC", at("2026-09-04T03:00:00Z")).open).toBe(false);
  });

  it("does not spill over from a day that was closed", () => {
    // Monday 01:00: Sunday is closed, so there is nothing to spill over.
    expect(evaluateBusinessHours(bar(), "UTC", at("2026-09-07T01:00:00Z")).open).toBe(false);
  });
});

describe("business hours — exceptions", () => {
  it("a dated closure beats an open weekday", () => {
    const hours: BusinessHours = {
      ...weekdays9to5(),
      exceptions: [{ date: "2026-12-25", closed: true, intervals: [], label: "Christmas Day" }],
    };
    // 2026-12-25 is a Friday — open under the weekly pattern.
    const verdict = evaluateBusinessHours(hours, "UTC", at("2026-12-25T12:00:00Z"));
    expect(verdict.open).toBe(false);
    expect(verdict.reason).toBe("exception_closed");
    expect(verdict.exceptionLabel).toBe("Christmas Day");
  });

  it("a dated opening beats a closed weekend", () => {
    const hours: BusinessHours = {
      ...weekdays9to5(),
      exceptions: [
        { date: "2026-09-05", closed: false, intervals: [{ open: "10:00", close: "14:00" }], label: "Open day" },
      ],
    };
    // 2026-09-05 is a Saturday, normally closed.
    expect(evaluateBusinessHours(hours, "UTC", at("2026-09-05T11:00:00Z")).open).toBe(true);
    expect(evaluateBusinessHours(hours, "UTC", at("2026-09-05T15:00:00Z")).open).toBe(false);
  });
});

describe("business hours — how it reads", () => {
  it("collapses identical consecutive days and starts the week on Monday", () => {
    expect(describeBusinessHours(weekdays9to5())).toBe("Mon–Fri 09:00–17:00, Sat–Sun closed");
  });

  it("names every day of the week in Date.getDay() order", () => {
    // The data is indexed Sunday-first to match `Date.getDay()`; the editor displays it
    // Monday-first. A mismatch here would silently move everyone's Sunday.
    expect(DAY_NAMES[0]).toBe("Sunday");
    expect(DAY_NAMES[6]).toBe("Saturday");
  });

  it("says nothing at all when there are no hours", () => {
    expect(describeBusinessHours(null)).toBe("");
    expect(
      buildHoursPromptBlock({
        hours: null,
        timeZone: "UTC",
        behaviour: "note_hours",
        verdict: { open: true, reason: "no_config" },
      })
    ).toBe("");
  });
});

describe("business hours — the prompt block never gates the AI", () => {
  const hours = weekdays9to5();

  /**
   * The product rule (owner, 2026-09-01): every Denku product answers 24/7. Hours describe when
   * STAFF are in. A prompt that told the assistant to refuse, wind up or end a conversation would
   * sell back the exact thing the customer is paying for, so these assertions are about what the
   * block must NEVER contain as much as what it must.
   */
  const FORBIDDEN = [
    "end the call",
    "do not take a booking",
    "decline",
    "refuse",
    "without collecting",
  ];

  function assertNeverGates(block: string) {
    for (const phrase of FORBIDDEN) {
      expect(block.toLowerCase()).not.toContain(phrase);
    }
  }

  it("states the schedule, the zone, and that the business is closed right now", () => {
    const block = buildHoursPromptBlock({
      hours,
      timeZone: "Europe/Istanbul",
      behaviour: "note_hours",
      verdict: { open: false, reason: "outside" },
    });
    expect(block).toContain("Europe/Istanbul");
    expect(block).toContain("Mon–Fri 09:00–17:00");
    expect(block).toContain("the business is closed");
  });

  it("tells the AI it is available 24/7, whichever behaviour is chosen", () => {
    for (const behaviour of ["note_hours", "answer_normally"] as const) {
      const block = buildHoursPromptBlock({
        hours,
        timeZone: "UTC",
        behaviour,
        verdict: { open: false, reason: "outside" },
      });
      expect(block).toContain("24/7");
      assertNeverGates(block);
    }
  });

  it("keeps helping after mentioning the closure", () => {
    const block = buildHoursPromptBlock({
      hours,
      timeZone: "UTC",
      behaviour: "note_hours",
      verdict: { open: false, reason: "outside" },
    });
    expect(block).toContain("keep going");
    expect(block).toContain("take the booking");
  });

  it("does not let the AI promise a callback time or a person who is not there", () => {
    // The product's standing rule: never claim something that has not happened.
    const block = buildHoursPromptBlock({
      hours,
      timeZone: "UTC",
      behaviour: "note_hours",
      verdict: { open: false, reason: "outside" },
    });
    expect(block).toContain("NOT promise a specific callback time");
  });

  it("stays quiet about hours when the business chose not to raise them", () => {
    const block = buildHoursPromptBlock({
      hours,
      timeZone: "UTC",
      behaviour: "answer_normally",
      verdict: { open: false, reason: "outside" },
    });
    expect(block).toContain("Do not raise this unless the customer asks");
  });

  it("names the holiday when one decided the closure", () => {
    const block = buildHoursPromptBlock({
      hours,
      timeZone: "UTC",
      behaviour: "note_hours",
      verdict: { open: false, reason: "exception_closed", exceptionLabel: "Christmas Day" },
    });
    expect(block).toContain("Christmas Day");
  });

  it("says plainly when the business is open", () => {
    const block = buildHoursPromptBlock({
      hours,
      timeZone: "UTC",
      behaviour: "note_hours",
      verdict: { open: true, reason: "within" },
    });
    expect(block).toContain("the business is open");
    // Not a bare `not.toContain("closed")`: the schedule summary itself legitimately says
    // "Sat–Sun closed". What must be absent is the claim about RIGHT NOW.
    expect(block).not.toContain("the business is closed");
    assertNeverGates(block);
  });

  it("offers no behaviour that would stop the AI answering", () => {
    // `say_closed` used to exist and instructed the assistant to state the hours and end the call.
    // It is gone from the type, the database check constraint, and the UI.
    expect([...AFTER_HOURS_BEHAVIOURS]).toEqual(["note_hours", "answer_normally"]);
  });
});

describe("business hours — the schema refuses nonsense", () => {
  it("requires exactly seven days", () => {
    const six = { days: defaultBusinessHours().days.slice(0, 6), exceptions: [] };
    expect(BusinessHoursSchema.safeParse(six).success).toBe(false);
  });

  it("rejects a time that is not HH:MM", () => {
    const bad = {
      ...defaultBusinessHours(),
      days: defaultBusinessHours().days.map((d) =>
        d.day === 1 ? { ...d, intervals: [{ open: "9am", close: "17:00" }] } : d
      ),
    };
    expect(BusinessHoursSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an interval whose end equals its start", () => {
    const bad = {
      ...defaultBusinessHours(),
      days: defaultBusinessHours().days.map((d) =>
        d.day === 1 ? { ...d, intervals: [{ open: "09:00", close: "09:00" }] } : d
      ),
    };
    expect(BusinessHoursSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts an overnight interval", () => {
    const overnight = {
      ...defaultBusinessHours(),
      days: defaultBusinessHours().days.map((d) =>
        d.day === 5 ? { ...d, closed: false, intervals: [{ open: "22:00", close: "02:00" }] } : d
      ),
    };
    expect(BusinessHoursSchema.safeParse(overnight).success).toBe(true);
  });
});
