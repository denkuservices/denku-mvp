import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/utils/url";
import { resolveOrgOwnerEmail } from "@/lib/notifications/recipient";
import { sendBillingNotificationEmail } from "@/lib/email/send";
import { workspacePausedTemplate, type PauseReason } from "@/lib/email/templates/workspacePaused";

/**
 * R-009 — email the owner when billing pauses their workspace (hard_cap / past_due),
 * so a business phone never goes dead silently.
 *
 * - STAGED: gated by `BILLING_NOTIFICATIONS_ENABLED` (default OFF). Enable after
 *   confirming denku.io deliverability (mirrors R-008's staged pattern).
 * - Idempotency is the CALLER's job: this is invoked only on the active→paused
 *   transition (see `pauseOrgBilling`), so it emails once per pause event.
 * - NEVER THROWS: a billing pause must complete regardless of email outcome.
 */

type Env = Record<string, string | undefined>;

export function billingNotificationsEnabled(env: Env = process.env): boolean {
  return (env.BILLING_NOTIFICATIONS_ENABLED ?? "").toLowerCase().trim() === "true";
}

export async function notifyWorkspacePaused(orgId: string, reason: PauseReason): Promise<void> {
  try {
    if (!billingNotificationsEnabled()) return;
    if (!orgId) return;

    const to = await resolveOrgOwnerEmail(orgId);
    if (!to) return;

    const { data: org } = await supabaseAdmin
      .from("orgs")
      .select("name")
      .eq("id", orgId)
      .maybeSingle<{ name: string | null }>();

    const { subject, html } = workspacePausedTemplate({
      reason,
      orgName: org?.name ?? null,
      billingUrl: `${getBaseUrl()}/dashboard/settings/workspace/billing`,
    });

    const result = await sendBillingNotificationEmail(to, { subject, html });
    if (!result.ok) {
      console.error("[BILLING_NOTIFY] Pause email failed", { orgId, reason, error: result.error });
      return;
    }
    console.log("[BILLING_NOTIFY] Pause email sent", { orgId, reason });
  } catch (err) {
    console.error("[BILLING_NOTIFY] Exception in notifyWorkspacePaused (non-fatal):", {
      orgId,
      reason,
      error: err instanceof Error ? err.message : String(err),
    });
    // Never throw — the pause itself must not be affected.
  }
}
