"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getViewer, roleCan } from "@/lib/auth/permissions";
import { logAuditEvent } from "@/lib/audit/log";
import {
  AFTER_HOURS_BEHAVIOURS,
  BusinessHoursSchema,
  describeBusinessHours,
  parseBusinessHours,
  type AfterHoursBehaviour,
  type BusinessHours,
} from "@/lib/business-hours/schema";

/**
 * Saving the week.
 *
 * Validation is the interesting part, and it is deliberately stricter than the database check
 * constraint: Postgres refuses anything that is not the document shape, this refuses anything that
 * is not a coherent schedule. An interval whose end equals its start is not "zero minutes open",
 * it is a typo — and an overlapping pair (`09:00–13:00` and `12:00–17:00`) is someone editing in
 * two places and losing track, not a business that is doubly open at noon.
 *
 * Overnight intervals (`22:00–02:00`) are allowed and are NOT overlaps with the following day's
 * morning shift; the evaluator understands them (`intervalContains`), so the editor must not
 * refuse them.
 */

const SaveSchema = z.object({
  hours: BusinessHoursSchema.nullable(),
  behaviour: z.enum(AFTER_HOURS_BEHAVIOURS),
});

export type SaveBusinessHoursResult =
  | { ok: true; summary: string }
  | { ok: false; error: string };

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Human-readable reason a schedule is not saveable, or null when it is. */
function findScheduleProblem(hours: BusinessHours): string | null {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  for (const day of hours.days) {
    if (day.closed) continue;
    if (day.intervals.length === 0) {
      return `${names[day.day]} is marked open but has no hours. Add a time range or mark it closed.`;
    }

    // Compare only same-day (non-overnight) ranges: an overnight range ends tomorrow, so it
    // cannot overlap another range that starts today.
    const sameDay = day.intervals
      .filter((i) => toMinutes(i.close) > toMinutes(i.open))
      .map((i) => ({ start: toMinutes(i.open), end: toMinutes(i.close) }))
      .sort((a, b) => a.start - b.start);

    for (let i = 1; i < sameDay.length; i++) {
      if (sameDay[i].start < sameDay[i - 1].end) {
        return `${names[day.day]} has two time ranges that overlap. Merge them or adjust the times.`;
      }
    }

    const overnight = day.intervals.filter((i) => toMinutes(i.close) <= toMinutes(i.open));
    if (overnight.length > 1) {
      return `${names[day.day]} has more than one range running past midnight. Keep one.`;
    }
  }

  const seen = new Set<string>();
  for (const ex of hours.exceptions) {
    if (seen.has(ex.date)) return `There are two entries for ${ex.date}. Keep one.`;
    seen.add(ex.date);
    if (!ex.closed && ex.intervals.length === 0) {
      return `${ex.date} is marked open but has no hours. Add a time range or mark it closed.`;
    }
  }

  return null;
}

export async function saveBusinessHours(input: {
  hours: BusinessHours | null;
  behaviour: AfterHoursBehaviour;
}): Promise<SaveBusinessHoursResult> {
  const viewer = await getViewer();
  if (!viewer.userId) return { ok: false, error: "Unauthorized" };
  if (!viewer.orgId) return { ok: false, error: "No workspace found for this account" };
  if (!roleCan(viewer.role, "manage_workspace_settings")) {
    return { ok: false, error: "Only owners and admins can change opening hours." };
  }

  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Those hours aren't valid" };
  }

  const { hours, behaviour } = parsed.data;
  if (hours) {
    const problem = findScheduleProblem(hours);
    if (problem) return { ok: false, error: problem };
  }

  const { data: before } = await supabaseAdmin
    .from("organization_settings")
    .select("business_hours, after_hours_behavior")
    .eq("org_id", viewer.orgId)
    .maybeSingle<{ business_hours: unknown; after_hours_behavior: string | null }>();

  const { error } = await supabaseAdmin
    .from("organization_settings")
    .upsert(
      {
        org_id: viewer.orgId,
        business_hours: hours,
        after_hours_behavior: behaviour,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" }
    );

  if (error) {
    console.error("[SETTINGS][HOURS][SAVE_FAILED]", error.message);
    // The most likely cause on a fresh environment is the migration not being applied.
    return { ok: false, error: "We couldn't save your opening hours. Try again shortly." };
  }

  const previous = parseBusinessHours(before?.business_hours);
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const beforeSummary = previous ? describeBusinessHours(previous) : null;
  const afterSummary = hours ? describeBusinessHours(hours) : null;
  if (beforeSummary !== afterSummary) diff.opening_hours = { before: beforeSummary, after: afterSummary };
  if ((before?.after_hours_behavior ?? null) !== behaviour) {
    diff.after_hours_behavior = { before: before?.after_hours_behavior ?? null, after: behaviour };
  }

  if (Object.keys(diff).length > 0) {
    await logAuditEvent({
      org_id: viewer.orgId,
      actor_user_id: viewer.profileId,
      action: "workspace.hours.update",
      entity_type: "workspace.general",
      entity_id: viewer.orgId,
      diff,
    });
  }

  revalidatePath("/dashboard/settings/workspace");

  return {
    ok: true,
    summary: afterSummary ?? "No opening hours set — the AI answers around the clock.",
  };
}
