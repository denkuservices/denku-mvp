import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { orgHoursFromRow } from "@/lib/business-hours/read";
import { notificationPrefsFromRow } from "@/lib/notifications/prefs.server";
import { DEFAULT_NOTIFICATION_PREFS } from "@/lib/notifications/prefs";
import { evaluateBusinessHours } from "@/lib/business-hours/schema";

/**
 * The workspace settings page reads `organization_settings` once and hands the row to these two
 * mappers, instead of asking the database for the same row twice more (perf, 2026-09-05).
 *
 * That swap is only safe if an ABSENT column behaves exactly like the read error it replaces. With
 * a narrow `select` an unapplied migration raised an error and the loader returned its defaults;
 * with `select("*")` the key is simply missing. These tests pin that equivalence — and above all
 * the one default that is load-bearing rather than cosmetic:
 *
 *   **a workspace with no hours configured is OPEN.**
 *
 * This code runs on the inbound path of a real phone call. The worst thing it could do is decide a
 * business is closed because a column was unreadable.
 */

describe("opening hours, read from an already-fetched row", () => {
  it("treats a missing business_hours column as no hours configured", () => {
    // Exactly what a `select("*")` returns before the hours migration is applied.
    const hours = orgHoursFromRow({ default_timezone: "Europe/Istanbul" });
    expect(hours.hours).toBeNull();
    expect(hours.behaviour).toBe("note_hours");
    expect(hours.timeZone).toBe("Europe/Istanbul");
  });

  it("and no hours configured means OPEN, at every hour", () => {
    const { hours } = orgHoursFromRow({});
    // Midnight on a Sunday — the moment a mistake here would be most expensive.
    const verdict = evaluateBusinessHours(hours, "UTC", new Date("2026-09-06T00:30:00Z"));
    expect(verdict.open).toBe(true);
  });

  it("behaves identically for a null row and an empty row", () => {
    expect(orgHoursFromRow(null)).toEqual(orgHoursFromRow({}));
    expect(orgHoursFromRow(undefined)).toEqual(orgHoursFromRow({}));
  });

  it("still reads real hours when they are there, and they still close the business", () => {
    // Mon–Fri 09:00–17:00, weekend closed. `day` is 0 = Sunday, matching `Date.getDay()`.
    const row = {
      business_hours: {
        days: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
          day,
          closed: day === 0 || day === 6,
          intervals: day === 0 || day === 6 ? [] : [{ open: "09:00", close: "17:00" }],
        })),
        exceptions: [],
      },
      after_hours_behavior: "answer_normally",
      default_timezone: "Europe/Istanbul",
    };

    const out = orgHoursFromRow(row);
    expect(out.hours).not.toBeNull();
    expect(out.behaviour).toBe("answer_normally");

    // Configured hours are still honoured — the mapper must not flatten everything to "open".
    // Wednesday 10:00 UTC is inside; Sunday 10:00 is not.
    expect(evaluateBusinessHours(out.hours, "UTC", new Date("2026-09-09T10:00:00Z")).open).toBe(true);
    expect(evaluateBusinessHours(out.hours, "UTC", new Date("2026-09-06T10:00:00Z")).open).toBe(false);
  });

  it("refuses an unrecognised behaviour rather than trusting the column", () => {
    // A value outside the union — a typo, or a setting from a future version — must fall to the
    // default, never be passed through to the prompt.
    expect(orgHoursFromRow({ after_hours_behavior: "say_closed" }).behaviour).toBe("note_hours");
    expect(orgHoursFromRow({ after_hours_behavior: "" }).behaviour).toBe("note_hours");
    expect(orgHoursFromRow({ after_hours_behavior: null }).behaviour).toBe("note_hours");
  });

  it("reads garbage in business_hours as no hours, not as closed", () => {
    for (const junk of ["", "09:00-17:00", 42, [], { mon: "nonsense" }]) {
      expect(orgHoursFromRow({ business_hours: junk }).hours).toBeNull();
    }
  });
});

describe("notification preferences, read from an already-fetched row", () => {
  it("falls to the documented defaults when the columns are missing", () => {
    // The pre-migration shape: a row exists, none of these keys do.
    expect(notificationPrefsFromRow({ })).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it("behaves identically for a null row", () => {
    expect(notificationPrefsFromRow(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(notificationPrefsFromRow(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it("normalises a missing email to null rather than undefined", () => {
    /*
     * The field is typed `string | null` and feeds a controlled input. Before this change a
     * missing column arrived as the DEFAULT (null) via the error path; reading the row directly
     * would have produced `undefined` and quietly changed the type at runtime.
     */
    const prefs = notificationPrefsFromRow({ notify_on_artifacts: false });
    expect(prefs.notificationEmail).toBeNull();
    expect(Object.is(prefs.notificationEmail, undefined)).toBe(false);
  });

  it("keeps an explicit false rather than defaulting it back to true", () => {
    const prefs = notificationPrefsFromRow({
      notify_on_artifacts: false,
      notify_usage_alerts: false,
      notify_billing_events: false,
    });
    expect(prefs.notifyOnArtifacts).toBe(false);
    expect(prefs.notifyUsageAlerts).toBe(false);
    expect(prefs.notifyBillingEvents).toBe(false);
  });

  it("sorts the thresholds and ignores a non-array", () => {
    expect(notificationPrefsFromRow({ usage_alert_thresholds: [90, 50, 75] }).usageAlertThresholds)
      .toEqual([50, 75, 90]);
    expect(notificationPrefsFromRow({ usage_alert_thresholds: null }).usageAlertThresholds)
      .toEqual(DEFAULT_NOTIFICATION_PREFS.usageAlertThresholds);
  });

  it("does not hand back the shared default array for callers to mutate", () => {
    const a = notificationPrefsFromRow({ usage_alert_thresholds: [90, 50] });
    a.usageAlertThresholds.push(999);
    expect(DEFAULT_NOTIFICATION_PREFS.usageAlertThresholds).toEqual([75, 90]);
  });
});
