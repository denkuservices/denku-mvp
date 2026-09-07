import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from "./prefs";

/**
 * Reading a workspace's notification preferences.
 *
 * Lives here rather than in the `"use server"` action file next to the save, and the distinction
 * matters: everything exported from a `"use server"` file is a **callable endpoint**, and this
 * function takes an `orgId`. As an action, any signed-in person could have called it with someone
 * else's org id and read their settings. As a `server-only` module it is unreachable from a
 * browser, and its one caller passes the org the page already resolved for the viewer.
 */
/** The shape this reader needs out of an `organization_settings` row. */
export type NotificationPrefsRow = {
  notify_on_artifacts?: boolean | null;
  notify_usage_alerts?: boolean | null;
  notify_billing_events?: boolean | null;
  notification_email?: string | null;
  usage_alert_thresholds?: number[] | null;
};

/**
 * An already-fetched settings row, read as preferences. Pure.
 *
 * Exported so a caller holding the row does not fetch it again — the workspace settings page
 * loads the whole row for its form and then used to ask for these five columns separately
 * (perf, 2026-09-05).
 *
 * Every absent value falls to the same default the error path returns, including the
 * not-yet-migrated case where a `select("*")` simply has no such key. `notification_email` is
 * normalised to null rather than left `undefined` for exactly that reason: the type it feeds is
 * `string | null`, and a missing column used to arrive as the default, not as undefined.
 */
export function notificationPrefsFromRow(
  row: NotificationPrefsRow | null | undefined
): NotificationPrefs {
  if (!row) return DEFAULT_NOTIFICATION_PREFS;

  return {
    notifyOnArtifacts: row.notify_on_artifacts ?? true,
    notifyUsageAlerts: row.notify_usage_alerts ?? true,
    notifyBillingEvents: row.notify_billing_events ?? true,
    notificationEmail: row.notification_email ?? null,
    usageAlertThresholds: Array.isArray(row.usage_alert_thresholds)
      ? [...row.usage_alert_thresholds].map(Number).sort((a, b) => a - b)
      : DEFAULT_NOTIFICATION_PREFS.usageAlertThresholds,
  };
}

export async function loadNotificationPrefs(orgId: string): Promise<NotificationPrefs> {
  try {
    const { data, error } = await supabaseAdmin
      .from("organization_settings")
      .select(
        "notify_on_artifacts, notify_usage_alerts, notify_billing_events, notification_email, usage_alert_thresholds"
      )
      .eq("org_id", orgId)
      .maybeSingle<NotificationPrefsRow>();

    // Unknown columns (migration not applied) land here as an error — the defaults describe how
    // the product behaves today, so the page still tells the truth.
    if (error || !data) return DEFAULT_NOTIFICATION_PREFS;

    return notificationPrefsFromRow(data);
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

