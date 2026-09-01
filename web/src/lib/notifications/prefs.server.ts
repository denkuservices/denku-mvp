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
export async function loadNotificationPrefs(orgId: string): Promise<NotificationPrefs> {
  try {
    const { data, error } = await supabaseAdmin
      .from("organization_settings")
      .select(
        "notify_on_artifacts, notify_usage_alerts, notify_billing_events, notification_email, usage_alert_thresholds"
      )
      .eq("org_id", orgId)
      .maybeSingle<{
        notify_on_artifacts: boolean | null;
        notify_usage_alerts: boolean | null;
        notify_billing_events: boolean | null;
        notification_email: string | null;
        usage_alert_thresholds: number[] | null;
      }>();

    // Unknown columns (migration not applied) land here as an error — the defaults describe how
    // the product behaves today, so the page still tells the truth.
    if (error || !data) return DEFAULT_NOTIFICATION_PREFS;

    return {
      notifyOnArtifacts: data.notify_on_artifacts ?? true,
      notifyUsageAlerts: data.notify_usage_alerts ?? true,
      notifyBillingEvents: data.notify_billing_events ?? true,
      notificationEmail: data.notification_email,
      usageAlertThresholds: Array.isArray(data.usage_alert_thresholds)
        ? [...data.usage_alert_thresholds].map(Number).sort((a, b) => a - b)
        : DEFAULT_NOTIFICATION_PREFS.usageAlertThresholds,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

