import { describe, it, expect } from "vitest";

import { parseLocalDateTime, parseSpokenTime } from "@/lib/time/spokenTime";

/**
 * THE BUG THIS FILE EXISTS FOR.
 *
 * A Turkish customer asked for "Pazartesi saat 13:00" — Monday 13:00. The reply told them Monday.
 * The owner's calendar got **Saturday**, the day the mail arrived, on a business whose own booking
 * policy is Monday to Friday. Nothing errored.
 *
 * The cause was that `chrono` is English-only: it reads the `13:00`, silently ignores the weekday
 * it cannot spell, and falls back to today. Every non-English booking was landing on the wrong day
 * on every channel that answers in the customer's own language.
 *
 * The fix is not a parser per language — it is to let the model, which already knows both the
 * business's current local time and what "Pazartesi" means, hand over a resolved date.
 */

const NY = "America/New_York";
// A Saturday. The day the real booking went wrong.
const SATURDAY = new Date("2026-08-29T09:53:00Z");

describe("the regression: chrono cannot read a non-English weekday", () => {
  it("proves the old path books TODAY for a Turkish weekday", () => {
    const parsed = parseSpokenTime("Pazartesi saat 13:00", NY, SATURDAY);
    // Saturday, not Monday — this is the bug, pinned so it cannot come back unnoticed.
    expect(parsed?.toISOString()).toBe("2026-08-29T17:00:00.000Z");
  });

  it("and gets the same phrase right in English, which is why it went unnoticed", () => {
    const parsed = parseSpokenTime("Monday at 1 PM", NY, SATURDAY);
    expect(parsed?.toISOString()).toBe("2026-08-31T17:00:00.000Z");
  });

  it("books the right day once the model resolves the date itself", () => {
    const parsed = parseLocalDateTime("2026-08-31 13:00", NY);
    expect(parsed?.toISOString()).toBe("2026-08-31T17:00:00.000Z");
  });
});

describe("parseLocalDateTime", () => {
  it("reads a local wall-clock time as that business's local time", () => {
    // 13:00 in New York during EDT is 17:00 UTC.
    expect(parseLocalDateTime("2026-08-31 13:00", NY)?.toISOString()).toBe("2026-08-31T17:00:00.000Z");
  });

  it("accepts the ISO 'T' separator and a single-digit hour", () => {
    expect(parseLocalDateTime("2026-08-31T09:30", NY)?.toISOString()).toBe("2026-08-31T13:30:00.000Z");
    expect(parseLocalDateTime("2026-08-31 9:30", NY)?.toISOString()).toBe("2026-08-31T13:30:00.000Z");
  });

  it("uses the offset in force on the day BOOKED, not today", () => {
    // 2026-11-05 is after the US clocks go back: EST (-300), not EDT (-240). A booking made in
    // summer for a winter date must not land an hour out.
    expect(parseLocalDateTime("2026-11-05 13:00", NY)?.toISOString()).toBe("2026-11-05T18:00:00.000Z");
  });

  it("handles a zone with no daylight saving", () => {
    expect(parseLocalDateTime("2026-08-31 13:00", "Europe/Istanbul")?.toISOString()).toBe(
      "2026-08-31T10:00:00.000Z"
    );
  });

  it("treats a missing timezone as UTC rather than the server's accidental zone", () => {
    expect(parseLocalDateTime("2026-08-31 13:00", null)?.toISOString()).toBe("2026-08-31T13:00:00.000Z");
  });

  it("returns null for anything that is not a well-formed local date-time", () => {
    // The caller falls back to the spoken phrase rather than booking a guess.
    expect(parseLocalDateTime("Pazartesi saat 13:00", NY)).toBeNull();
    expect(parseLocalDateTime("next monday", NY)).toBeNull();
    expect(parseLocalDateTime("2026-08-31", NY)).toBeNull();
    expect(parseLocalDateTime("", NY)).toBeNull();
    expect(parseLocalDateTime(null, NY)).toBeNull();
    expect(parseLocalDateTime("31-08-2026 13:00", NY)).toBeNull();
  });

  it("rejects an out-of-range date instead of letting the calendar roll it over", () => {
    // 31 February would otherwise silently become 3 March — an appointment on a day nobody named.
    expect(parseLocalDateTime("2026-02-31 13:00", NY)).toBeNull();
    expect(parseLocalDateTime("2026-13-01 13:00", NY)).toBeNull();
    expect(parseLocalDateTime("2026-08-31 25:00", NY)).toBeNull();
  });
});
