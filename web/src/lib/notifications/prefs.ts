/**
 * The workspace's notification preferences — the shape and the defaults.
 *
 * Deliberately NOT in the `"use server"` action file that reads and writes them: such a file may
 * only export async functions, so a constant living beside its action is a build error rather than
 * a style question. The type and the defaults are needed by a client component and a server page
 * as well, so they belong in a plain module either way.
 *
 * The defaults describe how the product behaved before any of this existed — everything on, warn
 * at the thresholds the usage cron actually evaluates — so a workspace whose row predates the
 * columns reads exactly as it did.
 */

export type NotificationPrefs = {
  notifyOnArtifacts: boolean;
  notifyUsageAlerts: boolean;
  notifyBillingEvents: boolean;
  /**
   * Where operational mail goes. Null falls back to `billing_email`, and then to the owner's
   * personal address — see `lib/notifications/recipient.ts`.
   */
  notificationEmail: string | null;
  /**
   * Percentages of included minutes at which to warn. 50/75/90 are the values
   * `lib/billing/usageAlerts.ts` evaluates; 100% is absent because reaching it PAUSES the
   * workspace rather than warning, and that is not opt-out-able.
   *
   * An EMPTY array is a real answer — "do not warn me" — and is distinct from "never configured".
   */
  usageAlertThresholds: number[];
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  notifyOnArtifacts: true,
  notifyUsageAlerts: true,
  notifyBillingEvents: true,
  notificationEmail: null,
  usageAlertThresholds: [50, 75, 90],
};

/** The thresholds a customer may choose between. */
export const USAGE_ALERT_CHOICES = [50, 75, 90] as const;
