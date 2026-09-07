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

/** The shape this reader needs out of an `organization_settings` row. */
export type OrgHoursRow = {
  business_hours?: unknown;
  after_hours_behavior?: string | null;
  default_timezone?: string | null;
};

/**
 * An already-fetched settings row, read as hours. Pure.
 *
 * Exported so a caller that has ALREADY loaded the row does not fetch it a second time — the
 * workspace settings page reads the whole row for its form and then used to ask for these three
 * columns again (perf, 2026-09-05).
 *
 * **Every absent value resolves to "no hours configured", which the evaluator reads as always
 * open.** That covers a null row, and it covers the not-yet-migrated case, where the columns are
 * simply missing from a `select("*")` rather than raising a read error: `parseBusinessHours`
 * answers null for `undefined`, and an unrecognised behaviour falls to the default. A business
 * must never be treated as closed because a column was unreadable.
 */
export function orgHoursFromRow(row: OrgHoursRow | null | undefined): OrgHours {
  if (!row) return { hours: null, timeZone: null, behaviour: DEFAULT_BEHAVIOUR };

  const behaviour = (AFTER_HOURS_BEHAVIOURS as readonly string[]).includes(
    row.after_hours_behavior ?? ""
  )
    ? (row.after_hours_behavior as AfterHoursBehaviour)
    : DEFAULT_BEHAVIOUR;

  return {
    hours: parseBusinessHours(row.business_hours),
    timeZone: row.default_timezone ?? null,
    behaviour,
  };
}

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
      .maybeSingle<OrgHoursRow>();

    // Includes the not-yet-migrated case: an unknown column is a read error, not a closed business.
    if (error || !data) return empty;

    return orgHoursFromRow(data);
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
