import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";

/**
 * Link a backing agent to the Vapi phone number it answers on.
 *
 * **Why this exists as its own helper:** `agents.vapi_phone_number_id` is not decoration —
 * it is what workspace pause enforcement reads. `unbindOrgPhoneNumbers` /
 * `rebindOrgPhoneNumbers` (lib/vapi/phoneNumberBinding.ts) select agents where BOTH
 * `vapi_assistant_id` AND `vapi_phone_number_id` are non-null. An agent missing this column
 * is invisible to them, so its phone number is never PATCHed to `assistantId: null` and the
 * line KEEPS ANSWERING on a paused workspace. The phone-line purchase route wrote the number
 * id only onto `phone_lines`, which is exactly how that hole appeared; the backfill in
 * `supabase/migrations/20260829125306_backfill_agent_phone_number_link.sql` closes it for
 * rows created before this helper existed.
 *
 * Every path that provisions or connects a number for a backing agent must call this —
 * onboarding activation, phone-line purchase, and (when it lands) the BYO SIP connect path
 * (see docs/BYO_PHONE_NUMBERS_PLAN.md §3).
 *
 * Contract: org-scoped, idempotent, and **never throws** — a purchase that has already taken
 * the customer's money must not be rolled back over a link write. Callers log the returned
 * error; the backfill migration is the safety net.
 */
export interface LinkAgentToPhoneNumberInput {
  orgId: string;
  agentId: string;
  vapiPhoneNumberId: string;
}

export interface LinkAgentToPhoneNumberResult {
  ok: boolean;
  error?: string;
}

export async function linkAgentToPhoneNumber(
  input: LinkAgentToPhoneNumberInput
): Promise<LinkAgentToPhoneNumberResult> {
  const { orgId, agentId, vapiPhoneNumberId } = input;

  if (!orgId || !agentId || !vapiPhoneNumberId) {
    return { ok: false, error: "linkAgentToPhoneNumber: missing orgId, agentId or vapiPhoneNumberId" };
  }

  try {
    const { error } = await supabaseAdmin
      .from("agents")
      .update({
        vapi_phone_number_id: vapiPhoneNumberId,
        updated_at: new Date().toISOString(),
      })
      // org scope is mandatory on every service-role write (no RLS backstop here).
      .eq("org_id", orgId)
      .eq("id", agentId);

    if (error) {
      // `agents_vapi_phone_number_id_uq` is a partial unique index: a duplicate means the
      // number is already claimed by another agent row, which is a real inconsistency the
      // operator must see, not something to retry blindly.
      logEvent({
        tag: "[VAPI][BINDING][AGENT_NUMBER_LINK][FAILED]",
        ts: Date.now(),
        stage: "CALL",
        source: "system",
        org_id: orgId,
        severity: "error",
        details: {
          agent_id: agentId,
          phone_number_id: vapiPhoneNumberId,
          error: error.message,
          error_code: error.code,
          consequence: "workspace pause will not unbind this line until backfilled",
        },
      });
      return { ok: false, error: error.message };
    }

    logEvent({
      tag: "[VAPI][BINDING][AGENT_NUMBER_LINK][OK]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "info",
      details: { agent_id: agentId, phone_number_id: vapiPhoneNumberId },
    });

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      logEvent({
        tag: "[VAPI][BINDING][AGENT_NUMBER_LINK][FAILED]",
        ts: Date.now(),
        stage: "CALL",
        source: "system",
        org_id: orgId,
        severity: "error",
        details: {
          agent_id: agentId,
          phone_number_id: vapiPhoneNumberId,
          error: message,
          consequence: "workspace pause will not unbind this line until backfilled",
        },
      });
    } catch {
      // Never throw from logging.
    }
    return { ok: false, error: message };
  }
}
