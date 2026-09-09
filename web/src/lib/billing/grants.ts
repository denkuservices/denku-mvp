import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { billableMinutesForCalls } from "@/lib/billing/usageMath";

/**
 * Capacity Denku GAVE a workspace, as opposed to capacity it bought.
 *
 * A trial is "30 voice minutes and one chat channel for 7 days, so they can see it work before
 * they pay". The obvious implementation — write the matching `billing_org_addons` row and delete
 * it later — is the one this deliberately does not do, for the reason `chatEntitlement.ts` already
 * states about the internal workspace: those rows are what every revenue figure in the product is
 * computed from, and a $299 line item nobody paid becomes a number somebody eventually acts on.
 *
 * **The date is enforced HERE, in the reader, not by the sweep that tidies rows.** That rule is
 * copied verbatim from `addonSchedule.ts` and for the same reason: the only scheduled jobs in this
 * product run on the order of a day, so a workspace must not keep capacity that lapsed at 3am
 * merely because nothing has run since. The sweep in `trialEnforcement.ts` exists to take away the
 * things a reader cannot — a live phone line, an unpaused workspace — never to decide entitlement.
 *
 * Everything fails to ZERO: a broken read, a table that has not been migrated yet, a malformed
 * row. Handing out capacity nobody granted is the failure this module must not have.
 */

export const GRANT_KINDS = ["voice_minutes", "chat_slots", "phone_numbers"] as const;
export type GrantKind = (typeof GRANT_KINDS)[number];

export function isGrantKind(value: unknown): value is GrantKind {
  return typeof value === "string" && (GRANT_KINDS as readonly string[]).includes(value);
}

export interface GrantRow {
  id: string;
  org_id: string;
  kind: string;
  amount: number | string | null;
  starts_at: string;
  expires_at: string;
  status: string;
  note: string | null;
  granted_by: string | null;
  created_at: string;
}

export interface ActiveGrants {
  voiceMinutes: number;
  chatSlots: number;
  phoneNumbers: number;
  /** When the FIRST live grant lapses — what a countdown should show. Null when there are none. */
  endsAt: string | null;
  /** The earliest start among live voice grants: where trial minute consumption is measured from. */
  voiceMinutesSince: string | null;
  live: GrantRow[];
}

export const NO_GRANTS: ActiveGrants = {
  voiceMinutes: 0,
  chatSlots: 0,
  phoneNumbers: 0,
  endsAt: null,
  voiceMinutesSince: null,
  live: [],
};

function toAmount(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/**
 * Is this grant in force at `now`?
 *
 * A revoked grant is dead the instant it is revoked — there is no "already paid for, so keep it
 * until the period ends" rule here, because nobody paid. That is the one place this policy
 * deliberately differs from `addonSchedule.ts`.
 */
export function isGrantLive(row: GrantRow, now: Date = new Date()): boolean {
  if (row.status !== "active") return false;
  const starts = Date.parse(row.starts_at);
  const ends = Date.parse(row.expires_at);
  if (!Number.isFinite(starts) || !Number.isFinite(ends)) return false;
  const t = now.getTime();
  return starts <= t && t < ends;
}

/** Fold rows into the three capacity numbers. Pure, so the rules are testable without a DB. */
export function summarizeGrants(rows: GrantRow[], now: Date = new Date()): ActiveGrants {
  const live = rows.filter((r) => isGrantLive(r, now));
  if (live.length === 0) return NO_GRANTS;

  let voiceMinutes = 0;
  let chatSlots = 0;
  let phoneNumbers = 0;
  let endsAt: number | null = null;
  let voiceSince: number | null = null;

  for (const row of live) {
    const amount = toAmount(row.amount);

    if (row.kind === "voice_minutes") {
      voiceMinutes += amount;
      const starts = Date.parse(row.starts_at);
      // Consumption is counted from the EARLIEST live voice grant. Topping a trial up mid-week
      // must add minutes, not silently forgive the ones already spent by moving the window.
      if (voiceSince === null || starts < voiceSince) voiceSince = starts;
    } else if (row.kind === "chat_slots") {
      chatSlots += amount;
    } else if (row.kind === "phone_numbers") {
      phoneNumbers += amount;
    } else {
      // An unknown kind grants nothing, and must not extend the countdown either. A migration
      // that adds a kind has to teach this function about it.
      continue;
    }

    const ends = Date.parse(row.expires_at);
    if (endsAt === null || ends < endsAt) endsAt = ends;
  }

  return {
    voiceMinutes,
    chatSlots,
    phoneNumbers,
    endsAt: endsAt === null ? null : new Date(endsAt).toISOString(),
    voiceMinutesSince: voiceSince === null ? null : new Date(voiceSince).toISOString(),
    live,
  };
}

/** Every grant on one workspace that is in force right now. Never throws; empty on any failure. */
export async function getActiveGrants(orgId: string, now: Date = new Date()): Promise<ActiveGrants> {
  if (!orgId) return NO_GRANTS;

  try {
    const { data, error } = await supabaseAdmin
      .from("org_grants")
      .select("id, org_id, kind, amount, starts_at, expires_at, status, note, granted_by, created_at")
      .eq("org_id", orgId)
      .eq("status", "active")
      // Cheap server-side narrowing; `isGrantLive` still decides, so a clock difference between
      // Postgres and the runtime can only widen what is fetched, never what is granted.
      .gt("expires_at", now.toISOString());

    // Covers the pre-migration case (relation does not exist), which must read as "no grants"
    // rather than throw inside a webhook.
    if (error || !data) return NO_GRANTS;

    return summarizeGrants(data as GrantRow[], now);
  } catch {
    return NO_GRANTS;
  }
}

/** Every grant ever recorded on one workspace, newest first — the operator's history view. */
export async function listGrantsForOrg(orgId: string, limit = 50): Promise<GrantRow[]> {
  if (!orgId) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("org_grants")
      .select("id, org_id, kind, amount, starts_at, expires_at, status, note, granted_by, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as GrantRow[];
  } catch {
    return [];
  }
}

/**
 * Every grant on every workspace, newest first — the operator console's history.
 *
 * ONE query rather than one per workspace. The console lists 43 of them and climbing, and asking
 * per-org meant either 43 round trips or the compromise the page shipped with: history fetched only
 * for workspaces holding a LIVE grant, so a withdrawn one vanished from the panel the moment it was
 * withdrawn — exactly when the operator is looking for confirmation that it happened.
 *
 * Bounded by `limit` rather than paged: grants are handed out by a human, one at a time, and a
 * platform that has issued more than a few hundred has earned a proper screen.
 */
export async function listAllGrants(limit = 500): Promise<GrantRow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("org_grants")
      .select("id, org_id, kind, amount, starts_at, expires_at, status, note, granted_by, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as GrantRow[];
  } catch {
    return [];
  }
}

