import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";

/**
 * Retire add-on downgrades whose paid period has ended.
 *
 * **This is bookkeeping, not enforcement.** Entitlement is decided at read time by
 * `effectiveAddonQty`, so a workspace whose `ends_at` passed an hour ago already has the smaller
 * limit whether or not this ever runs. What the sweep does is settle the row — `qty` becomes what
 * the customer actually holds and a fully-dropped add-on becomes `inactive` — so anything that
 * reads the table directly (an invoice line, a support query, a future report) sees the same truth
 * the limits do.
 *
 * That split is deliberate. The only scheduled job in this product runs monthly, Stripe periods
 * are not calendar-aligned, and a design where capacity expires only when a cron fires would let a
 * workspace keep an extra concurrent call for weeks after it stopped paying — and would fail
 * closed in the other direction the day the job errored.
 *
 * Idempotent: rows are selected by a date already in the past and rewritten to a state that no
 * longer matches the filter, so a double run is a no-op. Never throws — it is called from a cron
 * that has more important work after it.
 */
export async function applyDueAddonSchedules(now: Date = new Date()): Promise<{
  ok: boolean;
  applied: number;
  error?: string;
}> {
  try {
    const { data: due, error } = await supabaseAdmin
      .from("billing_org_addons")
      .select("org_id, addon_key, qty, scheduled_qty, ends_at")
      .eq("status", "active")
      .not("ends_at", "is", null)
      .lte("ends_at", now.toISOString());

    if (error) return { ok: false, applied: 0, error: error.message };
    if (!due || due.length === 0) return { ok: true, applied: 0 };

    let applied = 0;

    for (const row of due) {
      const nextQty = Math.max(0, Number(row.scheduled_qty ?? 0));

      const { error: updateError } = await supabaseAdmin
        .from("billing_org_addons")
        .update({
          qty: nextQty,
          status: nextQty > 0 ? "active" : "inactive",
          ends_at: null,
          scheduled_qty: null,
          updated_at: new Date().toISOString(),
        })
        // Org-scoped like every service-role write, and keyed on the natural key rather than on a
        // row id this table does not have.
        .eq("org_id", row.org_id)
        .eq("addon_key", row.addon_key);

      if (updateError) {
        logEvent({
          tag: "[BILLING][ADDON_SCHEDULE][APPLY_FAILED]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          org_id: row.org_id,
          severity: "error",
          details: { addon_key: row.addon_key, error: updateError.message },
        });
        continue;
      }

      applied += 1;
      logEvent({
        tag: "[BILLING][ADDON_SCHEDULE][APPLIED]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: row.org_id,
        severity: "info",
        details: {
          addon_key: row.addon_key,
          from_qty: Number(row.qty ?? 0),
          to_qty: nextQty,
          ended_at: row.ends_at,
        },
      });
    }

    return { ok: true, applied };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[BILLING][ADDON_SCHEDULE][SWEEP_FAILED]", message);
    return { ok: false, applied: 0, error: message };
  }
}
