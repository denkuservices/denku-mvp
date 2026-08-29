import * as chrono from "chrono-node";

/**
 * Turning what a caller SAID into an instant, in the business's own timezone.
 *
 * **Why this file exists.** `chrono.parseDate(text, { timezone })` accepts a timezone abbreviation
 * ("EDT") or a numeric UTC offset in minutes — and **silently ignores an IANA name** like
 * "America/New_York", falling back to the machine's own zone. Our agents store IANA names, and
 * Vercel's machines run in UTC. So "tomorrow at 5 PM", spoken to a New York business, parsed as
 * 17:00 UTC — 1 PM in the customer's actual afternoon. Nothing errors; the appointment is simply
 * at the wrong hour, which is worse than not booking it at all.
 *
 * The fix is to resolve the IANA zone to the offset that applies **on the day being booked**, not
 * on the day of the call — otherwise every booking across a daylight-saving boundary lands an hour
 * out. That takes two passes, which is why this is a function and not an argument.
 */

/**
 * How far `timeZone` is from UTC, in minutes, at a given instant (EDT → -240).
 *
 * Derived from `Intl` rather than a table, so it stays correct as governments change their rules.
 * Returns null for a zone the runtime does not recognise, which callers treat as "no zone".
 */
export function zoneOffsetMinutes(timeZone: string, at: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(at);

    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24, // Intl can render midnight as "24"
      get("minute"),
      get("second")
    );
    if (Number.isNaN(asUtc)) return null;
    return Math.round((asUtc - at.getTime()) / 60_000);
  } catch {
    return null;
  }
}

/**
 * Turn a wall-clock date-time the model already resolved into an instant.
 *
 * **Why this exists, and why it is preferred over parsing the customer's words.** `chrono` is
 * English-only here. Given "Pazartesi saat 13:00" it silently reads the `13:00`, ignores the
 * weekday it cannot spell, and books **today** — which is how a customer who was told Monday
 * ended up in the owner's calendar on a Saturday, on a channel whose own booking policy says
 * Monday to Friday. The two halves disagreed, which is worse than either being wrong alone.
 *
 * Teaching a parser every language Denku answers in is the wrong shape of fix. The model already
 * knows the business's current local time (it is in the system prompt) and already knows what
 * "Pazartesi", "lunes" or "Donnerstag" mean; asking it for `YYYY-MM-DD HH:mm` costs nothing and
 * works in every language at once. The customer's own words are still recorded, so the owner can
 * always see what was actually asked for.
 *
 * The input is LOCAL to the business — not UTC — because that is the frame the model reasons in.
 * Returns null on anything that is not a well-formed local date-time, so the caller can fall back
 * rather than book a guess.
 */
export function parseLocalDateTime(
  text: string | null | undefined,
  timeZone?: string | null
): Date | null {
  const match = /^\s*(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{1,2}):(\d{2})\s*$/.exec(text ?? "");
  if (!match) return null;

  const [, y, mo, d, h, mi] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  if (Number.isNaN(asUtc)) return null;

  // Reject dates the calendar rolled over (31 February became 3 March).
  const rolled = new Date(asUtc);
  if (rolled.getUTCMonth() !== month - 1 || rolled.getUTCDate() !== day) return null;

  if (!timeZone) return rolled;

  // Same two-pass shape as parseSpokenTime, for the same reason: the offset that matters is the
  // one in force on the day being BOOKED, not today's.
  const firstOffset = zoneOffsetMinutes(timeZone, rolled);
  if (firstOffset === null) return rolled;

  const firstGuess = new Date(asUtc - firstOffset * 60_000);
  const targetOffset = zoneOffsetMinutes(timeZone, firstGuess);
  if (targetOffset === null || targetOffset === firstOffset) return firstGuess;

  return new Date(asUtc - targetOffset * 60_000);
}

/**
 * Parse a spoken time phrase as the business would hear it.
 *
 * `timeZone` is an IANA name (what `agents.timezone` holds); pass null and the phrase resolves in
 * the runtime's own zone, which is the old behaviour and correct only by accident. Returns null
 * when the phrase carries no time at all ("sometime soon", "I'll call back") — the caller must
 * treat that as an open request rather than inventing one.
 */
export function parseSpokenTime(
  text: string | null | undefined,
  timeZone?: string | null,
  reference: Date = new Date()
): Date | null {
  const phrase = (text ?? "").trim();
  if (!phrase) return null;

  try {
    if (!timeZone) {
      const plain = chrono.parseDate(phrase, reference);
      return plain && !Number.isNaN(plain.getTime()) ? plain : null;
    }

    // Pass 1 — the offset on the day of the call, to land on the right calendar day.
    const firstOffset = zoneOffsetMinutes(timeZone, reference);
    if (firstOffset === null) {
      const plain = chrono.parseDate(phrase, reference);
      return plain && !Number.isNaN(plain.getTime()) ? plain : null;
    }
    const first = chrono.parseDate(phrase, { instant: reference, timezone: firstOffset });
    if (!first || Number.isNaN(first.getTime())) return null;

    // Pass 2 — re-resolve using the offset in force on the day being BOOKED. Same result all year
    // except across a daylight-saving change, which is exactly the case worth getting right.
    const targetOffset = zoneOffsetMinutes(timeZone, first);
    if (targetOffset === null || targetOffset === firstOffset) return first;

    const second = chrono.parseDate(phrase, { instant: reference, timezone: targetOffset });
    return second && !Number.isNaN(second.getTime()) ? second : first;
  } catch {
    return null;
  }
}
