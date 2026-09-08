import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";
import { logEvent } from "@/lib/observability/logEvent";
import { isGrantKind, type GrantKind, type GrantRow } from "@/lib/billing/grants";
import { releaseLinesForGrant } from "@/lib/billing/trialEnforcement";
import { provisionGrantedLine } from "@/lib/vapi/grantedLine";
import { resumeWorkspace } from "@/lib/workspace/pause";

/**
 * Writing and withdrawing grants — the one place capacity is given away.
 *
 * The validation here is not ceremony. Every field on this form is a number an operator types by
 * hand into a box that spends money or hands out service, and the difference between `30` and
 * `3000` minutes is two keystrokes. So each kind has a ceiling chosen to be comfortably above any
 * real trial and comfortably below an accident, and the route is the only writer.
 */

/**
 * Per-kind ceilings.
 *
 * `phone_numbers` is the tightest because it is the only kind that spends money the moment it is
 * used: each granted line is a rented number billing monthly until something releases it. Two is
 * more than any trial has ever needed.
 */
export const GRANT_LIMITS: Record<GrantKind, { max: number; unit: string }> = {
  voice_minutes: { max: 2000, unit: "minutes" },
  chat_slots: { max: 5, unit: "channels" },
  phone_numbers: { max: 2, unit: "numbers" },
};

export const MAX_GRANT_DAYS = 365;

export interface CreateGrantInput {
  orgId: string;
  kind: string;
  amount: number;
  days: number;
  note?: string | null;
  /** The platform operator's auth user id — recorded so a grant is always attributable. */
  actorUserId: string;
  /**
   * For `phone_numbers` only: also buy a real Vapi number and bind it, rather than merely raising
   * the cap. Off by default, because raising a cap is free and buying a number is not.
   */
  provisionLine?: boolean;
  preferredAreaCode?: string | null;
}

export type CreateGrantResult =
  | { ok: true; grant: GrantRow; line?: { lineId: string; phoneNumberE164: string | null } }
  | { ok: false; status: number; error: string };

