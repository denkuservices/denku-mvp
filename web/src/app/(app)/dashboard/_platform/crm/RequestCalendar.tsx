import React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { RequestView } from "@/lib/platform/readModel/requests";

/**
 * A month of appointments.
 *
 * **Why a calendar and not a better list.** An appointment is the one artifact whose important
 * property is a position in the future. A reverse-chronological list answers "what came in most
 * recently", which is the wrong question about a booking: the owner wants to know what Tuesday
 * looks like, and whether anything clashes. That is a shape a list cannot show and a grid shows
 * without being read.
 *
 * Rendered on the server, entirely from links. There is no state to hold — the month is in the
 * URL — so this stays a server component, works without JavaScript, and its months are
 * shareable and back-button-able. A client calendar would have bought nothing here.
 *
 * Deliberately **month-only**. A week or day view is a real thing to want, but only once
 * appointments carry durations people schedule around; today many are booked with a start and no
 * end, and a day grid drawn from mostly-missing end times would invent precision.
 */

/** All the days a month grid must render: the month, padded to whole Monday-start weeks. Pure. */
export function monthGridDays(year: number, month: number): Date[] {
  const first = new Date(Date.UTC(year, month, 1));
  // getUTCDay is Sunday-indexed; the grid starts on Monday, which most of the world reads first.
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month, 1 - lead));

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i)));
  }

  /*
   * Six rows are drawn only when the month needs them.
   *
   * A fixed 6×7 grid keeps the page from jumping between months, but it also renders a whole
   * trailing week of greyed-out next-month days for most months — a row of noise under the last
   * real day. Trimmed only when that final week is entirely outside the month.
   */
  const lastWeek = days.slice(35);
  if (lastWeek.every((d) => d.getUTCMonth() !== month)) return days.slice(0, 35);
  return days;
}

/** `YYYY-MM-DD` in UTC — the key both sides of the grouping agree on. Pure. */
export function dayKey(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

/** Appointments keyed by the day they start on. Pure. */
export function groupByDay(items: RequestView[]): Map<string, RequestView[]> {
  const map = new Map<string, RequestView[]>();
  for (const item of items) {
    if (!item.occursAt) continue;
    const key = dayKey(item.occursAt);
    if (!key) continue;
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  // Within a day, earliest first — a day column is read top to bottom as a running order.
  for (const [key, list] of map) {
    map.set(
      key,
      [...list].sort((a, b) => Date.parse(a.occursAt ?? "") - Date.parse(b.occursAt ?? ""))
    );
  }
  return map;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function timeLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function RequestCalendar({
  year,
  month,
  items,
  hrefForMonth,
}: {
  year: number;
  /** 0-indexed, like `Date`. */
  month: number;
  items: RequestView[];
  hrefForMonth: (year: number, month: number) => string;
}) {
  const days = monthGridDays(year, month);
  const byDay = groupByDay(items);
  const todayKey = dayKey(new Date());

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const prev = month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 };
  const next = month === 11 ? { y: year + 1, m: 0 } : { y: year, m: month + 1 };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-navy-700 dark:text-white">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <Link
            href={hrefForMonth(prev.y, prev.m)}
            aria-label="Previous month"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Link
            href={hrefForMonth(new Date().getUTCFullYear(), new Date().getUTCMonth())}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Today
          </Link>
          <Link
            href={hrefForMonth(next.y, next.m)}
            aria-label="Next month"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* The grid scrolls inside itself rather than pushing the page sideways on a phone. */}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 gap-px rounded-t-xl bg-gray-200 dark:bg-white/10">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="bg-gray-50 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-navy-900 dark:text-gray-400"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px rounded-b-xl bg-gray-200 dark:bg-white/10">
            {days.map((day) => {
              const key = dayKey(day);
              const inMonth = day.getUTCMonth() === month;
              const isToday = key === todayKey;
              const dayItems = byDay.get(key) ?? [];

              return (
                <div
                  key={key}
                  className={`min-h-[104px] p-1.5 ${
                    inMonth
                      ? "bg-white dark:bg-navy-800"
                      : "bg-gray-50/70 dark:bg-navy-900/60"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums ${
                        isToday
                          ? "bg-brand-500 font-semibold text-white"
                          : inMonth
                            ? "text-gray-600 dark:text-gray-300"
                            : "text-gray-300 dark:text-gray-600"
                      }`}
                    >
                      {day.getUTCDate()}
                    </span>
                    {dayItems.length > 2 ? (
                      <span className="text-[10px] font-medium text-gray-400">
                        {dayItems.length}
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    {dayItems.slice(0, 3).map((item) => {
                      const cancelled = ["cancelled", "canceled", "no_show"].includes(
                        (item.status ?? "").toLowerCase()
                      );
                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          title={`${timeLabel(item.occursAt)} ${item.who ?? item.title}`}
                          className={`block truncate rounded-md px-1.5 py-1 text-[11px] leading-tight transition ${
                            cancelled
                              ? // A cancelled booking still occupied the slot, so it stays visible
                                // — struck through, not deleted, because "it was cancelled" is
                                // information and an empty square is not.
                                "bg-gray-100 text-gray-400 line-through dark:bg-white/5 dark:text-gray-500"
                              : "bg-teal-50 text-teal-800 hover:bg-teal-100 dark:bg-teal-500/15 dark:text-teal-200 dark:hover:bg-teal-500/25"
                          }`}
                        >
                          <span className="font-medium tabular-nums">{timeLabel(item.occursAt)}</span>{" "}
                          {item.who ?? item.title}
                        </Link>
                      );
                    })}
                    {dayItems.length > 3 ? (
                      <p className="px-1.5 text-[10px] text-gray-400">
                        +{dayItems.length - 3} more
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/*
        Bookings with no start time exist and must not silently vanish from a calendar.

        The AI can create an appointment from a call where the caller said "sometime next week",
        and a grid has nowhere to draw that. Hiding them would make the calendar quietly
        incomplete — the one thing a calendar must never be.
      */}
      {items.some((i) => !i.occursAt) ? (
        <p className="mt-3 text-xs text-gray-500">
          {items.filter((i) => !i.occursAt).length} appointment
          {items.filter((i) => !i.occursAt).length === 1 ? " has" : "s have"} no time recorded yet
          and can&apos;t be placed on the calendar — they&apos;re in the list view.
        </p>
      ) : null}
    </div>
  );
}
