import "server-only";

/**
 * Normalize status value to canonical form
 * - resolved -> closed (legacy)
 * - open, in_progress, closed -> as-is
 * - anything else -> "other"
 */
export function normalizeStatus(value: string | null | undefined): "open" | "in_progress" | "closed" | "other" {
  if (!value) return "other";
  const normalized = value.trim().toLowerCase();
  if (normalized === "resolved") return "closed";
  if (normalized === "open") return "open";
  if (normalized === "in_progress" || normalized === "in-progress") return "in_progress";
  if (normalized === "closed") return "closed";
  return "other";
}

/**
 * Get SLA threshold in seconds by priority
 */
export function priorityToSlaSeconds(priority: string | null | undefined): number {
  if (!priority) return 24 * 60 * 60; // Default to low priority (24h)
  const normalized = priority.trim().toLowerCase();
  switch (normalized) {
    case "urgent":
      return 15 * 60; // 15 minutes
    case "high":
      return 60 * 60; // 1 hour
    case "medium":
      return 4 * 60 * 60; // 4 hours
    case "low":
      return 24 * 60 * 60; // 24 hours
    default:
      return 24 * 60 * 60; // Default to low priority
  }
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Get date range from analytics range
 * Returns UTC dates for deterministic filtering
 */
export function getTicketsDateRange(range: "24h" | "7d" | "30d" | "90d"): { from: Date; to: Date } {
  const to = new Date(); // Current time in UTC
  let from: Date;

  if (range === "24h") {
    from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  } else if (range === "7d") {
    from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === "30d") {
    from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (range === "90d") {
    from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
  } else {
    // Default to 7d
    from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  return { from, to };
}

/**
 * Calculate percentile from sorted array
 */
export function calculatePercentile(sortedValues: number[], percentile: number): number | null {
  if (sortedValues.length === 0) return null;
  if (percentile < 0 || percentile > 1) return null;
  const index = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower] ?? null;
  const weight = index - lower;
  const lowerValue = sortedValues[lower] ?? 0;
  const upperValue = sortedValues[upper] ?? 0;
  return lowerValue + (upperValue - lowerValue) * weight;
}

