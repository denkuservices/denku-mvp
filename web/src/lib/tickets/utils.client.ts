/**
 * Client-safe utility functions for tickets.
 * These are pure functions with no server-only dependencies.
 * Safe to import in Client Components.
 */

/**
 * Format date in organization timezone (synchronous version - requires timezone as param)
 */
export function formatDateInTZ(date: string | null | undefined, timezone: string): string {
  if (!date) return "—";

  try {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "—";

    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return new Date(date).toLocaleString();
  }
}

/**
 * Format relative time (e.g., "5m ago", "2h ago")
 */
export function formatTimeAgo(iso?: string | null): string {
  if (!iso) return "recent";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "recent";

  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

/**
 * Check if status is a default value
 * Note: "resolved" is treated as "closed" for compatibility
 */
export function isDefaultStatus(status: string): boolean {
  const defaults = ["open", "in_progress", "closed"];
  const normalized = status.toLowerCase();
  // Treat "resolved" as "closed" for compatibility
  if (normalized === "resolved") return true;
  return defaults.includes(normalized);
}

/**
 * Check if priority is a default value
 */
export function isDefaultPriority(priority: string): boolean {
  const defaults = ["low", "medium", "high", "urgent"];
  return defaults.includes(priority.toLowerCase());
}

/**
 * Safe title case helper - never crashes on undefined/null/empty
 * NEVER uses unsafe indexing like [0] without checking length
 */
function safeTitleCase(input: unknown): string {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return "—";
  // Use charAt(0) which is safe (returns "" if index out of bounds)
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Get status label (handles custom values, normalizes labels)
 * Safe: handles null/undefined/empty strings, never crashes
 * IMPORTANT: "resolved" is mapped to "Closed" for display
 * Only three statuses: open, in_progress, closed
 */
export function getStatusLabel(status: string | null | undefined): string {
  // Normalize safely
  const raw = (status ?? "").toString().trim();
  if (!raw) return "—";
  
  const key = raw.toLowerCase();
  
  // Map "resolved" to "closed" for display
  if (key === "resolved") {
    return "Closed";
  }
  
  // Only map exact default values
  switch (key) {
    case "open":
      return "Open";
    case "in_progress":
      return "In progress";
    case "closed":
      return "Closed";
    default:
      // Any other value (including variations) shows as Custom
      return `Custom: ${safeTitleCase(raw)}`;
  }
}

/**
 * Get priority label (handles custom values, normalizes labels)
 * Safe: handles null/undefined/empty strings, never crashes
 * IMPORTANT: Only maps exact default values; all others (including "normal") show as "Custom: X"
 */
export function getPriorityLabel(priority: string | null | undefined): string {
  // Normalize safely
  const raw = (priority ?? "").toString().trim();
  if (!raw) return "—";
  
  const key = raw.toLowerCase();
  
  // Only map exact default values - DO NOT map "normal" to "Medium"
  switch (key) {
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "urgent":
      return "Urgent";
    default:
      // Any other value (including "normal", "p1", "critical-high", etc.) shows as Custom
      return `Custom: ${safeTitleCase(raw)}`;
  }
}

/**
 * Get status badge class
 * Note: "resolved" uses "closed" styling
 */
export function getStatusBadgeClass(status: string): string {
  const lower = status.toLowerCase();
  // Map "resolved" to "closed" styling
  if (lower === "resolved") {
    return "bg-zinc-50 text-zinc-600 border border-zinc-200";
  }
  switch (lower) {
    case "open":
      return "bg-zinc-900 text-white";
    case "in_progress":
      return "bg-zinc-100 text-zinc-900 border border-zinc-200";
    case "closed":
      return "bg-zinc-50 text-zinc-600 border border-zinc-200";
    default:
      return "bg-zinc-50 text-zinc-600 border border-zinc-200";
  }
}

/**
 * Get priority badge class (normalizes "normal" to "medium")
 */
export function getPriorityBadgeClass(priority: string): string {
  const lower = priority.toLowerCase();
  switch (lower) {
    case "urgent":
    case "high":
      return "bg-zinc-900 text-white";
    case "medium":
    case "normal": // Map "normal" to "medium" styling
      return "bg-zinc-100 text-zinc-900 border border-zinc-200";
    case "low":
      return "bg-zinc-50 text-zinc-600 border border-zinc-200";
    default:
      return "bg-zinc-50 text-zinc-600 border border-zinc-200";
  }
}

/**
 * Format status label for display in activity diffs
 * Uses getStatusLabel but ensures consistent formatting
 */
export function formatStatusLabel(value: string | null | undefined): string {
  return getStatusLabel(value);
}

/**
 * Format priority label for display in activity diffs
 * Uses getPriorityLabel but ensures consistent formatting
 */
export function formatPriorityLabel(value: string | null | undefined): string {
  return getPriorityLabel(value);
}

/**
 * Humanize enum values (replace underscores with spaces, title case)
 * Used for generic field formatting in activity diffs
 */
export function humanizeEnum(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return "—";
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