/**
 * Billable minutes this workspace has spent since `since`.
 *
 * `ceil(seconds / 60)` **per call**, matching `org_daily_usage` exactly — a trial that counted
 * minutes differently from the invoice would teach the customer a number that changes the day they
 * start paying. `billableMinutesForCalls` is the golden-master mirror of that SQL (R-075), so the
 * two cannot drift without a test failing.
 *
 * Only finished calls count. An in-flight call has no duration yet, which is also why the cap can
 * overshoot by one call — see `trialEnforcement.ts`.
 */
export async function voiceMinutesUsedSince(orgId: string, since: string): Promise<number> {
  if (!orgId || !since) return 0;
  try {
    const { data, error } = await supabaseAdmin
      .from("calls")
      .select("duration_seconds")
      .eq("org_id", orgId)
      .not("ended_at", "is", null)
      .gte("ended_at", since);

    if (error || !data) return 0;
    return billableMinutesForCalls(
      data.map((r) => (r as { duration_seconds: number | null }).duration_seconds)
    );
  } catch {
    return 0;
  }
}

export interface TrialVoiceStatus {
  /** True when a live `voice_minutes` grant exists at all. */
  active: boolean;
  granted: number;
  used: number;
  remaining: number;
  /** True when the allowance is spent — the signal to pause. */
  exhausted: boolean;
  endsAt: string | null;
}

export const NO_TRIAL_VOICE: TrialVoiceStatus = {
  active: false,
  granted: 0,
  used: 0,
  remaining: 0,
  exhausted: false,
  endsAt: null,
};

/** Pure: turn an allowance and a consumption into the status the UI and the sweep both read. */
export function trialVoiceStatus(granted: number, used: number, endsAt: string | null): TrialVoiceStatus {
  if (granted <= 0) return NO_TRIAL_VOICE;
  return {
    active: true,
    granted,
    used,
    remaining: Math.max(0, granted - used),
    exhausted: used >= granted,
    endsAt,
  };
}

/** Where a trial workspace stands on its granted minutes. The extra query runs only when granted. */
export async function getTrialVoiceStatus(orgId: string, now: Date = new Date()): Promise<TrialVoiceStatus> {
  const grants = await getActiveGrants(orgId, now);
  if (grants.voiceMinutes <= 0 || !grants.voiceMinutesSince) return NO_TRIAL_VOICE;
  const used = await voiceMinutesUsedSince(orgId, grants.voiceMinutesSince);
  return trialVoiceStatus(grants.voiceMinutes, used, grants.endsAt);
}
