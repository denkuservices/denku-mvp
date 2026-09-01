import React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarCheck2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from "lucide-react";
import type { RequestView } from "@/lib/platform/readModel/requests";

/** All days required for a Monday-first month grid, padded to complete weeks. */
export function monthGridDays(year: number, month: number): Date[] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month, 1 - lead));
  const days: Date[] = [];
  for (let index = 0; index < 42; index++) {
    days.push(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + index)));
  }
  const lastWeek = days.slice(35);
  return lastWeek.every((day) => day.getUTCMonth() !== month) ? days.slice(0, 35) : days;
}

/** Stable UTC day key shared by the grid and appointment grouping. */
export function dayKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Appointments keyed by their start day and sorted into chronological order. */
export function groupByDay(items: RequestView[]): Map<string, RequestView[]> {
  const grouped = new Map<string, RequestView[]>();
  for (const item of items) {
    if (!item.occursAt) continue;
    const key = dayKey(item.occursAt);
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  for (const [key, list] of grouped) {
    grouped.set(key, [...list].sort((a, b) => Date.parse(a.occursAt ?? "") - Date.parse(b.occursAt ?? "")));
  }
  return grouped;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function timeLabel(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function agendaDate(iso: string): { weekday: string; day: string; month: string } {
  const date = new Date(iso);
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
    day: date.toLocaleDateString(undefined, { day: "2-digit" }),
    month: date.toLocaleDateString(undefined, { month: "short" }),
  };
}

function isCancelled(item: RequestView): boolean {
  return ["cancelled", "canceled", "no_show"].includes((item.status ?? "").toLowerCase());
}

export default function RequestCalendar({
  year,
  month,
  items,
  hrefForMonth,
}: {
  year: number;
  month: number;
  items: RequestView[];
  hrefForMonth: (year: number, month: number) => string;
}) {
  const days = monthGridDays(year, month);
  const byDay = groupByDay(items);
  const now = new Date();
  const todayKey = dayKey(now);
  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const prev = month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
  const next = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
  const untimed = items.filter((item) => !item.occursAt);
  const monthItems = items.filter((item) => {
    if (!item.occursAt) return false;
    const date = new Date(item.occursAt);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month;
  });
  const agenda = items
    .filter((item) => item.occursAt && Date.parse(item.occursAt) >= now.getTime() && !isCancelled(item))
    .sort((a, b) => Date.parse(a.occursAt ?? "") - Date.parse(b.occursAt ?? ""))
    .slice(0, 8);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-navy-800">
        <div className="relative overflow-hidden border-b border-gray-100 px-4 py-4 dark:border-white/10 md:px-5">
          <div aria-hidden="true" className="absolute inset-y-0 right-0 w-64 bg-[radial-gradient(circle_at_100%_0%,rgba(66,42,251,0.12),transparent_62%)]" />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600 ring-1 ring-inset ring-teal-100 dark:bg-teal-400/10 dark:text-teal-300 dark:ring-teal-400/20">
                  <CalendarCheck2 className="h-4 w-4" />
                </span>
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Calendar</p><h2 className="text-base font-semibold text-navy-700 dark:text-white">{monthLabel}</h2></div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Link href={hrefForMonth(prev.year, prev.month)} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-navy-700 dark:border-white/10 dark:hover:bg-white/5 dark:hover:text-white"><ChevronLeft className="h-4 w-4" /></Link>
              <Link href={hrefForMonth(now.getUTCFullYear(), now.getUTCMonth())} className="rounded-xl border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 hover:text-navy-700 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white">Today</Link>
              <Link href={hrefForMonth(next.year, next.month)} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-navy-700 dark:border-white/10 dark:hover:bg-white/5 dark:hover:text-white"><ChevronRight className="h-4 w-4" /></Link>
            </div>
          </div>
          <div className="relative mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="rounded-lg bg-gray-50 px-2.5 py-1.5 font-medium dark:bg-white/5">{monthItems.length} scheduled</span>
            <span className="rounded-lg bg-teal-50 px-2.5 py-1.5 font-medium text-teal-700 dark:bg-teal-400/10 dark:text-teal-300">{monthItems.filter((item) => !isCancelled(item)).length} active</span>
            {untimed.length ? <span className="rounded-lg bg-amber-50 px-2.5 py-1.5 font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">{untimed.length} needs a time</span> : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/70 dark:border-white/10 dark:bg-white/[0.025]">
              {WEEKDAYS.map((weekday, index) => <div key={weekday} className={`px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] ${index > 4 ? "text-brand-400" : "text-gray-400"}`}>{weekday}</div>)}
            </div>
            <div className="grid grid-cols-7 bg-gray-100 dark:bg-white/10">
              {days.map((day) => {
                const key = dayKey(day);
                const inMonth = day.getUTCMonth() === month;
                const isToday = key === todayKey;
                const dayItems = byDay.get(key) ?? [];
                return (
                  <div key={key} className={`m-px min-h-[118px] p-2 transition ${inMonth ? "bg-white hover:bg-gray-50/70 dark:bg-navy-800 dark:hover:bg-white/[0.035]" : "bg-gray-50/80 dark:bg-navy-900/70"}`}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className={`flex h-7 min-w-7 items-center justify-center rounded-lg px-1 text-xs font-semibold tabular-nums ${isToday ? "bg-brand-500 text-white shadow-sm shadow-brand-500/30" : inMonth ? "text-navy-700 dark:text-gray-200" : "text-gray-300 dark:text-gray-600"}`}>{day.getUTCDate()}</span>
                      {dayItems.length > 0 ? <span className="text-[10px] font-semibold text-gray-400">{dayItems.length}</span> : null}
                    </div>
                    <div className="space-y-1">
                      {dayItems.slice(0, 3).map((item) => (
                        <Link key={item.id} href={item.href} title={`${timeLabel(item.occursAt)} ${item.who ?? item.title}`} className={`group/event block rounded-lg border px-1.5 py-1.5 text-[10px] leading-tight transition ${isCancelled(item) ? "border-gray-200 bg-gray-50 text-gray-400 line-through dark:border-white/10 dark:bg-white/5" : "border-teal-100 bg-teal-50/80 text-teal-800 hover:border-teal-200 hover:bg-teal-100 dark:border-teal-400/15 dark:bg-teal-400/10 dark:text-teal-200 dark:hover:bg-teal-400/20"}`}>
                          <span className="block font-semibold tabular-nums">{timeLabel(item.occursAt)}</span><span className="mt-0.5 block truncate opacity-80">{item.who ?? item.title}</span>
                        </Link>
                      ))}
                      {dayItems.length > 3 ? <p className="px-1.5 pt-0.5 text-[10px] font-medium text-brand-500">+{dayItems.length - 3} more</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <aside className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-navy-800">
        <div className="border-b border-gray-100 bg-gradient-to-br from-navy-700 to-navy-900 px-5 py-4 text-white dark:border-white/10">
          <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">Agenda</p><h2 className="mt-1 text-base font-semibold">Next up</h2></div><CalendarClock className="h-5 w-5 text-teal-300" /></div>
          <p className="mt-2 text-xs leading-5 text-white/60">Your upcoming customer commitments, in order.</p>
        </div>
        {agenda.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-50 text-gray-400 dark:bg-white/5"><CalendarCheck2 className="h-5 w-5" /></span><p className="mt-3 text-sm font-semibold text-navy-700 dark:text-white">Agenda is clear</p><p className="mt-1 text-xs leading-5 text-gray-500">New appointments will appear here as soon as they are booked.</p></div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-white/10">
            {agenda.map((item, index) => {
              const date = agendaDate(item.occursAt!);
              return (
                <Link key={item.id} href={item.href} className="group flex gap-3 px-4 py-3.5 transition hover:bg-brand-50/50 dark:hover:bg-white/[0.035]">
                  <div className={`flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-xl border ${index === 0 ? "border-brand-200 bg-brand-50 text-brand-600 dark:border-brand-400/25 dark:bg-brand-400/10 dark:text-brand-200" : "border-gray-200 bg-gray-50 text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"}`}><span className="text-[9px] font-semibold uppercase">{date.month}</span><span className="text-base font-bold leading-4">{date.day}</span></div>
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400"><span>{date.weekday}</span><span>·</span><Clock3 className="h-3 w-3" /><span>{timeLabel(item.occursAt)}</span></div><p className="mt-1 truncate text-sm font-semibold text-navy-700 dark:text-white">{item.who ?? item.title}</p><p className="mt-0.5 truncate text-xs text-gray-500">{item.body?.trim() || "Appointment"}</p></div>
                  <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-gray-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-500" />
                </Link>
              );
            })}
          </div>
        )}
        {untimed.length ? <div className="border-t border-amber-100 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-700 dark:border-amber-400/15 dark:bg-amber-400/10 dark:text-amber-300"><strong>{untimed.length} appointment{untimed.length === 1 ? "" : "s"}</strong> need a confirmed date before they can appear in the agenda.</div> : null}
      </aside>
    </div>
  );
}
