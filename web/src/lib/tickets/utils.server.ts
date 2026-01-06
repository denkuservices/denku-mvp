import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-only utility functions for tickets.
 * These functions require server-side Supabase client.
 * DO NOT import in Client Components.
 */

/**
 * Get organization timezone (defaults to UTC)
 */
export async function getOrgTimezone(orgId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("organization_settings")
    .select("default_timezone")
    .eq("org_id", orgId)
    .maybeSingle<{ default_timezone: string | null }>();

  return data?.default_timezone ?? "UTC";
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

