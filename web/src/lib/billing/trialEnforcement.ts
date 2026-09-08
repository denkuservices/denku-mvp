import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import { pauseWorkspace } from "@/lib/workspace/pause";
import { getActiveGrants, getTrialVoiceStatus, type GrantRow } from "@/lib/billing/grants";
import { releaseGrantedLine } from "@/lib/vapi/grantedLine";

/**
 * Taking back what a trial was given, when the reader alone cannot.
 *
 * `grants.ts` decides entitlement from the dates, so a lapsed grant stops granting the instant it
 * lapses without anything running. What a reader cannot do is unbind a phone number in Vapi, hand a
 * rented number back, or flip a workspace to paused — those are effects in other systems, and they
 * are what this module is for. Nothing here decides WHETHER capacity exists; it only makes the
 * world match a decision `grants.ts` has already made.
 *
 * ## The honest limit
 *
 * A trial minute cap **cannot stop a call that is already connected**, and it cannot refuse the
 * next one the instant the allowance runs out. Denku learns a call's duration from the Vapi
 * end-of-call webhook, which arrives after the caller has hung up — the same structural gap
 * CLAUDE.md landmine #3 records for concurrency limits. So a 30-minute grant can overrun by at most
 * one call's length. The admin panel says so next to the countdown rather than implying a hard
 * ceiling that does not exist. Do not describe this as "enforced in real time"; describe it as
 * "the workspace is paused after the call that crosses the line".
 *
 * ## Why pausing is nonetheless real
 *
 * `pauseWorkspace` PATCHes every Vapi phone number for the org to `assistantId: null`. The next
 * caller reaches a number that answers to nobody. That is genuine enforcement, unlike the
 * concurrency lease, and it is the reason a minute grant is safe to hand out at all.
 */

/** Does this workspace pay for voice? A paid plan's own cap governs; a grant must not add one. */
async function hasPaidVoicePlan(orgId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from("org_plan_limits")
      .select("plan_code")
      .eq("org_id", orgId)
      .maybeSingle<{ plan_code: string | null }>();
    // A failed read is treated as "they DO pay", so a glitch can only ever fail to pause a trial —
    // never pause a paying customer's phone line. The sweep will catch it on the next run.
    if (error) return true;
    return Boolean(data?.plan_code);
  } catch {
    return true;
  }
}

async function workspaceIsActive(orgId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("organization_settings")
    .select("workspace_status")
    .eq("org_id", orgId)
    .maybeSingle<{ workspace_status: string | null }>();
  return (data?.workspace_status ?? "active") === "active";
}

export interface TrialCapResult {
  checked: boolean;
  paused: boolean;
  reason?: "no_grant" | "has_paid_plan" | "within_allowance" | "already_paused" | "error";
}

/**
 * Has this workspace spent its granted minutes? If so, stop the phones.
 *
 * Called from the Vapi webhook the moment a call is finalised, so the pause lands seconds after the
 * offending call rather than whenever a cron next runs. **Never throws** — it is on the webhook's
 * success path, and a failure here must not turn a call that was recorded correctly into a 500 that
 * Vapi retries.
 */
export async function enforceTrialVoiceCap(orgId: string): Promise<TrialCapResult> {
  if (!orgId) return { checked: false, paused: false, reason: "error" };

  try {
    const status = await getTrialVoiceStatus(orgId);
    if (!status.active) return { checked: true, paused: false, reason: "no_grant" };
    if (!status.exhausted) return { checked: true, paused: false, reason: "within_allowance" };

    // Only now, once we know a cap has actually been crossed, is it worth a second query.
    if (await hasPaidVoicePlan(orgId)) {
      return { checked: true, paused: false, reason: "has_paid_plan" };
    }
    if (!(await workspaceIsActive(orgId))) {
      return { checked: true, paused: false, reason: "already_paused" };
    }

    await pauseWorkspace(orgId, "trial_ended", {
      trigger: "trial_voice_minutes_exhausted",
      granted_minutes: status.granted,
      used_minutes: status.used,
    });

    logEvent({
      tag: "[TRIAL][VOICE][EXHAUSTED][PAUSED]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: orgId,
      severity: "warn",
      details: { granted_minutes: status.granted, used_minutes: status.used },
    });

    return { checked: true, paused: true };
  } catch (err) {
    logEvent({
      tag: "[TRIAL][VOICE][ENFORCE][FAILED]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: { error: err instanceof Error ? err.message : String(err) },
    });
    return { checked: false, paused: false, reason: "error" };
  }
}

export interface GrantSweepResult {
  ok: boolean;
  grantsExpired: number;
  linesReleased: number;
  workspacesPaused: number;
  capsEnforced: number;
}

