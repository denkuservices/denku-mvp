import React from "react";
import { CalendarCheck, LifeBuoy } from "lucide-react";
import type { RequestType } from "@/lib/platform/readModel/requests";

/**
 * The type badge for a request — the one place the two artifact types are given a colour.
 *
 * Requests used to render both types in the same grey square with a nearly identical outline
 * icon, so a mixed list was a wall of identical tiles and the only way to tell a booking from a
 * question was to read the row. Type is the most important thing about a request and the fastest
 * thing colour can carry, so it carries it:
 *
 *   - **Appointment — teal.** Something is committed to happen at a time. It reads as settled.
 *   - **Request — amber.** Someone asked something and is waiting. It reads as outstanding.
 *
 * The icons changed too, and for the same reason: a calendar with a tick says "booked" where a
 * bare calendar only says "date", and a life-ring says "someone needs help" where a support
 * ticket stub says "admin". Neither colour is red or green — those belong to status (open,
 * closed, cancelled), and a type badge competing with a status pill for the same meaning is how
 * a list stops being readable at a glance.
 */

const STYLES: Record<RequestType, { wrap: string; icon: string; Icon: React.ComponentType<{ className?: string }> }> = {
  appointment: {
    wrap: "bg-teal-50 ring-1 ring-inset ring-teal-100 dark:bg-teal-500/10 dark:ring-teal-500/20",
    icon: "text-teal-600 dark:text-teal-300",
    Icon: CalendarCheck,
  },
  ticket: {
    wrap: "bg-amber-50 ring-1 ring-inset ring-amber-100 dark:bg-amber-500/10 dark:ring-amber-500/20",
    icon: "text-amber-600 dark:text-amber-300",
    Icon: LifeBuoy,
  },
};

export default function RequestIcon({
  type,
  size = "md",
}: {
  type: RequestType;
  /** `lg` for a detail page header, `md` for a list row. */
  size?: "md" | "lg";
}) {
  const style = STYLES[type];
  const box = size === "lg" ? "h-11 w-11 rounded-xl" : "h-9 w-9 rounded-lg";
  const glyph = size === "lg" ? "h-5 w-5" : "h-4 w-4";

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center ${box} ${style.wrap}`}
    >
      <style.Icon className={`${glyph} ${style.icon}`} />
    </span>
  );
}

/** The customer-facing word for a request type. One definition, used by every surface. */
export function requestTypeLabel(type: RequestType): string {
  return type === "appointment" ? "Appointment" : "Request";
}
