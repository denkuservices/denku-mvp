import "server-only";
import { getOrgSettingsContext } from "@/lib/org/orgSettingsContext";

/**
 * Server-only utility functions for tickets.
 * These functions require server-side Supabase client.
 * DO NOT import in Client Components.
 */

/**
 * Get organization timezone (defaults to UTC)
 *
 * Reads through the per-request cached settings context (perf, 2026-08-31) so a page that also
 * checks workspace status/pause pays one shared `organization_settings` round-trip, not three.
 */
export async function getOrgTimezone(orgId: string): Promise<string> {
  return (await getOrgSettingsContext(orgId)).defaultTimezone;
}

/**
 * Format date in organization timezone
 */
export async function formatDateInOrgTZ(date: string | null | undefined, orgId: string): Promise<string> {
  if (!date) return "—";

  try {
    const timezone = await getOrgTimezone(orgId);
    const d = new Date(date);

    if (Number.isNaN(d.getTime())) return "—";

    // Use Intl.DateTimeFormat for timezone-aware formatting
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    // Fallback to simple formatting
    return new Date(date).toLocaleString();
  }
}