/**
 * The nightly sweep: retire lapsed grants and take back what they were holding.
 *
 * Three jobs, in this order:
 *
 *   1. **Release granted phone lines.** A number Denku rented for a trial keeps costing money every
 *      month until it is handed back, and nothing else in the product will ever do it — the
 *      customer's own delete flow only touches lines they bought.
 *   2. **Pause trial workspaces whose grants have run out** of time. Without this, a 7-day trial
 *      with granted minutes left over would go on answering calls on day 40.
 *   3. **Re-check live minute caps.** Belt and braces for job 3 of `enforceTrialVoiceCap`: a webhook
 *      that never arrived, or arrived while the DB was down, would otherwise leave a spent trial
 *      running until a human noticed.
 *
 * Per-org failures are logged and skipped, never thrown — one workspace with a Vapi hiccup must not
 * stop the sweep from retiring the other twelve.
 */
export async function runGrantSweep(now: Date = new Date()): Promise<GrantSweepResult> {
  const result: GrantSweepResult = {
    ok: true,
    grantsExpired: 0,
    linesReleased: 0,
    workspacesPaused: 0,
    capsEnforced: 0,
  };

  // ---- 1 + 2: grants whose window has closed -------------------------------------------------
  const { data: lapsed, error } = await supabaseAdmin
    .from("org_grants")
    .select("id, org_id, kind, amount, starts_at, expires_at, status, note, granted_by, created_at")
    .eq("status", "active")
    .lte("expires_at", now.toISOString());

  if (error) {
    // Includes "table does not exist" before the migration is applied, which is not a failure of
    // this sweep — there is simply nothing to retire yet.
    logEvent({
      tag: "[TRIAL][SWEEP][READ_FAILED]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "warn",
      details: { error: error.message },
    });
    return { ...result, ok: false };
  }

  const byOrg = new Map<string, GrantRow[]>();
  for (const row of (lapsed ?? []) as GrantRow[]) {
    const list = byOrg.get(row.org_id) ?? [];
    list.push(row);
    byOrg.set(row.org_id, list);
  }

  for (const [orgId, rows] of byOrg) {
    try {
      for (const row of rows) {
        if (row.kind === "phone_numbers") {
          result.linesReleased += await releaseLinesForGrant(orgId, row.id);
        }
      }

      /*
       * Mark the grants retired.
       *
       * Cosmetic, and deliberately last: `isGrantLive` already reads a lapsed grant as dead from
       * its dates alone, so nothing depends on this write landing. If it fails, the workspace's
       * entitlement is still correct and the row is simply retried tomorrow.
       */
      const ids = rows.map((r) => r.id);
      await supabaseAdmin
        .from("org_grants")
        .update({ status: "revoked", revoked_at: now.toISOString() })
        .in("id", ids);
      result.grantsExpired += ids.length;

      // Anything still live? A workspace on two overlapping trials keeps its phones.
      const remaining = await getActiveGrants(orgId, now);
      if (remaining.voiceMinutes <= 0 && !(await hasPaidVoicePlan(orgId)) && (await workspaceIsActive(orgId))) {
        await pauseWorkspace(orgId, "trial_ended", { trigger: "trial_window_expired" });
        result.workspacesPaused++;
      }
    } catch (err) {
      logEvent({
        tag: "[TRIAL][SWEEP][ORG_FAILED]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId,
        severity: "error",
        details: { error: err instanceof Error ? err.message : String(err) },
      });
      result.ok = false;
    }
  }

  // ---- 3: live grants that have burned through their minutes ---------------------------------
  const { data: liveVoice } = await supabaseAdmin
    .from("org_grants")
    .select("org_id")
    .eq("status", "active")
    .eq("kind", "voice_minutes")
    .gt("expires_at", now.toISOString());

  for (const orgId of new Set((liveVoice ?? []).map((r) => (r as { org_id: string }).org_id))) {
    const outcome = await enforceTrialVoiceCap(orgId);
    if (outcome.paused) {
      result.capsEnforced++;
      result.workspacesPaused++;
    }
  }

  logEvent({
    tag: "[TRIAL][SWEEP][SUMMARY]",
    ts: Date.now(),
    stage: "COST",
    source: "system",
    severity: "info",
    details: { ...result },
  });

  return result;
}

/** Hand every line this grant paid for back to Vapi. Returns how many were released. */
export async function releaseLinesForGrant(orgId: string, grantId: string): Promise<number> {
  const { data: lines, error } = await supabaseAdmin
    .from("phone_lines")
    .select("id")
    .eq("org_id", orgId)
    .eq("grant_id", grantId);

  if (error || !lines || lines.length === 0) return 0;

  let released = 0;
  for (const line of lines as Array<{ id: string }>) {
    const outcome = await releaseGrantedLine({ orgId, lineId: line.id });
    if (outcome.ok) released++;
  }
  return released;
}
