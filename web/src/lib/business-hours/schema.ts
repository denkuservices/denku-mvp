import { z } from "zod";

/**
 * Business hours, as a thing the product can act on.
 *
 * **Hours are something the AI KNOWS, never a gate on whether it answers.** That is the product
 * decision (owner, 2026-09-01) and it is the whole reason this module reads the way it does: every
 * Denku product works 24/7. A business that pays for an AI employee is buying the eleven-at-night
 * call its competitors miss, and a schedule that made the AI hang up would be selling that back.
 *
 * So what are hours FOR? Expectation-setting and correct answers. "When are you open?" has a right
 * answer. "Can someone look at it today?" at 11pm has an honest one. The AI still books, still
 * takes every detail, still creates the ticket — it just does not imply a human is standing there.
 *
 * Before this existed, "opening hours" was one free-text line inside the AI Employee prompt, so the
 * AI could *say* "we're open until six" with nothing behind it; the Vapi webhook's
 * `isOutsideBusinessHours` was a stub returning "inside hours" for every call ever taken; and
 * Settings told the customer their timezone was set so "the AI talks about your hours", which was
 * true and useless.
 *
 * This module is **pure** — no Supabase, no `next/headers`, no clock beyond the instant it is
 * handed. That is what makes the interesting cases testable: the Sunday that is a public holiday,
 * the shift that runs 22:00–02:00, the call that arrives during the lunch break, and the DST
 * changeover where "09:00 local" is not a fixed offset from UTC.
 */

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const IntervalSchema = z
  .object({
    open: z.string().regex(TIME, "Use HH:MM"),
    close: z.string().regex(TIME, "Use HH:MM"),
  })
  .refine((i) => i.open !== i.close, { message: "Opening and closing times must differ" });

export const DaySchema = z.object({
  /** 0 = Sunday … 6 = Saturday, matching `Date.getDay()`. */
  day: z.number().int().min(0).max(6),
  closed: z.boolean(),
  intervals: z.array(IntervalSchema).max(4),
});

export const ExceptionSchema = z.object({
  date: z.string().regex(DATE, "Use YYYY-MM-DD"),
  closed: z.boolean(),
  intervals: z.array(IntervalSchema).max(4).default([]),
  label: z.string().trim().max(80).optional(),
});

export const BusinessHoursSchema = z.object({
  days: z.array(DaySchema).length(7),
  exceptions: z.array(ExceptionSchema).max(60).default([]),
});

export type Interval = z.infer<typeof IntervalSchema>;
export type DayHours = z.infer<typeof DaySchema>;
export type HoursException = z.infer<typeof ExceptionSchema>;
export type BusinessHours = z.infer<typeof BusinessHoursSchema>;

/**
 * What the AI does about the hours when a customer arrives outside them.
 *
 * Both options answer. There is deliberately no "say we're closed and end the call" — an option
 * that stops the AI working would contradict the product it belongs to, so it is not offered, not
 * stored, and not expressible in the prompt.
 */
export const AFTER_HOURS_BEHAVIOURS = ["note_hours", "answer_normally"] as const;
export type AfterHoursBehaviour = (typeof AFTER_HOURS_BEHAVIOURS)[number];

export const AFTER_HOURS_LABEL: Record<AfterHoursBehaviour, string> = {
  note_hours: "Mention that you're closed",
  answer_normally: "Don't bring it up",
};

export const AFTER_HOURS_HINT: Record<AfterHoursBehaviour, string> = {
  note_hours:
    "The AI still answers, books and takes every detail — it just says the business is closed right now and when someone will follow up, so nobody waits by the phone.",
  answer_normally:
    "The AI never raises your hours unless the customer asks. Choose this if nothing should signal a difference between day and night.",
};

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Mon–Fri 09:00–17:00. The starting point the editor offers, not something written on anyone's behalf. */
export function defaultBusinessHours(): BusinessHours {
  return {
    days: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      closed: day === 0 || day === 6,
      intervals: day === 0 || day === 6 ? [] : [{ open: "09:00", close: "17:00" }],
    })),
    exceptions: [],
  };
}

/**
 * Parse whatever is in the column. Returns null for absent OR malformed data, and the caller then
 * treats the workspace as having no hours — which means "always open", the behaviour every
 * existing workspace has today. A half-understood schedule must never be enforced against a real
 * caller.
 */
