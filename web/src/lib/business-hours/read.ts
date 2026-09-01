import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  AFTER_HOURS_BEHAVIOURS,
  evaluateBusinessHours,
  parseBusinessHours,
  type AfterHoursBehaviour,
  type BusinessHours,
  type HoursVerdict,
} from "./schema";

/**
 * The workspace's hours, loaded once and evaluated against an instant.
 *
 * Never throws, and every failure path resolves to "no hours configured", which the evaluator
 * reads as always open. That direction is not an accident: this code runs on the inbound path of
 * a real phone call and a real customer message, and the worst thing it could do is decide a
 * business is closed because a column was unreadable.
 */

export type OrgHours = {
  hours: BusinessHours | null;
  timeZone: string | null;
  behaviour: AfterHoursBehaviour;
};

/**
 * What a workspace gets if it has not chosen.
 *
 * `note_hours` rather than silence: if someone bothered to set opening hours, the useful default is
 * that a customer arriving at midnight is told nobody is in and when that changes. It never stops
 * the AI answering — no option does.
 */
const DEFAULT_BEHAVIOUR: AfterHoursBehaviour = "note_hours";

export async function loadOrgHours(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<OrgHours> {
  const empty: OrgHours = { hours: null, timeZone: null, behaviour: DEFAULT_BEHAVIOUR };
  if (!orgId) return empty;

  try {
    const { data, error } = await db
      .from("organization_settings")
      .select("business_hours, after_hours_behavior, default_timezone")
      .eq("org_id", orgId)
      .maybeSingle<{
        business_hours: unknown;
        after_hours_behavior: string | null;
        default_timezone: string | null;
      }>();

    // Includes the not-yet-migrated case: an unknown column is a read error, not a closed business.
    if (error || !data) return empty;

    const behaviour = (AFTER_HOURS_BEHAVIOURS as readonly string[]).includes(
      data.after_hours_behavior ?? ""
    )
      ? (data.after_hours_behavior as AfterHoursBehaviour)
      : DEFAULT_BEHAVIOUR;

    return {
      hours: parseBusinessHours(data.business_hours),
      timeZone: data.default_timezone ?? null,
      behaviour,
    };
  } catch {
    return empty;
  }
}

/** Load and evaluate in one step — what an inbound handler actually wants. */
export async function evaluateOrgHours(
  orgId: string,
  at: Date = new Date(),
  db: SupabaseClient = supabaseAdmin
): Promise<OrgHours & { verdict: HoursVerdict }> {
  const config = await loadOrgHours(orgId, db);
  return { ...config, verdict: evaluateBusinessHours(config.hours, config.timeZone, at) };
}
