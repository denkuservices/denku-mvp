"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getViewer, roleCan } from "@/lib/auth/permissions";
import { logAuditEvent } from "@/lib/audit/log";
// A `"use server"` file may only export async functions, so the type and the defaults live in a
// plain module — which is also where a client component can reach them.
import { type NotificationPrefs } from "@/lib/notifications/prefs";
import { loadNotificationPrefs } from "@/lib/notifications/prefs.server";

/**
 * What the business hears from us, and where.
 *
 * Until now the only preference a customer had was `notify_on_artifacts`, and it was not on this
 * page: usage alerts fired at thresholds nobody chose, to an address nobody could see. That is the
 * shape of a product that emails people without asking — and the address matters more than it
 * looks, because `resolveOrgOwnerEmail` falls back to the owner's personal inbox, which for a
 * business with a bookkeeper is the wrong human.
 *
 * Thresholds are stored as whole percents of the plan's included minutes, and the offered values
 * are 50/75/90 because those are the ones `lib/billing/usageAlerts.ts` actually evaluates — a
 * settings page that offers a threshold nothing checks is worse than no settings page. 100% is
 * deliberately absent: hitting it PAUSES the workspace rather than warning about it, and nobody
 * gets to opt out of being told their phone line stopped.
 *
 * An EMPTY array means "do not warn me about usage" and is a legitimate choice, distinct from
 * "never configured" — which is why the column has a default rather than being nullable.
 */

const SaveSchema = z.object({
  notifyOnArtifacts: z.boolean(),
  notifyUsageAlerts: z.boolean(),
  notifyBillingEvents: z.boolean(),
  notificationEmail: z.union([z.string().email().max(255), z.literal("")]).nullable(),
  usageAlertThresholds: z.array(z.number().int().min(1).max(200)).max(6),
});

type SaveNotificationsResult = { ok: true } | { ok: false; error: string };

export async function saveNotificationPrefs(
  input: NotificationPrefs
): Promise<SaveNotificationsResult> {
  const viewer = await getViewer();
  if (!viewer.userId) return { ok: false, error: "Unauthorized" };
  if (!viewer.orgId) return { ok: false, error: "No workspace found for this account" };
  if (!roleCan(viewer.role, "manage_workspace_settings")) {
    return { ok: false, error: "Only owners and admins can change notification settings." };
  }

  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Those settings aren't valid" };
  }

  const before = await loadNotificationPrefs(viewer.orgId);
  const email = parsed.data.notificationEmail?.trim() ? parsed.data.notificationEmail.trim() : null;
  // De-duplicated and sorted so "80, 50, 80" saves as "50, 80" and the alert cron reads a
  // predictable ladder rather than whatever order the checkboxes were clicked in.
  const thresholds = Array.from(new Set(parsed.data.usageAlertThresholds)).sort((a, b) => a - b);

  const { error } = await supabaseAdmin
    .from("organization_settings")
    .upsert(
      {
        org_id: viewer.orgId,
        notify_on_artifacts: parsed.data.notifyOnArtifacts,
        notify_usage_alerts: parsed.data.notifyUsageAlerts,
        notify_billing_events: parsed.data.notifyBillingEvents,
        notification_email: email,
        usage_alert_thresholds: parsed.data.notifyUsageAlerts ? thresholds : [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" }
    );

  if (error) {
    console.error("[SETTINGS][NOTIFICATIONS][SAVE_FAILED]", error.message);
    return { ok: false, error: "We couldn't save those settings. Try again shortly." };
  }

  const diff: Record<string, { before: unknown; after: unknown }> = {};
  if (before.notifyOnArtifacts !== parsed.data.notifyOnArtifacts)
    diff.notify_on_artifacts = { before: before.notifyOnArtifacts, after: parsed.data.notifyOnArtifacts };
  if (before.notifyUsageAlerts !== parsed.data.notifyUsageAlerts)
    diff.notify_usage_alerts = { before: before.notifyUsageAlerts, after: parsed.data.notifyUsageAlerts };
  if (before.notifyBillingEvents !== parsed.data.notifyBillingEvents)
    diff.notify_billing_events = { before: before.notifyBillingEvents, after: parsed.data.notifyBillingEvents };
  if (before.notificationEmail !== email)
    diff.notification_email = { before: before.notificationEmail, after: email };
  if (before.usageAlertThresholds.join(",") !== thresholds.join(","))
    diff.usage_alert_thresholds = {
      before: before.usageAlertThresholds.join(", "),
      after: thresholds.join(", "),
    };

  if (Object.keys(diff).length > 0) {
    await logAuditEvent({
      org_id: viewer.orgId,
      actor_user_id: viewer.profileId,
      action: "workspace.notifications.update",
      entity_type: "workspace.general",
      entity_id: viewer.orgId,
      diff,
    });
  }

  revalidatePath("/dashboard/settings/workspace");
  return { ok: true };
}
