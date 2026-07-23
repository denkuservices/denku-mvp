import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/utils/url";
import { resolveOrgOwnerEmail } from "@/lib/notifications/recipient";
import { sendBillingNotificationEmail } from "@/lib/email/send";
import { usageAlertTemplate } from "@/lib/email/templates/usageAlert";
import { billingNotificationsEnabled } from "@/lib/billing/pauseNotifications";
import { pauseOrgBilling } from "@/lib/billing/pause";

/**
 * R-009 usage management (owner policy 2026-07-23: PAUSE at the cap — trust + money
 * integrity over silent overage billing). Runs as an isolated daily cron (NOT in the
 * Vapi webhook hot path). Reads the baselined `org_monthly_overages` view (billable
 * vs included minutes, R-075):
 *   - 50/75/90% of included → warning email (idempotent via `billing_usage_alerts`);
 *   - 100% of included → PAUSE the AI line (pauseOrgBilling, which unbinds telephony
 *     and fires the owner pause notification), so no silent overage accrues.
 * Staged behind `BILLING_NOTIFICATIONS_ENABLED`.
 */

export const USAGE_THRESHOLDS = [50, 75, 90] as const;

/** Which warning thresholds a usage level has crossed (below 100%). Pure. */
export function crossedThresholds(billableMinutes: number, includedMinutes: number): number[] {
  if (includedMinutes <= 0) return [];
  const pct = (billableMinutes / includedMinutes) * 100;
  return USAGE_THRESHOLDS.filter((t) => pct >= t);
}

/** Whether usage has hit 100% of included minutes → pause. Pure. */
export function shouldPauseForUsage(billableMinutes: number, includedMinutes: number): boolean {
  return includedMinutes > 0 && billableMinutes >= includedMinutes;
}

function currentMonthStartUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

interface RunResult {
  ok: boolean;
  enabled: boolean;
  orgsChecked: number;
  emailsSent: number;
  paused: number;
}

/**
 * Sweep all orgs' current-month usage and email the highest newly-crossed threshold
 * per org (never re-sending a threshold). Never throws per-org; returns a summary.
 */
export async function runUsageThresholdAlerts(): Promise<RunResult> {
  if (!billingNotificationsEnabled()) {
    return { ok: true, enabled: false, orgsChecked: 0, emailsSent: 0, paused: 0 };
  }

  const month = currentMonthStartUtc();
  let orgsChecked = 0;
  let emailsSent = 0;
  let paused = 0;

  const { data: rows, error } = await supabaseAdmin
    .from("org_monthly_overages")
    .select("org_id, billable_minutes, included_minutes")
    .eq("month", month);

  if (error) {
    console.error("[USAGE_ALERTS] Failed to read org_monthly_overages", error.message);
    return { ok: false, enabled: true, orgsChecked: 0, emailsSent: 0, paused: 0 };
  }

  for (const row of rows ?? []) {
    orgsChecked++;
    try {
      const billable = Number(row.billable_minutes ?? 0);
      const included = Number(row.included_minutes ?? 0);

      // 100% of included minutes → PAUSE (owner policy). Only pause an active org
      // (avoids redundant Vapi calls / duplicate emails); pauseOrgBilling fires the
      // owner pause notification on the active→paused transition.
      if (shouldPauseForUsage(billable, included)) {
        const { data: settings } = await supabaseAdmin
          .from("organization_settings")
          .select("workspace_status")
          .eq("org_id", row.org_id)
          .maybeSingle<{ workspace_status: "active" | "paused" | null }>();
        if ((settings?.workspace_status ?? "active") === "active") {
          await pauseOrgBilling(row.org_id, "hard_cap", {
            trigger: "usage_cap_100pct",
            billable_minutes: billable,
            included_minutes: included,
          });
          paused++;
        }
        continue; // paused → don't also send a sub-100% warning
      }

      const crossed = crossedThresholds(billable, included);
      if (crossed.length === 0) continue;

      const highest = Math.max(...crossed);

      // Atomically CLAIM the highest crossed threshold. If it's already recorded,
      // we've alerted at this level → skip. onConflict do-nothing = idempotent.
      const { data: claimed } = await supabaseAdmin
        .from("billing_usage_alerts")
        .upsert(
          { org_id: row.org_id, month, threshold_pct: highest },
          { onConflict: "org_id,month,threshold_pct", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle();

      if (!claimed) continue; // already alerted at this threshold

      // Suppress lower thresholds (so we don't later email 50/75 after 90).
      const lower = crossed.filter((t) => t < highest).map((t) => ({ org_id: row.org_id, month, threshold_pct: t }));
      if (lower.length > 0) {
        await supabaseAdmin
          .from("billing_usage_alerts")
          .upsert(lower, { onConflict: "org_id,month,threshold_pct", ignoreDuplicates: true });
      }

      const to = await resolveOrgOwnerEmail(row.org_id);
      if (!to) continue;

      const { data: org } = await supabaseAdmin
        .from("orgs")
        .select("name")
        .eq("id", row.org_id)
        .maybeSingle<{ name: string | null }>();

      const { subject, html } = usageAlertTemplate({
        thresholdPct: highest,
        billableMinutes: billable,
        includedMinutes: included,
        orgName: org?.name ?? null,
        billingUrl: `${getBaseUrl()}/dashboard/settings/workspace/billing`,
      });

      const result = await sendBillingNotificationEmail(to, { subject, html });
      if (result.ok) {
        emailsSent++;
        console.log("[USAGE_ALERTS] Sent", { orgId: row.org_id, threshold: highest });
      } else {
        // Release the claim so a later run retries.
        await supabaseAdmin
          .from("billing_usage_alerts")
          .delete()
          .eq("org_id", row.org_id)
          .eq("month", month)
          .eq("threshold_pct", highest);
        console.error("[USAGE_ALERTS] Send failed; released claim", { orgId: row.org_id, error: result.error });
      }
    } catch (err) {
      console.error("[USAGE_ALERTS] Exception for org (non-fatal)", {
        orgId: row.org_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ok: true, enabled: true, orgsChecked, emailsSent, paused };
}