export function parseBusinessHours(value: unknown): BusinessHours | null {
  if (!value || typeof value !== "object") return null;
  const parsed = BusinessHoursSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/* ------------------------------------------------------------------ evaluation */

/**
 * The wall-clock day-of-week, hour and minute at an instant, in a named IANA timezone.
 *
 * Done with `Intl.DateTimeFormat` rather than by adding a stored UTC offset, because an offset is
 * wrong twice a year: a business open "09:00–17:00" is open 09:00–17:00 in March and in July, and
 * the number of hours between that and UTC is not the same in both.
 */
function wallClock(at: Date, timeZone: string): { day: number; minutes: number; date: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = fmt.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const weekdayIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  // `hour12: false` can render midnight as "24" in some engines; normalise it.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));

  return {
    day: weekdayIndex[get("weekday")] ?? 0,
    minutes: hour * 60 + minute,
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Does this interval contain that many minutes past midnight?
 *
 * Handles the overnight case (`22:00`–`02:00`) by treating close < open as "runs past midnight".
 * A bar open until 2am is not an edge case; it is a whole category of Denku's customers.
 */
function intervalContains(interval: Interval, minutes: number): boolean {
  const open = toMinutes(interval.open);
  const close = toMinutes(interval.close);
  if (close > open) return minutes >= open && minutes < close;
  // Overnight: [open, midnight) ∪ [midnight, close)
  return minutes >= open || minutes < close;
}

export type HoursVerdict = {
  open: boolean;
  /** Why — for logs and for the prompt, never for the caller verbatim. */
  reason: "no_config" | "exception_closed" | "exception_open" | "day_closed" | "within" | "outside";
  /** The exception that decided it, when one did. */
  exceptionLabel?: string;
};

/**
 * Is the business open at this instant?
 *
 * Order matters: a dated exception beats the weekly pattern, always. That is the whole point of
 * exceptions — "we are closed on the 25th" has to win over "we are open on Thursdays".
 *
 * **No config means open.** Every workspace that exists today has no hours set, and the day this
 * shipped none of them expected their phone to stop being answered.
 */
export function evaluateBusinessHours(
  hours: BusinessHours | null,
  timeZone: string | null,
  at: Date = new Date()
): HoursVerdict {
  if (!hours) return { open: true, reason: "no_config" };

  let clock;
  try {
    clock = wallClock(at, timeZone || "UTC");
  } catch {
    // An unknown timezone string must not close a business's phone line.
    return { open: true, reason: "no_config" };
  }

  const exception = hours.exceptions.find((e) => e.date === clock.date);
  if (exception) {
    if (exception.closed) {
      return { open: false, reason: "exception_closed", exceptionLabel: exception.label };
    }
    const openNow = exception.intervals.some((i) => intervalContains(i, clock.minutes));
    return {
      open: openNow,
      reason: openNow ? "exception_open" : "outside",
      exceptionLabel: exception.label,
    };
  }

  const today = hours.days.find((d) => d.day === clock.day);
  if (!today || today.closed) return { open: false, reason: "day_closed" };

  // An overnight shift that began yesterday still covers the small hours of today.
  const yesterday = hours.days.find((d) => d.day === (clock.day + 6) % 7);
  const spillover =
    yesterday && !yesterday.closed
      ? yesterday.intervals.some(
          (i) => toMinutes(i.close) <= toMinutes(i.open) && clock.minutes < toMinutes(i.close)
        )
      : false;

  const openNow = today.intervals.some((i) => intervalContains(i, clock.minutes)) || spillover;
  return { open: openNow, reason: openNow ? "within" : "outside" };
}

/* ------------------------------------------------------------------ rendering */

function formatInterval(i: Interval): string {
  return `${i.open}–${i.close}`;
}

/**
 * The schedule as a sentence the AI can read out.
 *
 * Consecutive days with identical hours are collapsed ("Mon–Fri 09:00–17:00") because that is how
 * a person says it, and an assistant reading seven separate lines aloud sounds like a machine
 * reading a table — which is exactly what it would be doing.
 */
export function describeBusinessHours(hours: BusinessHours | null): string {
  if (!hours) return "";

  const short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // Start the week on Monday: it is how opening hours are written nearly everywhere.
  const order = [1, 2, 3, 4, 5, 6, 0];

  const signature = (d: DayHours | undefined) =>
    !d || d.closed ? "closed" : d.intervals.map(formatInterval).join(", ") || "closed";

  const groups: Array<{ from: number; to: number; sig: string }> = [];
  for (const day of order) {
    const sig = signature(hours.days.find((d) => d.day === day));
    const last = groups[groups.length - 1];
    if (last && last.sig === sig) last.to = day;
    else groups.push({ from: day, to: day, sig });
  }

  const parts = groups.map((g) => {
    const label = g.from === g.to ? short[g.from] : `${short[g.from]}–${short[g.to]}`;
    return g.sig === "closed" ? `${label} closed` : `${label} ${g.sig}`;
  });

  return parts.join(", ");
}

/**
 * The block injected into the assistant's system prompt.
 *
 * Note what is NOT here: any instruction to refuse, wind up, or end a conversation. Hours never gate
 * the AI — it answers at three in the morning exactly as it does at three in the afternoon. What the
 * hours change is what it is honest about: whether a person is around, and when one will be.
 *
 * The timezone is stated because "we close at six" from an assistant that does not know which six is
 * a promise it cannot keep.
 */
export function buildHoursPromptBlock(input: {
  hours: BusinessHours | null;
  timeZone: string | null;
  behaviour: AfterHoursBehaviour;
  verdict: HoursVerdict;
}): string {
  const { hours, timeZone, behaviour, verdict } = input;
  if (!hours) return "";

  const lines = [
    `Opening hours (${timeZone || "UTC"}): ${describeBusinessHours(hours)}.`,
    "You are available 24/7 and always help, whatever the hour. These hours describe when STAFF are in, not when you work.",
  ];

  if (verdict.open) {
    lines.push("Right now the business is open.");
  } else {
    lines.push(
      `Right now the business is closed${verdict.exceptionLabel ? ` (${verdict.exceptionLabel})` : ""}.`
    );

    if (behaviour === "note_hours") {
      lines.push(
        "Say so briefly, and keep going: answer the question, take the booking, collect what you need. Be honest that a person will follow up when the business next opens, and do NOT promise a specific callback time or that anyone is available right now."
      );
    } else {
      lines.push(
        "Do not raise this unless the customer asks. If they do ask, or if they want something only a person can do, tell them the opening hours plainly rather than implying someone is there now."
      );
    }
  }

  return `${lines.join(" ")}\n\n`;
}