/** Pure: is this a grant we are willing to write? Separated so the rules are testable. */
export function validateGrantInput(input: {
  kind: string;
  amount: number;
  days: number;
}): { ok: true; kind: GrantKind } | { ok: false; error: string } {
  if (!isGrantKind(input.kind)) return { ok: false, error: "Unknown grant kind" };

  const amount = Math.trunc(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Amount must be above zero" };

  const limit = GRANT_LIMITS[input.kind];
  if (amount > limit.max) {
    return { ok: false, error: `At most ${limit.max} ${limit.unit} per grant` };
  }

  const days = Math.trunc(Number(input.days));
  if (!Number.isFinite(days) || days <= 0) return { ok: false, error: "Duration must be at least one day" };
  if (days > MAX_GRANT_DAYS) return { ok: false, error: `At most ${MAX_GRANT_DAYS} days per grant` };

  return { ok: true, kind: input.kind };
}

export async function createGrant(input: CreateGrantInput): Promise<CreateGrantResult> {
  const validation = validateGrantInput(input);
  if (!validation.ok) return { ok: false, status: 400, error: validation.error };
  const kind = validation.kind;

  const { data: org } = await supabaseAdmin
    .from("orgs")
    .select("id, name")
    .eq("id", input.orgId)
    .maybeSingle<{ id: string; name: string | null }>();
  if (!org) return { ok: false, status: 404, error: "Workspace not found" };

  const startsAt = new Date();
  const expiresAt = new Date(startsAt.getTime() + Math.trunc(input.days) * 24 * 60 * 60 * 1000);

  const { data: grant, error } = await supabaseAdmin
    .from("org_grants")
    .insert({
      org_id: input.orgId,
      kind,
      amount: Math.trunc(input.amount),
      starts_at: startsAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      status: "active",
      note: (input.note ?? "").trim().slice(0, 500) || null,
      granted_by: input.actorUserId,
    })
    .select("id, org_id, kind, amount, starts_at, expires_at, status, note, granted_by, created_at")
    .single<GrantRow>();

  if (error || !grant) {
    return {
      ok: false,
      status: 500,
      // The pre-migration case reads like any other write failure, which is the right shape: the
      // operator is told it did not happen rather than being shown a grant that does not exist.
      error: error?.message ?? "Could not record the grant",
    };
  }

  /*
   * A trial workspace that was paused when its LAST trial ran out has to be let back in, or the
   * grant is invisible: the capacity is there and the phones stay unbound. Only a `trial_ended`
   * pause is lifted — a workspace paused for non-payment or by hand keeps that pause, because
   * neither is a decision this grant is entitled to overturn.
   */
  await resumeIfTrialPaused(input.orgId);

  let line: { lineId: string; phoneNumberE164: string | null } | undefined;
  if (kind === "phone_numbers" && input.provisionLine) {
    const provisioned = await provisionGrantedLine({
      orgId: input.orgId,
      grantId: grant.id,
      createdBy: input.actorUserId,
      preferredAreaCode: input.preferredAreaCode ?? null,
    });

    if (!provisioned.ok) {
      /*
       * The grant stays. It is a raised cap that costs nothing, the operator can retry the
       * provisioning, and deleting it here would leave the workspace without the entitlement the
       * operator has already decided to give. What must not happen — a Vapi number bought with no
       * row pointing at it — is handled inside `provisionGrantedLine`'s own rollback.
       */
      logEvent({
        tag: "[GRANT][LINE][PROVISION_FAILED_AFTER_GRANT]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: input.orgId,
        severity: "error",
        details: { grant_id: grant.id, error: provisioned.error },
      });
    } else {
      line = { lineId: provisioned.lineId!, phoneNumberE164: provisioned.phoneNumberE164 ?? null };
    }
  }

  await auditGrant(grant, input.orgId, "platform.grant.create", {
    kind: { before: null, after: kind },
    amount: { before: null, after: String(grant.amount) },
    expires_at: { before: null, after: grant.expires_at },
    ...(line ? { phone_line: { before: null, after: line.phoneNumberE164 ?? line.lineId } } : {}),
  });

  logEvent({
    tag: "[GRANT][CREATED]",
    ts: Date.now(),
    stage: "COST",
    source: "system",
    org_id: input.orgId,
    severity: "warn",
    details: {
      grant_id: grant.id,
      kind,
      amount: grant.amount,
      expires_at: grant.expires_at,
      provisioned_line: Boolean(line),
    },
  });

  return { ok: true, grant, line };
}

export type RevokeGrantResult =
  | { ok: true; linesReleased: number }
  | { ok: false; status: number; error: string };

/**
 * Withdraw a grant now.
 *
 * Revocation is immediate — `isGrantLive` reads `status` before it reads the dates — and it takes
 * back the expensive thing as well as the entitlement: any line this grant paid for is handed back
 * to Vapi, because a revoked trial that leaves a rented number behind bills every month for a
 * customer who is no longer trying the product.
 */
export async function revokeGrant(input: {
  grantId: string;
  actorUserId: string;
}): Promise<RevokeGrantResult> {
  const { data: grant } = await supabaseAdmin
    .from("org_grants")
    .select("id, org_id, kind, amount, starts_at, expires_at, status, note, granted_by, created_at")
    .eq("id", input.grantId)
    .maybeSingle<GrantRow>();

  if (!grant) return { ok: false, status: 404, error: "Grant not found" };
  if (grant.status !== "active") return { ok: false, status: 409, error: "Grant is already withdrawn" };

  /*
   * Release the lines FIRST, then mark the grant revoked.
   *
   * This order is the one that fails safe. If the release works and the status write does not, the
   * grant is revoked again on the next attempt and finds no lines left — harmless. The reverse
   * order can leave a revoked grant whose rented number nothing will ever look for again, because
   * `releaseLinesForGrant` is only ever reached through a grant that is being retired.
   */
  const linesReleased = await releaseLinesForGrant(grant.org_id, grant.id);

  const { error } = await supabaseAdmin
    .from("org_grants")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: input.actorUserId,
    })
    .eq("id", grant.id)
    .eq("status", "active");

  if (error) return { ok: false, status: 500, error: error.message };

  await auditGrant(grant, grant.org_id, "platform.grant.revoke", {
    status: { before: "active", after: "revoked" },
    lines_released: { before: null, after: String(linesReleased) },
  });

  logEvent({
    tag: "[GRANT][REVOKED]",
    ts: Date.now(),
    stage: "COST",
    source: "system",
    org_id: grant.org_id,
    severity: "warn",
    details: { grant_id: grant.id, kind: grant.kind, lines_released: linesReleased },
  });

  return { ok: true, linesReleased };
}

/** Lift a `trial_ended` pause, and only that one. Never throws — a grant must not fail on it. */
async function resumeIfTrialPaused(orgId: string): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from("organization_settings")
      .select("workspace_status, paused_reason")
      .eq("org_id", orgId)
      .maybeSingle<{ workspace_status: string | null; paused_reason: string | null }>();

    if (data?.workspace_status === "paused" && data.paused_reason === "trial_ended") {
      await resumeWorkspace(orgId, { trigger: "grant_created" });
    }
  } catch (err) {
    logEvent({
      tag: "[GRANT][RESUME_AFTER_GRANT][FAILED]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}

/**
 * Record the grant in the CUSTOMER's audit log, with no actor.
 *
 * The workspace should be able to see that its capacity changed and when the trial ends — that is
 * their own history. What they should not be handed is the operator's identity: `actor_user_id`
 * stays null so the entry renders as a system action rather than publishing a Denku staff email
 * into a customer-facing screen. The operator-side detail lives in the structured log instead.
 */
async function auditGrant(
  grant: GrantRow,
  orgId: string,
  action: string,
  diff: Record<string, { before: unknown; after: unknown }>
): Promise<void> {
  try {
    await logAuditEvent({
      org_id: orgId,
      actor_user_id: null,
      action,
      entity_type: "org_grant",
      entity_id: grant.id,
      diff,
    });
  } catch {
    // An audit write must never be the reason a grant fails; `logAuditEvent` already swallows its
    // own errors, and this catch covers the case where the table itself is unreachable.
  }
}
