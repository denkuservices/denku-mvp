export function formatUSD(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r}s`;
}

export function toISODate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function fillDateRange(from: Date, to: Date): string[] {
  const dates: string[] = [];
  const current = new Date(from);
  while (current <= to) {
    dates.push(toISODate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Generate week bucket start dates between from and to.
 * Each week starts on Monday (ISO week).
 * Returns array of ISO date strings (YYYY-MM-DD) for the start of each week.
 */
export function fillWeekRange(from: Date, to: Date): string[] {
  const weeks: string[] = [];
  const current = new Date(from);
  
  // Find the Monday of the week containing 'from'
  const dayOfWeek = current.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  current.setUTCDate(current.getUTCDate() + daysToMonday);
  current.setUTCHours(0, 0, 0, 0);
  
  while (current <= to) {
    weeks.push(toISODate(current));
    current.setUTCDate(current.getUTCDate() + 7); // Move to next Monday
  }
  
  return weeks;
}

/**
 * Get the start of the week (Monday) for a given date.
 * Returns ISO date string (YYYY-MM-DD).
 */
export function getWeekStart(date: Date): string {
  const d = new Date(date);
  const dayOfWeek = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + daysToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return toISODate(d);
}

/**
 * Format date for display in trend table.
 * - Day bucket: "Jan 06"
 * - Week bucket: "Week of Jan 06"
 */
export function formatTrendDate(dateStr: string, bucket: "day" | "week"): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const day = String(d.getUTCDate()).padStart(2, "0");
  
  if (bucket === "week") {
    return `Week of ${month} ${day}`;
  }
  return `${month} ${day}`;
}

