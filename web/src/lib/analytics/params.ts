import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AnalyticsParams, AnalyticsRange } from "./types";

const AnalyticsParamsSchema = z.object({
  range: z.enum(["7d", "30d", "90d"]).default("7d"),
  agentId: z.string().uuid().optional(),
  outcome: z.string().optional(),
  direction: z.string().optional(),
  section: z.enum(["calls", "tickets"]).default("calls"),
  priority: z.enum(["low", "medium", "high", "urgent", ""]).optional(),
});

export function parseAnalyticsParams(searchParams: Record<string, string | string[] | undefined>): AnalyticsParams {
  // Normalize searchParams: if array, take first element; if undefined, use undefined
  const normalize = (value: string | string[] | undefined): string | undefined => {
    if (Array.isArray(value)) return value[0];
    return value;
  };

  const parsed = AnalyticsParamsSchema.safeParse({
    range: normalize(searchParams.range),
    agentId: normalize(searchParams.agentId),
    outcome: normalize(searchParams.outcome),
    direction: normalize(searchParams.direction),
    section: normalize(searchParams.section),
    priority: normalize(searchParams.priority),
  });

  if (!parsed.success) {
    return { range: "7d" };
  }

  return parsed.data;
}

export function getDateRange(range: AnalyticsRange): { from: Date; to: Date; compareFrom: Date; compareTo: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setUTCHours(23, 59, 59, 999);

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - days + 1);
  from.setUTCHours(0, 0, 0, 0);

  // Compare period: previous same-length range
  const compareTo = new Date(from);
  compareTo.setUTCMilliseconds(compareTo.getUTCMilliseconds() - 1);
  const compareFrom = new Date(compareTo);
  compareFrom.setUTCDate(compareFrom.getUTCDate() - days + 1);
  compareFrom.setUTCHours(0, 0, 0, 0);

  return { from, to, compareFrom, compareTo };
}

export async function resolveOrgId(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw new Error(authErr.message);
  if (!auth?.user) throw new Error("Not authenticated. Please sign in to view this dashboard.");

  const profileId = auth.user.id;
  const candidates = ["org_id", "organization_id", "current_org_id", "orgs_id"] as const;

  for (const col of candidates) {
    const { data, error } = await supabase
      .from("profiles")
      .select(`${col}`)
      .eq("id", profileId)
      .maybeSingle();

    if (!error && data && (data as any)[col]) {
      return (data as any)[col] as string;
    }
  }

  throw new Error(
    "Could not resolve org_id for this user. Expected one of: profiles.org_id / organization_id / current_org_id / orgs_id."
  );
}

/**
 * Check if user is admin or owner for the given org.
 * Returns boolean (true if admin/owner, false otherwise).
 * Used for UI gating (e.g., showing/hiding export button).
 */
export async function isAdminOrOwner(orgId: string, userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .eq("org_id", orgId)
    .maybeSingle<{ role: string | null }>();

  if (error || !profile) {
    return false;
  }

  return profile.role === "owner" || profile.role === "admin";
}

/**
 * Assert that user is admin or owner for the given org.
 * Throws error if not admin/owner.
 * Used for API route authorization.
 */
export async function assertAdminOrOwner(orgId: string, userId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .eq("org_id", orgId)
    .maybeSingle<{ role: string | null }>();

  if (error || !profile) {
    throw new Error("Forbidden: Could not verify user role");
  }

  if (profile.role !== "owner" && profile.role !== "admin") {
    throw new Error("Forbidden: Only owners and admins can export analytics");
  }
}

